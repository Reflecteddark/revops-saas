import json
import sys

# Configure UTF-8 on Windows stdout
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open("golden_master_seed.json", "r", encoding="utf-8") as f:
    data = json.load(f)

print("Keys in golden_master_seed:")
for k, v in data.items():
    if isinstance(v, list):
        print(f"  {k}: {len(v)} rows")
    elif isinstance(v, dict):
        print(f"  {k}: dict with {len(v)} keys")
    else:
        print(f"  {k}: {type(v)}")
