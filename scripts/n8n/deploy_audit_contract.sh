#!/bin/bash
# Applies patch_wf_audit_contract.py to the live workflow. Run on the VPS from /root/e2e_calls.
# Order: backup -> patch (asserts every replacement) -> JS syntax check -> import -> publish -> wait for 0 running
# executions -> restart n8n. A restart with running executions crashes them, so it never restarts early.
set -euo pipefail

W=Sh4JkQtMKVdeRJn5
Q() { docker exec -i revops-saas-postgres_db-1 sh -c 'psql -U $POSTGRES_USER -d n8n_db -At' <<< "$1"; }

TS=$(date -u +%Y%m%dT%H%M%S)
D=/root/e2e_calls/wf_backup_$TS
mkdir -p "$D"
docker exec n8n n8n export:workflow --id=$W --output=/tmp/m.json >/dev/null 2>&1
docker cp n8n:/tmp/m.json "$D/main.json"
BEFORE=$(python3 -c "import json;w=json.load(open('$D/main.json'));print((w[0] if isinstance(w,list) else w)['versionId'])")
echo "backup: $D  version before: $BEFORE"

python3 /root/e2e_calls/patch_wf_audit_contract.py "$D/main.json" "$D/main_patched.json" "$D/node_check.js"

docker cp "$D/node_check.js" n8n:/tmp/node_check.js
docker exec n8n node --check /tmp/node_check.js
echo "syntax ok"

docker cp "$D/main_patched.json" n8n:/tmp/main_patched.json
docker exec n8n n8n import:workflow --input=/tmp/main_patched.json 2>&1 | grep -i success
V=$(Q "select \"versionId\" from workflow_entity where id='$W'")
[ "$V" != "$BEFORE" ] || { echo "ERROR: version did not change after import"; exit 1; }
docker exec n8n n8n publish:workflow --id=$W --versionId="$V" 2>&1 | grep -i publishing

A=1
for _ in $(seq 1 600); do
  A=$(Q "select count(*) from execution_entity where status in ('running','new','waiting') and \"workflowId\"='$W'")
  [ "$A" = "0" ] && break
  sleep 1
done
echo "active executions: $A at $(date +%T)"
if [ "$A" != "0" ]; then
  echo "NOT restarted: executions still running. The new version is published but not loaded. Rerun the restart when idle."
  exit 1
fi
docker restart n8n >/dev/null
echo "restarted at $(date +%T); new version: $V"
echo "rollback: import $D/main.json, publish the version it creates, wait for 0 running, restart n8n"
