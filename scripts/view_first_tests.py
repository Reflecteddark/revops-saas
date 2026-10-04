import json
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open("tests_v17_dump.json", "r", encoding="utf-8") as f:
    tests = json.load(f)

for t in tests[:63]:
    print(f"{t['id']}: expected={t.get('expected')} fact={t.get('fact')} status={t.get('status')} | {t.get('desc')}")
