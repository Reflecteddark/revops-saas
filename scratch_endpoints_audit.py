import re
import json
from pathlib import Path

js_dir = Path("apps/web/js")
endpoints_map = {}

for js_path in js_dir.glob("*.js"):
    content = js_path.read_text(encoding="utf-8")
    # match fetch(...) or adminFetch(...)
    matches = re.finditer(r'(?:fetch|adminFetch)\s*\(\s*([`\'\"][^`\'\"]+[`\'\"])', content)
    for m in matches:
        url = m.group(1).strip("'\"`")
        line = content[:m.start()].count('\n') + 1
        endpoints_map.setdefault(url, []).append({
            "file": js_path.name,
            "line": line
        })

print("=== FRONTEND ENDPOINT CALLS ===")
for ep, callers in sorted(endpoints_map.items()):
    print(f"\nEndpoint: {ep}")
    for c in callers:
        print(f"  -> {c['file']}:{c['line']}")

with open("scratch_endpoints_audit.json", "w", encoding="utf-8") as f:
    json.dump(endpoints_map, f, ensure_ascii=False, indent=2)
