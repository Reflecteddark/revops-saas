"""
Pilot: the current audit prompt (A) against contract v2 (B) on real recordings. Run INSIDE the revops-api container.

  python run_prompt_pilot.py --out /app/data/pilot/<stamp> [--variants A,B] [--runs 2] [--max-calls N] [--sleep 3]

Writes ONLY files in --out (results.jsonl, run.log). Nothing goes to the CRM, the cabinet, the database or the sheets:
the CRM is only read (call notes, to find a recording), Gemini is called through the same proxy as the n8n workflow.
Resumable: a (call, variant, run) already in results.jsonl is skipped. Prints counts and tokens, never call text or keys.
"""

import argparse
import base64
import json
import os
import time
from pathlib import Path
from urllib.parse import urlparse

import gspread
import requests

from apps.api.routers.calls_router import AUDIO_STORAGE_DIR, get_service_account_path
from apps.api.tenant_registry import get_tenant_config
from packages.monitoring.ai_probe import GEMINI_PROXY_KEY, GEMINI_PROXY_URL

HERE = Path(__file__).resolve().parent
TENANT = "TNT-004"
MODEL = "gemini-3-flash-preview"  # node 17, the first model of the chain

EVIDENCE = {
    "type": "OBJECT",
    "properties": {"why": {"type": "STRING"}, "quote": {"type": "STRING"}},
    "required": ["why", "quote"],
}
SCHEMA_B = {
    "type": "OBJECT",
    "properties": {
        "transcript": {"type": "STRING"},
        "call_type": {"type": "STRING"},
        "manager_name": {"type": "STRING"},
        "client_name": {"type": "STRING"},
        "client_position": {"type": "STRING"},
        "client_niche": {"type": "STRING"},
        **{f"cr{i}": {"type": "INTEGER", "nullable": i in (5, 6, 13)} for i in range(1, 14)},
        "evidence": {"type": "OBJECT", "properties": {f"cr{i}": EVIDENCE for i in range(1, 14)}, "required": [f"cr{i}" for i in range(1, 14)]},
        "ended_by": {"type": "STRING"},
        "reached_decision_maker": {"type": "BOOLEAN", "nullable": True},
        "error_summary": {"type": "STRING"},
        "ai_recommendation": {"type": "STRING"},
        "amo_short_summary": {"type": "STRING"},
        "zoom_scheduled": {"type": "BOOLEAN"},
    },
    "required": ["transcript", "call_type"] + [f"cr{i}" for i in range(1, 14)] + ["evidence", "error_summary", "ai_recommendation", "amo_short_summary"],
}


def load_calls(max_calls):
    """Answered calls of the tenant with a recording on this server, newest first."""
    cfg = get_tenant_config(TENANT) or {}
    gc = gspread.service_account(str(get_service_account_path()))
    rows = gc.open_by_key(cfg["spreadsheet_id"]).worksheet("raw_calls").get_all_values()
    hdr, data = rows[0], [r for r in rows[1:] if r and r[0]]
    idx = {h: i for i, h in enumerate(hdr)}
    cell = lambda r, k: (r[idx[k]].strip() if k in idx and len(r) > idx[k] else "")  # noqa: E731
    domain = (cfg.get("amo_domain") or "").replace("https://", "").strip("/")
    notes = []
    for page in (1, 2, 3):  # GET only
        resp = requests.get(
            f"https://{domain}/api/v4/leads/notes",
            params={"filter[note_type][]": ["call_in", "call_out"], "limit": 100, "page": page},
            headers={"Authorization": f"Bearer {cfg.get('amo_token')}"}, timeout=20,
        )
        if resp.status_code != 200:
            break
        notes += (resp.json().get("_embedded") or {}).get("notes") or []
    by_uniq = {(n.get("params") or {}).get("uniq"): n for n in notes}
    calls = []
    for r in reversed(data):
        if cell(r, "is_unanswered") == "1":
            continue
        n = by_uniq.get(r[0])
        path = AUDIO_STORAGE_DIR / os.path.basename(urlparse(((n or {}).get("params") or {}).get("link") or "").path) if n else None
        if path is None or not path.is_file():
            continue
        calls.append({"id": r[0], "date": cell(r, "call_date")[:10], "path": path})
    return calls[:max_calls] if max_calls else calls


