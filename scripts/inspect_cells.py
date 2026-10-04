import json
import sys

if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

with open("calc_engine_cells.json", "r", encoding="utf-8") as f:
    cells = json.load(f)

print(f"Total evaluated cells in calc_engine: {len(cells)}")
for coord in ["B1", "B16", "B17", "B18", "B19", "B20", "B21", "B22", "B23", "B27", "B31", "B32", "B33", "B35", "B137", "C137", "D137", "E137", "B144", "B145", "B146"]:
    if coord in cells:
        print(f"  {coord}: {cells[coord]}")
