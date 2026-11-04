"""Counts and tokens of a pilot run (no call text). Usage: python summarize_pilot.py <results.jsonl>"""
import collections
import json
import sys

rows = [json.loads(x) for x in open(sys.argv[1], encoding="utf-8")]
print("results:", len(rows))
for v in sorted({r["variant"] for r in rows}):
    rs = [r for r in rows if r["variant"] == v]
    ok = [r for r in rs if r.get("http") == 200 and r.get("text")]
    strict = 0
    for r in ok:
        try:
            json.loads(r["text"])
            strict += 1
        except ValueError:
            pass
    tin = sum((r.get("usage") or {}).get("promptTokenCount") or 0 for r in rs)
    tout = sum((r.get("usage") or {}).get("candidatesTokenCount") or 0 for r in rs)
    tthink = sum((r.get("usage") or {}).get("thoughtsTokenCount") or 0 for r in rs)
    print(f"variant {v}: calls {len(rs)} | http200 with text {len(ok)} | strict JSON ok {strict} | finish {dict(collections.Counter(r.get('finishReason') for r in rs))}")
    print(f"   tokens: input {tin} | output {tout} | thinking {tthink} | per call in {tin // max(1, len(rs))} out {tout // max(1, len(rs))} | latency avg {round(sum(r.get('latency_s') or 0 for r in rs) / max(1, len(rs)), 1)}s")
    print(f"   modelVersion: {dict(collections.Counter(r.get('modelVersion') for r in rs))} | errors: {dict(collections.Counter(str(r.get('error'))[:40] for r in rs if r.get('error')))}")
