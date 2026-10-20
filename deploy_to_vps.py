#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS — Unified Deployment Engine (Windows -> GitHub & Aeza VPS)
Сквозной деплой: валидация синтаксиса -> коммит и пуш в GitHub -> стриминг на VPS -> рестарт служб -> смоук-тест.
"""

import sys
import os
import io
import time
import tarfile
import argparse
import subprocess
import urllib.request
import py_compile
from pathlib import Path
from datetime import datetime

# Принудительная настройка кодировки консоли Windows на UTF-8 с безопасной заменой
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if sys.stderr.encoding and sys.stderr.encoding.lower() != "utf-8":
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Настройки VPS
VPS_HOST = "176.124.207.57"
VPS_USER = "root"

# Репозитории и директории
HOME = Path.home()
PROJECTS = {
    "crew": {
        "name": "6 ИИ-Агентов (my_ai_crew)",
        "local_path": HOME / "my_ai_crew",
        "vps_path": "/opt/my_ai_crew",
        "services": ["revops-healer", "revops-tgbot"],
        "git_url": "https://github.com/Reflecteddark/my-ai-crew.git"
    },
    "saas": {
        "name": "RevOps SaaS Backend (revops-saas)",
        "local_path": HOME / ".gemini" / "antigravity" / "scratch" / "revops-saas",
        "vps_path": "/opt/revops-saas",
        "services": ["revops-api"],
        "git_url": "https://github.com/Reflecteddark/revops-saas.git"
    }
}

# Исключения при синхронизации с VPS (критично для безопасности данных клиентов!)
EXCLUDE_DIRS = {
    ".git", "venv", ".venv", "__pycache__", "node_modules", 
    "logs", "backups", ".idea", ".vscode", ".pytest_cache", 
    ".gemini", "scratch", "dist", "build"
}
EXCLUDE_EXTS = {
    ".pyc", ".pyo", ".pyd", ".db", ".sqlite", ".sqlite3", ".log"
}
EXCLUDE_EXACT_FILES = {
    ".env", "telegram_credentials.json"
}

def log(msg: str, symbol: str = "[*]"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    safe_symbol = symbol.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8", errors="replace")
    safe_msg = msg.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8", errors="replace")
    print(f"[{timestamp}] {safe_symbol} {safe_msg}", flush=True)

def check_syntax(local_path: Path) -> bool:
    """Проверяет синтаксис всех .py файлов перед деплоем."""
    log(f"Проверка Python синтаксиса в {local_path.name}...", symbol="[?]")
    errors = 0
    checked = 0
    for root, dirs, files in os.walk(local_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            if f.endswith(".py"):
                checked += 1
                fp = os.path.join(root, f)
                try:
                    py_compile.compile(fp, doraise=True)
                except py_compile.PyCompileError as e:
                    log(f"ОШИБКА СИНТАКСИСА: {fp}", symbol="[-]")
                    print(e)
                    errors += 1
    if errors > 0:
        log(f"Найдено ошибок синтаксиса: {errors}. Деплой остановлен!", symbol="[!]")
        return False
    log(f"Синтаксис проверен успешно ({checked} файлов).", symbol="[+]")
    return True

def sync_git(local_path: Path, commit_msg: str) -> str:
    """Проверяет git, создает коммит при наличии изменений и пушит в origin main."""
    log(f"Синхронизация Git: {local_path.name}...", symbol="[>]")
    
    status_cmd = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=str(local_path),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    
    has_changes = bool(status_cmd.stdout.strip())
    if has_changes:
        log(f"Обнаружены изменения в {local_path.name}. Коммит: '{commit_msg}'", symbol="[+]")
        subprocess.run(["git", "add", "-A"], cwd=str(local_path), check=True)
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(local_path), check=True)
    else:
        log(f"Рабочая копия {local_path.name} чиста.", symbol="[i]")

    cherry_cmd = subprocess.run(
        ["git", "cherry", "-v"],
        cwd=str(local_path),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    if cherry_cmd.stdout.strip() or has_changes:
        log(f"Отправка коммитов в GitHub (origin main)...", symbol="[^]")
        push_cmd = subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=str(local_path),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore"
        )
        if push_cmd.returncode != 0:
            log(f"Предупреждение при git push: {push_cmd.stderr.strip()}", symbol="[!]")
        else:
            log(f"GitHub обновлен успешно!", symbol="[+]")
    else:
        log(f"Все коммиты уже на GitHub.", symbol="[+]")

    hash_cmd = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=str(local_path),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    commit_hash = hash_cmd.stdout.strip() or "unknown"
    return commit_hash

def check_ssh_reachability(timeout_sec: int = 4) -> bool:
    """Быстрая проверка доступности SSH на VPS перед стримингом."""
    try:
        res = subprocess.run(
            ["ssh", "-n", "-o", "StrictHostKeyChecking=no", "-o", f"ConnectTimeout={timeout_sec}", f"{VPS_USER}@{VPS_HOST}", "echo ok"],
            capture_output=True,
            timeout=timeout_sec + 2
        )
        return res.returncode == 0
    except Exception:
        return False

def stream_to_vps(local_path: Path, vps_path: str, commit_hash: str) -> bool:
    """Создает tar-архив в памяти с фильтрацией и стримит через SSH напрямую на VPS."""
    log(f"Упаковка и стриминг в VPS: {vps_path}...", symbol="[>]")
    
    file_count = 0
    total_bytes = 0

    if not check_ssh_reachability(timeout_sec=4):
        log(f"VPS {VPS_HOST} недоступен по SSH (тайм-аут соединения). Проверьте статус сервера в панели Aeza.", symbol="[-]")
        return False

    def tar_filter(tarinfo):
        nonlocal file_count, total_bytes
        parts = [p for p in tarinfo.name.replace("\\", "/").split("/") if p and p != "."]
        
        for p in parts:
            if p in EXCLUDE_DIRS:
                return None
        if parts and parts[-1] in EXCLUDE_EXACT_FILES:
            return None
        if parts:
            for ext in EXCLUDE_EXTS:
                if parts[-1].endswith(ext):
                    return None
                    
        file_count += 1
        total_bytes += tarinfo.size
        return tarinfo

    t0 = time.time()
    
    ssh_cmd = [
        "ssh", "-o", "StrictHostKeyChecking=no",
        f"{VPS_USER}@{VPS_HOST}",
        f"mkdir -p {vps_path} && tar -xzf - -C {vps_path}"
    ]
    
    proc = subprocess.Popen(
        ssh_cmd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    try:
        with tarfile.open(fileobj=proc.stdin, mode="w:gz") as tar:
            tar.add(str(local_path), arcname=".", filter=tar_filter)
        if proc.stdin and not proc.stdin.closed:
            try:
                proc.stdin.close()
            except Exception:
                pass
        out, err = proc.communicate(timeout=60)
        
        if proc.returncode != 0:
            log(f"Ошибка распаковки на VPS: {err.decode('utf-8', errors='ignore')}", symbol="[-]")
            return False
            
    except Exception as e:
        log(f"Исключение при передаче на VPS: {e}", symbol="[-]")
        try:
            proc.kill()
        except Exception:
            pass
        return False

    elapsed = time.time() - t0
    log(
        f"Синхронизировано: {file_count} файлов ({total_bytes / 1024:.1f} KB) "
        f"за {elapsed:.2f}с -> {vps_path}", 
        symbol="[+]"
    )
    
    deploy_stamp = datetime.now().isoformat()
    stamp_cmd = (
        f"echo '{{\"commit\": \"{commit_hash}\", \"deployed_at\": \"{deploy_stamp}\"}}' "
        f"> {vps_path}/.deploy_info.json"
    )
    subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", stamp_cmd],
        capture_output=True
    )
    return True

def restart_services(services: list) -> bool:
    """Перезапускает службы systemd на VPS."""
    if not services:
        return True
    svc_str = " ".join(services)
    log(f"Перезапуск служб на VPS: {svc_str}...", symbol="[>]")
    
    cmd = f"systemctl daemon-reload && systemctl restart {svc_str}"
    res = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    if res.returncode != 0:
        log(f"Ошибка перезапуска служб: {res.stderr.strip()}", symbol="[-]")
        return False
        
    return True

def run_smoke_test(timeout_sec: int = 15) -> bool:
    """Ожидает полной готовности боевых служб и проверяет эндпоинты."""
    log("Ожидание готовности и запуск смоук-теста боевой среды...", symbol="[?]")
    t0 = time.time()
    
    # 1. Ожидание активности всех systemd служб
    all_active = False
    statuses = []
    while time.time() - t0 < timeout_sec:
        units_cmd = subprocess.run(
            [
                "ssh", "-n", "-o", "StrictHostKeyChecking=no",
                f"{VPS_USER}@{VPS_HOST}",
                "systemctl is-active revops-api revops-healer revops-tgbot cloudflared"
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore"
        )
        statuses = [s.strip() for s in units_cmd.stdout.strip().split("\n") if s.strip()]
        if len(statuses) >= 4 and all(s == "active" for s in statuses):
            all_active = True
            break
        time.sleep(1.0)
        
    if all_active:
        log("Все 4 боевые службы VPS активны (revops-api, healer, tgbot, cloudflared).", symbol="[+]")
    else:
        log(f"Внимание: статус служб: {statuses}", symbol="[!]")

    # 2. Ожидание ответа HTTP 200 от публичного API (/api/v1/health)
    api_ready = False
    req = urllib.request.Request(
        "https://report.ai-rop.ru/api/v1/health",
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) RevOps-Deploy/1.0"}
    )
    while time.time() - t0 < timeout_sec:
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.getcode() == 200:
                    api_ready = True
                    break
        except Exception:
            time.sleep(1.0)
            
    if api_ready:
        log("Публичный API шлюз https://report.ai-rop.ru/api/v1/health готов (HTTP 200 OK).", symbol="[+]")
    else:
        log("Предупреждение: API шлюз еще не ответил 200 OK (возможно, прогрев воркеров).", symbol="[!]")

    return all_active and api_ready

def main():
    parser = argparse.ArgumentParser(description="RevOps OS — Unified Deployment Script")
    parser.add_argument("target", choices=["all", "crew", "saas"], default="all", nargs="?",
                        help="Что деплоить: all (все), crew (6 агентов), saas (бэкенд)")
    parser.add_argument("-m", "--message", default=None, help="Сообщение коммита")
    parser.add_argument("--skip-git", action="store_true", help="Пропустить отправку в GitHub")
    parser.add_argument("--skip-syntax", action="store_true", help="Пропустить проверку синтаксиса")
    parser.add_argument("--skip-vps", action="store_true", help="Синхронизировать только Git без деплоя на VPS")
    args = parser.parse_args()

    commit_msg = args.message or f"chore: automated deployment at {datetime.now().strftime('%Y-%m-%d %H:%M')}"

    print("=" * 70)
    print("      REVOPS ENTERPRISE OS — ONE-CLICK DEPLOY ENGINE")
    print(f"      Цель: {args.target.upper()} | VPS: {VPS_HOST} (Aeza 24/7)")
    print("=" * 70)

    start_time = time.time()
    targets = ["crew", "saas"] if args.target == "all" else [args.target]

    # Шаг 1: Проверка синтаксиса
    if not args.skip_syntax:
        for t in targets:
            proj = PROJECTS[t]
            if not check_syntax(proj["local_path"]):
                sys.exit(1)

    # Шаг 2: Синхронизация с GitHub и сбор коммит-хешей
    hashes = {}
    for t in targets:
        proj = PROJECTS[t]
        if not args.skip_git:
            h = sync_git(proj["local_path"], commit_msg)
            hashes[t] = h
        else:
            hashes[t] = "skip-git"

    # Шаг 3: Синхронизация с VPS
    if not args.skip_vps:
        all_services = []
        for t in targets:
            proj = PROJECTS[t]
            success = stream_to_vps(proj["local_path"], proj["vps_path"], hashes.get(t, "unknown"))
            if not success:
                log(f"Деплой проекта {t} завершился с ошибкой!", symbol="[-]")
                sys.exit(1)
            all_services.extend(proj["services"])

        # Шаг 4: Рестарт служб
        restart_services(list(dict.fromkeys(all_services)))

        # Шаг 5: Смоук-тест с ожиданием прогрева
        run_smoke_test(timeout_sec=15)

    total_time = time.time() - start_time
    print("=" * 70)
    log(f"ДЕПЛОЙ УСПЕШНО ЗАВЕРШЁН ЗА {total_time:.2f} СЕКУНД!", symbol="[+]")
    print("=" * 70)

if __name__ == "__main__":
    main()
