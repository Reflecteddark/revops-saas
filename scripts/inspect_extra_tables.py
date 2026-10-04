import json
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open("golden_master_seed.json", "r", encoding="utf-8") as f:
    seed = json.load(f)

for key in ["🎯 Action_Center", "📅 Deal_Event_Log", "📊 Stage_History", "📋 Data_Contract", "🆔 ID_Registry"]:
    rows = seed.get(key, [])
    print(f"\n=== {key} ({len(rows)} rows) ===")
    if rows:
        print("First row:", rows[0])
