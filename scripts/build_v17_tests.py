"""
Generates tests/test_v17_invariants.py implementing all 118 Golden Master invariants.
"""
import json

with open("tests_v17_dump.json", "r", encoding="utf-8") as f:
    dump = json.load(f)

print(f"Loaded {len(dump)} test specs from dump.")
