#!/bin/bash
REPO="${1:-Reflecteddark/revops-saas}"
COMMIT_SHA="${2:-$(git rev-parse HEAD)}"
TIMEOUT="${3:-300}"

echo "Ждём CI для коммита $COMMIT_SHA (timeout ${TIMEOUT}s)..."
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(gh api "repos/$REPO/commits/$COMMIT_SHA/check-runs" \
    --jq '[.check_runs[]] | if length == 0 then "pending" elif any(.[]; .conclusion == "failure" or .conclusion == "cancelled" or .conclusion == "timed_out") then "failure" elif all(.[]; .conclusion == "success") then "success" else "pending" end' 2>/dev/null || echo "pending")
  case "$STATUS" in
    "success") echo "✅ CI зелёный"; exit 0 ;;
    "failure") echo "❌ CI красный"; exit 1 ;;
    *) echo "  ⏳ pending (${ELAPSED}s)"; sleep 10; ELAPSED=$((ELAPSED + 10)) ;;
  esac
done
echo "❌ CI timeout за ${TIMEOUT}s"; exit 1
