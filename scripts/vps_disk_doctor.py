#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VPS Disk Doctor & Health Inspector.
Diagnostic utility to monitor and optimize NVMe disk usage on production Aeza VPS.
"""

import sys
import argparse
import subprocess
from pathlib import Path

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

try:
    from deploy_to_vps import VPS_HOST, VPS_USER
except ImportError:
    VPS_HOST = "127.0.0.1"
    VPS_USER = "root"


def run_ssh(cmd: str):
    cleaned_cmd = cmd.replace("\r\n", "\n").replace("\r", "\n")
    p = subprocess.Popen(
        ['ssh', '-o', 'StrictHostKeyChecking=no', f'{VPS_USER}@{VPS_HOST}', 'bash'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    stdout_b, stderr_b = p.communicate(cleaned_cmd.encode("utf-8"))
    return stdout_b.decode("utf-8", errors="replace").strip(), stderr_b.decode("utf-8", errors="replace").strip()


def inspect_disk():
    script = """
    echo "=== DISK USAGE ==="
    df -h /
    echo ""
    echo "=== TOP DIRECTORIES IN /opt ==="
    du -h -d 2 /opt 2>/dev/null | sort -rh | head -n 8
    echo ""
    echo "=== DOCKER SYSTEM DF ==="
    docker system df
    echo ""
    echo "=== HEALTH GUARD REPORT ==="
    /opt/revops-saas/venv/bin/python3 /opt/revops-enterprise-os/scripts/revops_health_guard.py --summary 2>/dev/null || true
    """
    out, err = run_ssh(script)
    print(out)
    if err and "warning" in err.lower():
        print("Note:", err)


def clean_disk():
    script = """
    set -e
    echo "=== 1. PRUNING N8N STALE BACKUPS ==="
    rm -f /var/lib/docker/volumes/n8n_n8n_data/_data/*.bak* 2>/dev/null || true
    rm -f /var/lib/docker/volumes/n8n_n8n_data/_data/database_backup_*.sqlite 2>/dev/null || true
    echo "OK: Stale n8n backups removed."

    echo "=== 2. CLEARING ROOT & APT CACHES ==="
    rm -rf /root/.cache/* 2>/dev/null || true
    apt-get clean 2>/dev/null || true
    journalctl --vacuum-size=50M 2>/dev/null || true
    echo "OK: System caches cleared."

    echo "=== 3. DOCKER SYSTEM PRUNE ==="
    docker system prune -f --volumes=false 2>/dev/null || true
    echo "OK: Docker dangling resources pruned."

    echo ""
    echo "=== CURRENT DISK STATUS ==="
    df -h /
    """
    out, err = run_ssh(script)
    print(out)
    if err and "warning" in err.lower():
        print("Note:", err)


def main():
    parser = argparse.ArgumentParser(description="VPS Disk Doctor")
    parser.add_argument("--clean", action="store_true", help="Execute safe disk cleanup on VPS")
    args = parser.parse_args()

    if args.clean:
        clean_disk()
    else:
        inspect_disk()


if __name__ == "__main__":
    main()
