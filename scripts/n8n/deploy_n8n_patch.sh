#!/bin/bash
# Applies one n8n workflow patch to the live workflow. Run on the VPS from /root/e2e_calls with both files next to it:
#   ./deploy_n8n_patch.sh patch_wf_quick_fixes.py harness_quick_fixes.cjs
# Order: backup -> patch (asserts every replacement) -> JS syntax check -> harness on the patched copy -> import ->
# publish -> wait for 0 LIVE executions -> restart n8n. A restart with a live execution crashes it, so it never restarts early.
# A "running" execution older than ZOMBIE_MIN minutes is a zombie (a Postgres restart orphans it, it stays "running"
# forever): it is reported, not waited for, and n8n marks it crashed on restart.
set -euo pipefail

PATCH=${1:?patch .py}
HARNESS=${2:?harness .cjs}
ZOMBIE_MIN=${ZOMBIE_MIN:-15}
W=Sh4JkQtMKVdeRJn5
Q() { docker exec -i revops-saas-postgres_db-1 sh -c 'psql -U $POSTGRES_USER -d n8n_db -At' <<< "$1"; }

TS=$(date -u +%Y%m%dT%H%M%S)
D=/root/e2e_calls/wf_backup_$TS
mkdir -p "$D"
docker exec n8n n8n export:workflow --id=$W --output=/tmp/m.json >/dev/null 2>&1
docker cp n8n:/tmp/m.json "$D/main.json"
BEFORE=$(python3 -c "import json;w=json.load(open('$D/main.json'));print((w[0] if isinstance(w,list) else w)['versionId'])")
echo "backup: $D  version before: $BEFORE"

python3 "/root/e2e_calls/$PATCH" "$D/main.json" "$D/main_patched.json" "$D/node_check.js"

docker cp "$D/node_check.js" n8n:/tmp/node_check.js
docker exec n8n node --check /tmp/node_check.js
echo "syntax ok"

docker cp "/root/e2e_calls/$HARNESS" "n8n:/tmp/$HARNESS"
docker cp "$D/main_patched.json" n8n:/tmp/main_patched.json
docker exec n8n node "/tmp/$HARNESS" /tmp/main_patched.json | tail -3
echo "harness ok"

docker exec n8n n8n import:workflow --input=/tmp/main_patched.json 2>&1 | grep -i success
V=$(Q "select \"versionId\" from workflow_entity where id='$W'")
[ "$V" != "$BEFORE" ] || { echo "ERROR: version did not change after import"; exit 1; }
docker exec n8n n8n publish:workflow --id=$W --versionId="$V" 2>&1 | grep -i publishing

LIVE="select count(*) from execution_entity where status in ('running','new','waiting') and \"workflowId\"='$W' and \"startedAt\" > now() - interval '$ZOMBIE_MIN minutes'"
A=1
for _ in $(seq 1 600); do
  A=$(Q "$LIVE")
  [ "$A" = "0" ] && break
  sleep 1
done
ZOMBIES=$(Q "select coalesce(string_agg(id::text, ','), '-') from execution_entity where status in ('running','new','waiting') and \"workflowId\"='$W' and \"startedAt\" <= now() - interval '$ZOMBIE_MIN minutes'")
echo "live executions: $A at $(date +%T); zombies (older than $ZOMBIE_MIN min, ignored): $ZOMBIES"
if [ "$A" != "0" ]; then
  echo "NOT restarted: executions still running. The new version is published but not loaded. Rerun the restart when idle."
  exit 1
fi
docker restart n8n >/dev/null
echo "restarted at $(date +%T); new version: $V"
echo "rollback: import $D/main.json, publish the version it creates, wait for 0 live executions, restart n8n"
