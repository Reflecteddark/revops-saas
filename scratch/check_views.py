import json

with open('apps/web/index.html', encoding='utf-8') as f:
    text = f.read()

import re
view_ids = re.findall(r'<div[^>]*id="(view-[^"]+)"', text)
print("View IDs in apps/web/index.html:", view_ids)

nav_tabs = re.findall(r'onclick="switchTab\(\'([^\']+)\'', text)
print("Nav switchTab targets:", list(dict.fromkeys(nav_tabs)))
