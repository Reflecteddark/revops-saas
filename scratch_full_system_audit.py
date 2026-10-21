import json
import re
from pathlib import Path

index_html = Path("apps/web/index.html").read_text(encoding="utf-8")
js_dir = Path("apps/web/js")

# Load all JS content
js_content = {}
all_js_functions = set()
for p in js_dir.glob("*.js"):
    text = p.read_text(encoding="utf-8")
    js_content[p.name] = text
    # Extract function names
    funcs = re.findall(r'function\s+([a-zA-Z0-9_$]+)\s*\(', text)
    funcs += re.findall(r'window\.([a-zA-Z0-9_$]+)\s*=', text)
    funcs += re.findall(r'(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>', text)
    all_js_functions.update(funcs)

print(f"Total discovered JS functions: {len(all_js_functions)}")

# Extract views with line ranges
view_matches = list(re.finditer(r'<div\s+id="(view-[^"]+)"[^>]*>', index_html))
view_ranges = []
for i, vm in enumerate(view_matches):
    start = vm.start()
    view_id = vm.group(1)
    end = view_matches[i+1].start() if i+1 < len(view_matches) else len(index_html)
    view_ranges.append((view_id, start, end))

def get_view_for_pos(pos):
    for vid, start, end in view_ranges:
        if start <= pos < end:
            return vid
    return "global / header / modal"

# Audit all buttons in index.html
button_regex = re.finditer(r'<button\b([^>]*)>(.*?)</button>', index_html, re.DOTALL)
audited_buttons = []

for bm in button_regex:
    pos = bm.start()
    attrs = bm.group(1)
    inner = bm.group(2)
    view = get_view_for_pos(pos)
    
    clean_inner = re.sub(r'<[^>]+>', ' ', inner).strip()
    clean_inner = re.sub(r'\s+', ' ', clean_inner)[:60]
    
    onclick_m = re.search(r'onclick="([^"]*)"', attrs)
    onclick = onclick_m.group(1).strip() if onclick_m else ""
    
    id_m = re.search(r'id="([^"]*)"', attrs)
    btn_id = id_m.group(1).strip() if id_m else ""
    
    # Analyze handler
    handler_func = ""
    handler_exists = False
    status = "OK"
    notes = []
    
    if onclick:
        # extract function name
        fn_m = re.match(r'([a-zA-Z0-9_$]+)\s*\(', onclick)
        if fn_m:
            handler_func = fn_m.group(1)
            handler_exists = handler_func in all_js_functions
            if not handler_exists:
                status = "MISSING_HANDLER"
                notes.append(f"Function {handler_func} not found in JS files")
        elif onclick in ("return false;", "void(0);"):
            status = "NO_OP"
            notes.append("Empty no-op onclick")
    else:
        if 'type="submit"' in attrs:
            status = "FORM_SUBMIT"
        else:
            status = "NO_HANDLER"
            notes.append("No onclick and not type=submit")

    audited_buttons.append({
        "view": view,
        "id": btn_id,
        "label": clean_inner,
        "onclick": onclick,
        "handler": handler_func,
        "handler_exists": handler_exists,
        "status": status,
        "notes": "; ".join(notes)
    })

print(f"Total buttons audited: {len(audited_buttons)}")

# Breakdown by view
by_view = {}
for b in audited_buttons:
    by_view.setdefault(b["view"], []).append(b)

print("\n=== BUTTONS PER VIEW ===")
for v, btns in sorted(by_view.items()):
    status_counts = {}
    for b in btns:
        status_counts[b["status"]] = status_counts.get(b["status"], 0) + 1
    print(f"{v}: {len(btns)} buttons -> {status_counts}")

with open("scratch_full_buttons_audit.json", "w", encoding="utf-8") as f:
    json.dump(audited_buttons, f, ensure_ascii=False, indent=2)

print("\nFull audit written to scratch_full_buttons_audit.json")
