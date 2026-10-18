#!/usr/bin/env python3
"""
Sync utility from RevOps Monorepo (revops-saas) to the external deployment mirror (ai-rop-landing).
Runs automatically or on-demand to ensure:
1. Root /app/ directory in revops-saas mirrors apps/web/
2. The Vercel-connected landing repo (ai-rop-landing) stays 100% in sync
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = Path(__file__).resolve().parent.parent
LANDING_SRC = BASE_DIR / "apps" / "landing"
WEB_SRC = BASE_DIR / "apps" / "web"
MIRROR_DIR = BASE_DIR.parent / "ai-rop-landing"

def sync_local_app():
    """Sync apps/web into root app/ directory for static Vercel resolution."""
    local_app_dir = BASE_DIR / "app"
    local_app_dir.mkdir(exist_ok=True)
    local_app_js = local_app_dir / "js"
    local_app_js.mkdir(exist_ok=True)

    if (WEB_SRC / "index.html").exists():
        shutil.copy2(WEB_SRC / "index.html", local_app_dir / "index.html")
    if (WEB_SRC / "app.js").exists():
        shutil.copy2(WEB_SRC / "app.js", local_app_dir / "app.js")

    web_js_dir = WEB_SRC / "js"
    if web_js_dir.exists():
        for js_file in web_js_dir.glob("*.js"):
            shutil.copy2(js_file, local_app_js / js_file.name)
    print("  [OK] Local /app/ directory updated from apps/web/")

def sync_mirror():
    # 0. Sync local /app in monorepo
    sync_local_app()

    if not MIRROR_DIR.exists():
        print(f"[Mirror] Directory {MIRROR_DIR} not found. Skipping mirror sync.")
        return 0

    print(f"[Mirror] Synchronizing {BASE_DIR} -> {MIRROR_DIR}...")

    # 1. Sync Landing root assets
    if LANDING_SRC.exists():
        for item in LANDING_SRC.iterdir():
            dest = MIRROR_DIR / item.name
            if item.is_dir():
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(item, dest)
            else:
                shutil.copy2(item, dest)
        print("  [OK] Landing assets synced to root")

    # 2. Sync Web Dashboard to /app/
    app_dest = MIRROR_DIR / "app"
    app_dest.mkdir(exist_ok=True)
    app_js_dest = app_dest / "js"
    app_js_dest.mkdir(exist_ok=True)

    if (WEB_SRC / "index.html").exists():
        shutil.copy2(WEB_SRC / "index.html", app_dest / "index.html")
    if (WEB_SRC / "app.js").exists():
        shutil.copy2(WEB_SRC / "app.js", app_dest / "app.js")
    
    web_js_dir = WEB_SRC / "js"
    if web_js_dir.exists():
        for js_file in web_js_dir.glob("*.js"):
            shutil.copy2(js_file, app_js_dest / js_file.name)
    print("  [OK] Web dashboard synced to /app/")

    # 3. Check git status in mirror
    status = subprocess.run(["git", "-C", str(MIRROR_DIR), "status", "--porcelain"], capture_output=True, text=True)
    if status.stdout.strip():
        print("[Mirror] Changes detected in mirror. Committing and pushing...")
        subprocess.run(["git", "-C", str(MIRROR_DIR), "add", "."], check=True)
        subprocess.run(["git", "-C", str(MIRROR_DIR), "commit", "-m", "chore(mirror): automatic sync from revops-saas monorepo"], check=True)
        for branch in ["main", "gh-pages", "gh-pages-sync"]:
            subprocess.run(["git", "-C", str(MIRROR_DIR), "push", "origin", f"HEAD:{branch}"], check=False)
        print("  [OK] Mirror repo pushed to GitHub")
    else:
        print("[Mirror] Mirror is clean and up to date.")

    return 0

if __name__ == "__main__":
    sys.exit(sync_mirror())
