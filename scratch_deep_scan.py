import json
import re
from pathlib import Path

js_files = ["core.js", "deals.js", "calls.js", "charts.js", "analyst.js", "settings.js", "admin.js"]
js_dir = Path("apps/web/js")

index_html = Path("apps/web/index.html").read_text(encoding="utf-8")

print("=== [1] SCANNING FOR MOCK/STUB/PLACEHOLDER PATTERNS IN JS ===")
suspicious_patterns = [
    (r'showToast\([\'\"][^\'\"]*[\'\"]\s*,\s*[\'\"][^\'\"]*(?:скоро|разработк|заглушк|демо|fake|mock|stub|в разработке)[^\'\"]*[\'\"]\)', "Toast mentions 'скоро/в разработке'"),
    (r'alert\([^\)]*\)', "alert() call (instead of UI toast/modal)"),
    (r'console\.log\([\'\"][^\'\"]*(?:todo|fixme|stub|mock|not implemented)[^\'\"]*[\'\"]\)', "Console log TODO/mock"),
    (r'MOCK_|mockData|fakeData|demoCalls|sampleDeals', "Mock data arrays"),
    (r'function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{\s*\}', "Empty function"),
    (r'function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{\s*return\s*;?\s*\}', "No-op return function"),
    (r'href=["\']#["\']\s*onclick=["\'](?:\s*return\s+false;?)?["\']', "Dead link/button #"),
]

findings = []

for js_name in js_files:
    fpath = js_dir / js_name
    if not fpath.exists():
        continue
    content = fpath.read_text(encoding="utf-8")
    for pattern, desc in suspicious_patterns:
        matches = re.finditer(pattern, content, re.IGNORECASE)
        for m in matches:
            line_no = content[:m.start()].count('\n') + 1
            matched_text = m.group(0).strip().replace('\n', ' ')[:100]
            findings.append({
                "file": js_name,
                "line": line_no,
                "type": desc,
                "snippet": matched_text
            })

print(f"Total suspicious patterns found in JS: {len(findings)}")

# Check index.html for dead buttons / empty handlers / 'скоро'
print("\n=== [2] SCANNING INDEX.HTML BUTTONS & HANDLERS ===")
buttons = re.findall(r'<button\b([^>]*)>(.*?)</button>', index_html, re.DOTALL)
dead_buttons = []
for attrs, inner in buttons:
    clean_inner = re.sub(r'<[^>]+>', ' ', inner).strip()
    clean_inner = re.sub(r'\s+', ' ', clean_inner)[:50]
    has_onclick = 'onclick=' in attrs
    onclick_match = re.search(r'onclick="([^"]*)"', attrs)
    onclick_val = onclick_match.group(1).strip() if onclick_match else ""
    
    # Check for empty or no-op
    if not has_onclick and 'type="submit"' not in attrs:
        dead_buttons.append({"text": clean_inner, "reason": "No onclick and not type=submit", "attrs": attrs[:120]})
    elif onclick_val in ("", "return false;", "void(0);"):
        dead_buttons.append({"text": clean_inner, "reason": "Empty or no-op onclick", "attrs": attrs[:120]})
    elif any(word in onclick_val.lower() for word in ['alert', 'скоро', 'разработк']):
        dead_buttons.append({"text": clean_inner, "reason": f"Suspicious onclick: {onclick_val}", "attrs": attrs[:120]})

print(f"Total potentially dead/stub buttons in index.html: {len(dead_buttons)}")

with open("scratch_audit_findings.json", "w", encoding="utf-8") as f:
    json.dump({"js_findings": findings, "dead_buttons": dead_buttons}, f, ensure_ascii=False, indent=2)

print("\nSaved report to scratch_audit_findings.json")
