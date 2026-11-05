"""
Update workflow_entity in local PostgreSQL (n8n_db) with the patched workflow.
"""
import json
import subprocess
from pathlib import Path

PATCHED_PATH = Path("C:/revops/n8n_data/workflow_patched_local.json")
SQL_TMP = Path("C:/revops/data/update_workflow.sql")

def main():
    data = json.load(open(PATCHED_PATH, encoding="utf-8"))
    wf = [w for w in data if w.get("id") == "Sh4JkQtMKVdeRJn5"][0]

    nodes_json = json.dumps(wf["nodes"], ensure_ascii=False)
    connections_json = json.dumps(wf["connections"], ensure_ascii=False)

    # Write SQL script with dollar-quoted strings to prevent syntax escaping issues
    sql = f"""
UPDATE workflow_entity
SET nodes = $nodes${nodes_json}$nodes$::json,
    connections = $conns${connections_json}$conns$::json,
    "updatedAt" = NOW()
WHERE id = 'Sh4JkQtMKVdeRJn5';
"""
    SQL_TMP.write_text(sql, encoding="utf-8")
    print(f"Wrote SQL update script to {SQL_TMP} ({len(sql)} bytes)")

    # Execute inside revops-postgres container
    # Since ./data is mounted or we can pass via stdin
    res = subprocess.run(
        ["docker", "exec", "-i", "revops-postgres", "psql", "-U", "revops_user", "-d", "n8n_db"],
        input=sql.encode("utf-8"),
        capture_output=True,
        text=False
    )
    print("PSQL stdout:", res.stdout.decode("utf-8", errors="replace"))
    print("PSQL stderr:", res.stderr.decode("utf-8", errors="replace"))
    assert res.returncode == 0, "Failed to apply SQL update to n8n_db"
    print("Successfully updated workflow in n8n_db!")

if __name__ == "__main__":
    main()
