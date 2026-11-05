"""
n8n workflow "Analysis of sales department calls": patch Gemini nodes (17, 17a, 17b, 17c)
to call local-audit engine on host.docker.internal:8765/audit.
Spec: Phase 2, step 5 (prompt_antigravity_local_migration.md).

Usage: python3 patch_wf_local_engine.py <exported.json> <patched.json> [<node_check.js>]

Changes:
1. Replaces Node 17 with an HTTP Request to http://host.docker.internal:8765/audit
   Timeout: 300000 ms (5 min for long calls)
   Payload: audio_b64, audio_mime, call_date, tenant_id, custom_prompt_context.
2. Removes Gemini fallback nodes (17a, 17b, 17c) as Gemini is retired on local PC.
   Rewires Node 16 -> Node 17 -> Node 18 directly.
3. Fixes Node 18b URL to http://revops-api:8000/api/v1/calls/ingest so it reaches
   the API container within the Docker network.
"""

import json
import re
import sys


def patch_workflow(wf: dict) -> dict:
    nodes = wf.get("nodes", [])
    connections = wf.get("connections", {})

    # 1. Identify all 17 nodes
    gemini_nodes = [n for n in nodes if re.match(r"^17[abc]?\.", n["name"])]
    assert len(gemini_nodes) >= 1, f"Expected at least one node 17, found {len(gemini_nodes)}"

    # Check identical prompts if multiple nodes exist
    bodies = {n.get("parameters", {}).get("jsonBody") for n in gemini_nodes}
    assert len(bodies) == 1, "Gemini nodes carry divergent prompts: inspect before patching"

    # Find the primary node 17
    primary_17 = [n for n in gemini_nodes if n["name"].startswith("17.")][0]
    gemini_names = {n["name"] for n in gemini_nodes}

    # 2. Reconfigure primary node 17 for local-audit engine
    new_node_17_name = "17. 🎙️ Local AI Audit (Whisper + Ollama)"
    old_primary_name = primary_17["name"]

    primary_17["name"] = new_node_17_name
    primary_17["type"] = "n8n-nodes-base.httpRequest"
    primary_17["parameters"] = {
        "method": "POST",
        "url": "http://host.docker.internal:8765/audit",
        "sendHeaders": True,
        "headerParameters": {
            "parameters": [
                {
                    "name": "Content-Type",
                    "value": "application/json"
                }
            ]
        },
        "sendBody": True,
        "specifyBody": "json",
        "jsonBody": "={{\n  JSON.stringify({\n    audio_b64: $('16. 🎙️ Подготовка аудио (Base64)').item.json.audio_b64 || $json.audio_b64 || '',\n    audio_mime: $('16. 🎙️ Подготовка аудио (Base64)').item.json.audio_mime || $json.audio_mime || 'audio/mp3',\n    call_date: $('16. 🎙️ Подготовка аудио (Base64)').item.json.call_date || $json.call_date || '',\n    tenant_id: $('16. 🎙️ Подготовка аудио (Base64)').item.json.tenant_id || $json.tenant_id || '',\n    custom_prompt_context: $('16. 🎙️ Подготовка аудио (Base64)').item.json.custom_prompt_context || $json.custom_prompt_context || ''\n  })\n}}",
        "options": {
            "timeout": 300000
        }
    }

    # 3. Filter out other Gemini nodes (17a, 17b, 17c)
    wf["nodes"] = [n for n in nodes if n["name"] not in (gemini_names - {old_primary_name})]

    # 4. Rewire connections
    # Find Node 18 name
    node_18_candidates = [n["name"] for n in wf["nodes"] if n["name"].startswith("18.") and not n["name"].startswith("18b")]
    assert len(node_18_candidates) == 1, f"Expected 1 node 18, found: {node_18_candidates}"
    node_18_name = node_18_candidates[0]

    # Clean existing connections involving gemini nodes
    new_connections = {}
    for src, targets in connections.items():
        if src in gemini_names:
            continue  # Replaced below

        cleaned_targets = {}
        for conn_type, routes in targets.items():
            cleaned_routes = []
            for route_group in routes:
                cleaned_group = []
                for dest in route_group:
                    if dest["node"] == old_primary_name:
                        cleaned_group.append({**dest, "node": new_node_17_name})
                    elif dest["node"] in gemini_names:
                        pass  # Drop connections to retired fallbacks
                    else:
                        cleaned_group.append(dest)
                if cleaned_group:
                    cleaned_routes.append(cleaned_group)
            if cleaned_routes:
                cleaned_targets[conn_type] = cleaned_routes
        new_connections[src] = cleaned_targets

    # Add single clean connection: 17 -> 18
    new_connections[new_node_17_name] = {
        "main": [
            [
                {
                    "node": node_18_name,
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    wf["connections"] = new_connections

    # 5. Fix Node 18b URL to use revops-api container hostname
    node_18b_candidates = [n for n in wf["nodes"] if n["name"].startswith("18b")]
    if node_18b_candidates:
        n18b = node_18b_candidates[0]
        cur_url = n18b.get("parameters", {}).get("url", "")
        if "localhost:8000" in cur_url:
            n18b["parameters"]["url"] = cur_url.replace("localhost:8000", "revops-api:8000")

    return wf


def main():
    if len(sys.argv) < 3:
        print("Usage: python3 patch_wf_local_engine.py <exported.json> <patched.json> [<node_check.js>]")
        sys.exit(1)

    raw = json.load(open(sys.argv[1], encoding="utf-8"))
    target_id = "Sh4JkQtMKVdeRJn5"

    if isinstance(raw, list):
        # Find target workflow or default to first if single
        target_idx = None
        for i, w in enumerate(raw):
            if w.get("id") == target_id:
                target_idx = i
                break
        if target_idx is None:
            # Fallback: check if the first item has node 17
            target_idx = 0

        patched = patch_workflow(raw[target_idx])
        out_data = list(raw)
        out_data[target_idx] = patched
    else:
        patched = patch_workflow(raw)
        out_data = patched

    with open(sys.argv[2], "w", encoding="utf-8") as f:
        json.dump(out_data, f, ensure_ascii=False, indent=2)

    if len(sys.argv) > 3:
        # Generate check file for node --check
        n17 = [n for n in patched["nodes"] if n["name"].startswith("17.")][0]
        expr = n17["parameters"]["jsonBody"]
        if expr.startswith("={{") and expr.rstrip().endswith("}}"):
            with open(sys.argv[3], "w", encoding="utf-8") as f:
                f.write("(function ($json, $) {\n  return (" + expr[3:].rstrip()[:-2] + ");\n})\n")

    print(f"Successfully patched workflow: {patched.get('name', 'unnamed')}")


if __name__ == "__main__":
    main()
