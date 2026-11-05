"""
Pilot B (contract v2): the automatic part of the thresholds of docs/audit/spec_contract_v2.md section 6.
Usage (INSIDE revops-api): python analyze_b.py results1.jsonl [results2.jsonl ...] [--snippets]
Prints counts and call ids' last 6 characters; call text only with --snippets (digits masked), for hand labelling of CR5/CR6/CR13.
Scoring is the rule of n8n node 18: null only for CR5/6/13, CR11 by code (client words >= 30%), score = round(13*passed/applicable).
"""

import collections
import json
import re
import sys

SPLIT = re.compile(r"(Менеджер|Клиент(?: \d+)?)\s*:")
NULLABLE = (5, 6, 13)
PRICE = re.compile(r"дорог|дорож|дешевл|бюджет|не потян|слишком|накладн", re.I)
THINK = re.compile(r"подума|посоветов|обсуд|перезвон|позже|не сейчас|пришлите|отправьте|вышлите|на почту|в ватсап|в мессенджер|сам вам", re.I)
DISC = re.compile(r"скидк|уступ|акци|бонус|подар|бесплатн|пробн|предоплат|процент", re.I)


def parse(text):
    t = (text or "").strip()
    for _ in range(4):
        try:
            d = json.loads(t)
            return d[0] if isinstance(d, list) and d and isinstance(d[0], dict) else (d if isinstance(d, dict) else None)
        except ValueError:
            if not t.endswith("}"):
                return None
            t = t[:-1].rstrip()
    return None


def norm(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", str(s or "").lower().replace("ё", "е"))).strip()


def client_share(text):
    marks = list(SPLIT.finditer(text or ""))
    if not any(m[1] == "Менеджер" for m in marks) or not any(m[1] != "Менеджер" for m in marks):
        return None
    mgr = cli = 0
    for k, m in enumerate(marks):
        end = marks[k + 1].start() if k + 1 < len(marks) else len(text)
        n = len(text[m.end():end].split())
        if m[1] == "Менеджер":
            mgr += n
        else:
            cli += n
    return cli / (mgr + cli) if mgr + cli else None


def score(d):
    cr = {i: d.get(f"cr{i}") for i in range(1, 14)}
    share = client_share(d.get("transcript"))
    passed = applicable = 0
    for i, v in cr.items():
        if v is None and i in NULLABLE and f"cr{i}" in d:  # a MISSING field is a 0 in node 18, only an explicit null is n/a
            continue
        one = 1 if v in (1, "1", True) else 0
        if i == 11 and share is not None:
            one = 1 if share >= 0.3 else 0
        passed += one
        applicable += 1
    return passed, applicable, int(13 * passed / applicable + 0.5)  # Math.round of node 18, not Python's round


def band(s):
    return "эталон" if s >= 9 else ("норма" if s >= 6 else "срыв")


rows = []
for path in [a for a in sys.argv[1:] if not a.startswith("--")]:
    rows += [json.loads(x) for x in open(path, encoding="utf-8")]
ok = [r for r in rows if r.get("http") == 200 and r.get("variant") == "B"]
parsed = {(r["call_id"], r["run"], r.get("modelVersion")): parse(r.get("text")) for r in ok}  # the same call/run/model from two files counts once
good = {k: d for k, d in parsed.items() if d}
print(f"answers: {len(rows)} | http200: {len(ok)} | distinct: {len(parsed)} | parsed: {len(good)} | PARSE ERRORS: {len(parsed) - len(good)} (threshold 0)")
print("models:", dict(collections.Counter(k[2] for k in good)), "| finish:", dict(collections.Counter(r.get("finishReason") for r in ok)))

q_total = q_found = 0
labels = 0
for d in good.values():
    t = norm(d.get("transcript"))
    for e in (d.get("evidence") or {}).values():
        if isinstance(e, dict) and e.get("quote"):
            q_total += 1
            q_found += norm(e["quote"]) in t
    labels += client_share(d.get("transcript")) is not None
print(f"quotes found in the transcript: {q_found}/{q_total} = {100 * q_found // max(1, q_total)}% (threshold 90%)")
print(f"both roles labelled: {labels}/{len(good)} = {100 * labels // max(1, len(good))}% (threshold 95%)")

nulls = collections.Counter()
for d in good.values():
    for i in NULLABLE:
        nulls[i] += f"cr{i}" in d and d[f"cr{i}"] is None
bad_null = [(k[0][-6:], i) for k, d in good.items() for i in (1, 2, 3, 4, 7, 8, 9, 10, 11, 12) if d.get(f"cr{i}") is None]
print(f"null in CR5/CR6/CR13: {dict(nulls)} of {len(good)} answers | null in a criterion that may not be null: {len(bad_null)} {bad_null[:5]}")

# verdict stability: two runs of one call on one model
by_call = collections.defaultdict(dict)
for (cid, run, model), d in good.items():
    by_call[cid][(run, model)] = d
pairs = same = crit_same = crit_all = 0
for cid, runs in by_call.items():
    items = sorted(runs.items(), key=lambda kv: kv[0][0])
    for (ra, ma), da in items:
        for (rb, mb), db in items:
            if ma == mb and ra < rb:
                pairs += 1
                same += band(score(da)[2]) == band(score(db)[2])
                for i in range(1, 14):
                    crit_all += 1
                    crit_same += da.get(f"cr{i}") == db.get(f"cr{i}")
print(f"verdict equal between two runs of the same model: {same}/{pairs} (threshold 85%)" + (f" | criteria equal {crit_same}/{crit_all}" if crit_all else ""))

cr11_changed = sum(1 for d in good.values() if client_share(d.get("transcript")) is not None and (1 if client_share(d.get("transcript")) >= 0.3 else 0) != (1 if d.get("cr11") == 1 else 0))
print(f"CR11: the code disagrees with the model in {cr11_changed} of {len(good)}")
dist = collections.Counter(band(score(d)[2]) for d in good.values())
print("verdicts:", dict(dist), "| scores:", sorted(score(d)[2] for d in good.values()))

if "--snippets" in sys.argv:
    seen = set()
    for (cid, run, model), d in sorted(good.items()):
        if cid in seen:
            continue
        seen.add(cid)
        text = d.get("transcript") or ""
        ev = d.get("evidence") or {}
        print(f"\n### {cid[-6:]} run{run} {model} words={len(text.split())} client_share={client_share(text)}")
        for i, rx in ((5, PRICE), (6, THINK), (13, DISC)):
            e = ev.get(f"cr{i}") or {}
            print(f"  cr{i}={d.get(f'cr{i}')} | {e.get('why')}")
            shown = 0
            parts = SPLIT.split(text)
            for k in range(1, len(parts) - 1, 2):
                if rx.search(parts[k + 1]) and shown < 4:
                    print(f"     [{parts[k][:1]}] {re.sub(r'[0-9]', '#', parts[k + 1].strip())[:150]}")
                    shown += 1
