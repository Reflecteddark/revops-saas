import json
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open("tests_v17_dump.json", "r", encoding="utf-8") as f:
    tests = json.load(f)

print(f"Total tests: {len(tests)}")
categories = {}
for t in tests:
    cat = t.get("cat", "Unknown")
    categories.setdefault(cat, []).append(t)

for cat, items in categories.items():
    print(f"\n=== Category: {cat} ({len(items)} tests) ===")
    for t in items:
        print(f"  {t['id']}: expected={t.get('expected')} fact={t.get('fact')} | {t.get('desc')}")
