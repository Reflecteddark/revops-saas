import re
import json
from pathlib import Path

index_html = Path("apps/web/index.html").read_text(encoding="utf-8")

views = re.findall(r'id="(view-[^"]+)"', index_html)
print("=== VIEWS IN INDEX.HTML ===")
for v in views:
    print(f" - {v}")

# Find all buttons in index.html
buttons = re.findall(r'<button\b([^>]*)>(.*?)</button>', index_html, re.DOTALL)
print(f"\nTotal buttons in index.html: {len(buttons)}")

# Group buttons by view / area
admin_buttons = []
cabinet_buttons = []

for attrs, inner in buttons:
    clean_inner = re.sub(r'<[^>]+>', ' ', inner).strip()
    clean_inner = re.sub(r'\s+', ' ', clean_inner)
    onclick_match = re.search(r'onclick="([^"]*)"', attrs)
    onclick = onclick_match.group(1) if onclick_match else ""
    btn_id_match = re.search(r'id="([^"]*)"', attrs)
    btn_id = btn_id_match.group(1) if btn_id_match else ""
    
    entry = {"id": btn_id, "text": clean_inner[:40], "onclick": onclick}
    if "admin" in attrs.lower() or "admin" in onclick.lower():
        admin_buttons.append(entry)
    else:
        cabinet_buttons.append(entry)

print(f"Admin buttons: {len(admin_buttons)}")
print(f"Cabinet buttons: {len(cabinet_buttons)}")

with open("scratch_buttons_audit.json", "w", encoding="utf-8") as f:
    json.dump({"views": views, "admin_buttons": admin_buttons, "cabinet_buttons": cabinet_buttons}, f, ensure_ascii=False, indent=2)

print("\nAudit summary saved to scratch_buttons_audit.json")
