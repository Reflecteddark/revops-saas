#!/usr/bin/env python3
"""
RevOps Enterprise OS - FastAPI Service Runner
Runs uvicorn in the background with rotating log file and health-check guard.
"""
import logging
from logging.handlers import RotatingFileHandler
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
LOG_FILE = LOGS_DIR / "fastapi_service.log"

# Setup rotating log handler (max 10MB, keep 3 backups)
logger = logging.getLogger("fastapi_service")
logger.setLevel(logging.INFO)
handler = RotatingFileHandler(LOG_FILE, maxBytes=10 * 1024 * 1024, backupCount=3, encoding="utf-8")
handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(handler)

def is_service_healthy() -> bool:
    try:
        req = urllib.request.Request("http://127.0.0.1:8000/api/v1/health")
        with urllib.request.urlopen(req, timeout=2) as res:
            return res.status == 200
    except Exception:
        return False

def main():
    logger.info("FastAPI service runner started.")
    if is_service_healthy():
        logger.info("FastAPI is already running healthy on port 8000. Exiting runner.")
        sys.exit(0)

    logger.info("Starting uvicorn server on http://0.0.0.0:8000...")
    
    py_exe = str(sys.executable).replace("pythonw.exe", "python.exe")
    cmd = [
        py_exe,
        "-m",
        "uvicorn",
        "apps.api.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
        "--log-level",
        "info"
    ]

    creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

    with open(LOG_FILE, "a", encoding="utf-8") as f_out:
        proc = subprocess.Popen(
            cmd,
            cwd=str(BASE_DIR),
            stdout=f_out,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags
        )
        logger.info(f"Uvicorn process spawned with PID {proc.pid}.")
        
        # Verify it comes up
        for _ in range(10):
            time.sleep(1)
            if is_service_healthy():
                logger.info("FastAPI successfully confirmed healthy on port 8000.")
                break
        
        proc.wait()

if __name__ == "__main__":
    main()