RETRY_HTTP = (429, 500, 502, 503, 504, 520, 521, 522, 523, 524)  # 52x = the Cloudflare proxy timed out; 503 = model overloaded


def call_gemini(variant, prompt, audio_b64, model=MODEL, retries=4):
    body = {
        "contents": [{"parts": [{"inline_data": {"mime_type": "audio/mpeg", "data": audio_b64}}, {"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }
    if variant == "B":  # contract v2 also fixes the answer's shape; A stays exactly as production runs it
        # No maxOutputTokens: the "thinking" tokens count against it (a probe call spent 15 360 of 16 000 on thinking and
        # its answer was cut off), and A runs without one in production.
        body["generationConfig"]["responseSchema"] = SCHEMA_B
    url = f"{GEMINI_PROXY_URL}/v1beta/models/{model}:generateContent?key={GEMINI_PROXY_KEY}"
    last = None
    for attempt in range(retries):
        t0 = time.time()
        try:
            resp = requests.post(url, json=body, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}, timeout=180)
        except requests.RequestException as e:
            last = {"http": None, "error": type(e).__name__, "latency_s": round(time.time() - t0, 1)}
            time.sleep(5 * (attempt + 1))
            continue
        out = {"http": resp.status_code, "latency_s": round(time.time() - t0, 1), "attempts": attempt + 1}
        if resp.status_code == 200:
            j = resp.json()
            cand = (j.get("candidates") or [{}])[0]
            parts = (cand.get("content") or {}).get("parts") or [{}]
            out.update(
                text=parts[0].get("text", ""), finishReason=cand.get("finishReason"), modelVersion=j.get("modelVersion"),
                usage=j.get("usageMetadata"), blocked=(j.get("promptFeedback") or {}).get("blockReason"),
            )
            return out
        last = {**out, "error": resp.text[:200]}
        if resp.status_code not in RETRY_HTTP:
            return last
        time.sleep(10 * (attempt + 1))
    return last


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--variants", default="A,B")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--max-calls", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=3.0)
    ap.add_argument("--model", default=MODEL, help="Gemini model; the default is the first model of node 17")
    ap.add_argument("--plan", action="store_true", help="list the plan, call nothing")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    prompts = {v: (HERE / "prompts" / f"{v}_{'current' if v == 'A' else 'v2'}.txt").read_text(encoding="utf-8") for v in args.variants.split(",")}
    calls = load_calls(args.max_calls)
    done = set()
    results = out / "results.jsonl"
    if results.exists():
        for line in results.read_text(encoding="utf-8").splitlines():
            r = json.loads(line)
            done.add((r["call_id"], r["variant"], r["run"]))
    plan = [(run, c, v) for run in range(1, args.runs + 1) for c in calls for v in prompts if (c["id"], v, run) not in done]
    print(f"calls with a recording: {len(calls)} | variants {list(prompts)} | runs {args.runs} | to do {len(plan)} | done {len(done)}", flush=True)
    if args.plan:
        return
    quota_hits = 0
    for n, (run, c, v) in enumerate(plan, 1):
        audio_b64 = base64.b64encode(c["path"].read_bytes()).decode()
        res = call_gemini(v, prompts[v].replace("{CALL_DATE}", c["date"]), audio_b64, args.model)
        if res.get("http") != 200:
            # A failure is not a result: it is not written, so the next start repeats it. Three quota answers in a row
            # mean the quota is gone: stop instead of burning the retries.
            quota_hits = quota_hits + 1 if res.get("http") == 429 else 0
            print(f"[{n}/{len(plan)}] {v} run{run} http={res.get('http')} NOT SAVED", flush=True)
            if quota_hits >= 3:
                print("quota exhausted: stopping (run again later, finished calls are kept)", flush=True)
                return
            continue
        quota_hits = 0
        rec = {"call_id": c["id"], "variant": v, "run": run, "model_requested": args.model, "audio_bytes": c["path"].stat().st_size, **res}
        with results.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        u = res.get("usage") or {}
        print(f"[{n}/{len(plan)}] {v} run{run} http={res.get('http')} finish={res.get('finishReason')} in={u.get('promptTokenCount')} out={u.get('candidatesTokenCount')} think={u.get('thoughtsTokenCount')} {res.get('latency_s')}s", flush=True)
        time.sleep(args.sleep)
    print("finished", flush=True)


if __name__ == "__main__":
    main()
