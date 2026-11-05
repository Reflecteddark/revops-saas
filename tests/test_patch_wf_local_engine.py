import json
from pathlib import Path
from scripts.n8n.patch_wf_local_engine import patch_workflow

FIXTURE_PATH = Path("C:/revops/n8n_data/workflows_live.json")


def test_patch_workflow_transforms_gemini_nodes_to_local_audit():
    assert FIXTURE_PATH.exists(), f"Missing live workflows fixture at {FIXTURE_PATH}"
    wfs = json.load(open(FIXTURE_PATH, encoding="utf-8"))
    orig_wf = [w for w in wfs if w.get("id") == "Sh4JkQtMKVdeRJn5"][0]

    patched = patch_workflow(json.loads(json.dumps(orig_wf)))

    # Node 17 checks
    n17_list = [n for n in patched["nodes"] if n["name"].startswith("17.")]
    assert len(n17_list) == 1, f"Expected exactly 1 node 17, got {len(n17_list)}"
    n17 = n17_list[0]
    assert n17["parameters"]["url"] == "http://host.docker.internal:8765/audit"
    assert n17["parameters"]["options"]["timeout"] == 300000

    # Old Gemini nodes removed
    assert not any(n["name"].startswith("17a.") for n in patched["nodes"])
    assert not any(n["name"].startswith("17b.") for n in patched["nodes"])

    # Connections rewired: 16 -> 17 -> 18
    conns = patched["connections"]
    n16 = [n["name"] for n in patched["nodes"] if n["name"].startswith("16.")][0]
    n18 = [n["name"] for n in patched["nodes"] if n["name"].startswith("18.") and not n["name"].startswith("18b")][0]

    assert conns[n16]["main"][0][0]["node"] == n17["name"]
    assert conns[n17["name"]]["main"][0][0]["node"] == n18

    # Node 18b URL updated
    n18b = [n for n in patched["nodes"] if n["name"].startswith("18b")][0]
    assert "revops-api:8000" in n18b["parameters"]["url"]
