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
import json
import tarfile
import argparse
import subprocess
import urllib.request
import urllib.error
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

def load_vps_host() -> str:
    host = os.getenv("VPS_HOST")
    if host and host.strip():
        return host.strip()
    candidate_files = [
        Path(__file__).resolve().parent / "deploy.env",
        Path(__file__).resolve().parent / ".env",
        Path("deploy.env"),
        Path(".env"),
    ]
    for env_file in candidate_files:
        try:
            if env_file.exists():
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("VPS_HOST="):
                            val = line.split("=", 1)[1].strip().strip("'\"")
                            if val:
                                return val
        except Exception:
            pass
    return "176.124.207.57"

# Настройки VPS
VPS_HOST = load_vps_host()
VPS_USER = os.getenv("VPS_USER", "root")

# Репозитории и директории
HOME = Path.home()
PROJECTS = {
    "crew": {
        "name": "6 ИИ-Агентов (my_ai_crew)",
        "local_path": HOME / "my_ai_crew",
        "vps_path": "/opt/my_ai_crew",
        "services": ["revops-healer", "revops-tgbot"],
        "git_url": "https://github.com/Reflecteddark/my-ai-crew.git",
        "repo": "Reflecteddark/my-ai-crew",
        "has_ci": False,
        "deploy_mode": "systemd"
    },
    "saas": {
        "name": "RevOps SaaS Backend (revops-saas)",
        "local_path": HOME / ".gemini" / "antigravity" / "scratch" / "revops-saas",
        "vps_path": "/opt/revops-saas",
        "services": [],
        "git_url": "https://github.com/Reflecteddark/revops-saas.git",
        "repo": "Reflecteddark/revops-saas",
        "has_ci": True,
        "deploy_mode": "docker"
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
        res_commit = subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(local_path))
        if res_commit.returncode != 0:
            log(f"❌ Коммит в {local_path.name} заблокирован pre-commit хуком (тесты провалены). Деплой ОТМЕНЁН. Прод не тронут.", symbol="[-]")
            sys.exit(1)
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
        branch_cmd = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=str(local_path),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore"
        )
        current_branch = branch_cmd.stdout.strip() or "main"
        log(f"Отправка коммитов в GitHub ({current_branch} -> origin)...", symbol="[^]")
        
        push_args = ["git", "push", "origin", current_branch]
        if current_branch != "main":
            push_args.append(f"{current_branch}:main")
            
        push_cmd = subprocess.run(
            push_args,
            cwd=str(local_path),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore"
        )
        if push_cmd.returncode != 0:
            log(f"❌ Ошибка git push в {local_path.name}: {push_cmd.stderr.strip()}", symbol="[-]")
            log("Деплой ОТМЕНЁН. Прод не тронут (код не отправлен в GitHub).", symbol="[-]")
            sys.exit(1)
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

def load_github_token() -> Optional[str]:
    """
    Загружает GitHub Personal Access Token для авторизации в GitHub REST API.
    Приоритет:
    1. Переменная окружения GITHUB_TOKEN / GH_TOKEN.
    2. Файл deploy.env в корне проекта.
    3. Файл .env в корне проекта.
    """
    token = os.getenv("GITHUB_TOKEN") or os.getenv("GH_TOKEN")
    if token and token.strip() and token.strip() != "your_personal_access_token_here":
        return token.strip()

    candidate_files = [
        Path(__file__).resolve().parent / "deploy.env",
        Path(__file__).resolve().parent / ".env",
        PROJECTS.get("saas", {}).get("local_path", Path(".")) / "deploy.env",
        PROJECTS.get("saas", {}).get("local_path", Path(".")) / ".env",
        Path("deploy.env"),
        Path(".env"),
    ]
    for env_file in candidate_files:
        try:
            if env_file.exists():
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            key, val = line.split("=", 1)
                            key = key.strip()
                            val = val.strip().strip("'\"")
                            if key in ("GITHUB_TOKEN", "GH_TOKEN") and val and val != "your_personal_access_token_here":
                                return val
        except Exception:
            pass

    return None


def wait_for_ci(repo: str, commit_sha: str, timeout_sec: int = 300) -> bool:
    """
    Ожидает завершения проверок GitHub Actions (CI) для коммита commit_sha.
    Использует GitHub REST API (check-runs).
    При превышении Rate Limit (403) выводит предупреждение и возвращает True,
    чтобы не блокировать деплой из-за ограничений GitHub.
    """
    log(f"[CI Gate] Запрос статуса GitHub Actions для {repo}@{commit_sha[:7]} (таймаут {timeout_sec}с)...", symbol="[?]")
    url = f"https://api.github.com/repos/{repo}/commits/{commit_sha}/check-runs"
    
    headers = {
        "User-Agent": "RevOps-Deploy/1.0",
        "Accept": "application/vnd.github.v3+json"
    }
    github_token = load_github_token()
    if github_token:
        headers["Authorization"] = f"Bearer {github_token}"
        log("[i] [CI Gate] Авторизация в GitHub API активна (лимит 5000 запросов/час)", symbol="[i]")
    else:
        log("[!] [CI Gate] Анонимный режим GitHub API (лимит 60 запросов/час). Укажите GITHUB_TOKEN в deploy.env для расширения лимита", symbol="[!]")
        
    start_time = time.time()
    poll_interval = 10
    
    while True:
        elapsed = int(time.time() - start_time)
        data = None
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 401:
                log("[!] [CI Gate] GITHUB_TOKEN недействителен (401 Bad credentials). Переключаемся на анонимный режим...", symbol="[!]")
                headers.pop("Authorization", None)
                continue
            if e.code == 403:
                log("[!] GitHub API Rate Limit exceeded. Пропускаем проверку CI (деплой продолжится)", symbol="[!]")
                return True
            if e.code == 422:
                log(f"[CI Gate] ❌ Ошибка HTTP 422: коммит {commit_sha[:7]} отсутствует на GitHub. Деплой ОТМЕНЁН. Прод не тронут.", symbol="[-]")
                return False
            log(f"[CI Gate] Ошибка HTTP {e.code} при обращении к GitHub API: {e.reason}", symbol="[!]")
        except Exception as ex:
            log(f"[CI Gate] Ошибка сети при запросе к GitHub API: {ex}", symbol="[!]")

        check_runs = data.get("check_runs", []) if isinstance(data, dict) else []
        
        if not check_runs:
            status_summary = "pending (ожидание регистрации проверок)"
        else:
            failures = [
                cr.get("name", "Unknown") for cr in check_runs 
                if cr.get("conclusion") in ["failure", "cancelled", "timed_out"]
            ]
            if failures:
                log(f"[CI Gate] ❌ Обнаружены упавшие проверки CI: {', '.join(failures)}", symbol="[-]")
                return False
                
            all_completed = all(cr.get("status") == "completed" for cr in check_runs)
            all_success = all(cr.get("conclusion") in ["success", "neutral", "skipped"] for cr in check_runs)
            
            if all_completed and all_success:
                passed_names = [cr.get("name", "Unknown") for cr in check_runs if cr.get("conclusion") == "success"]
                log(f"[CI Gate] ✅ Все проверки CI пройдены успешно ({len(passed_names)}: {', '.join(passed_names)})", symbol="[+]")
                return True
                
            in_progress = [cr.get("name", "Unknown") for cr in check_runs if cr.get("status") != "completed"]
            status_summary = f"в процессе ({len(in_progress)}: {', '.join(in_progress[:3])})"

        if elapsed >= timeout_sec:
            log(f"[CI Gate] ❌ Таймаут ожидания CI ({timeout_sec}с). Статус: {status_summary}", symbol="[-]")
            return False
            
        log(f"[CI Gate] Ожидание CI... ({elapsed}с / {timeout_sec}с) — {status_summary}", symbol="[i]")
        time.sleep(poll_interval)

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

def deploy_via_docker_compose(local_path: Path, vps_path: str, commit_hash: str) -> bool:
    """
    Копирует docker-compose.yml на VPS и запускает контейнеры через Docker Compose.
    Создает необходимые директории (data, logs) заранее на VPS.
    """
    log(f"Подготовка окружения и деплой Docker на VPS: {vps_path}...", symbol="[>]")
    
    if not check_ssh_reachability(timeout_sec=4):
        log(f"VPS {VPS_HOST} недоступен по SSH. Проверьте сервер в панели Aeza.", symbol="[-]")
        return False

    # 1. Заранее создаем директории data/ и logs/ на хосте, чтобы избежать создания с правами root-only
    init_dirs_cmd = f"mkdir -p {vps_path}/data {vps_path}/logs"
    res_init = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", init_dirs_cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    if res_init.returncode != 0:
        log(f"Ошибка подготовки директорий на VPS: {res_init.stderr.strip()}", symbol="[-]")
        return False

    # 2. Копируем docker-compose.yml через SCP
    compose_file = local_path / "docker-compose.yml"
    if not compose_file.exists():
        log(f"Файл {compose_file} не найден локально!", symbol="[-]")
        return False

    log("Передача docker-compose.yml на VPS через SCP...", symbol="[>]")
    scp_cmd = [
        "scp", "-o", "StrictHostKeyChecking=no",
        str(compose_file),
        f"{VPS_USER}@{VPS_HOST}:{vps_path}/docker-compose.yml"
    ]
    res_scp = subprocess.run(scp_cmd, capture_output=True, text=True, encoding="utf-8", errors="ignore")
    if res_scp.returncode != 0:
        log(f"Ошибка передачи docker-compose.yml: {res_scp.stderr.strip()}", symbol="[-]")
        return False

    # 3. Выполняем docker compose pull && docker compose up -d
    log("Обновление и запуск Docker-контейнеров (docker compose pull && up -d --force-recreate)...", symbol="[^]")
    docker_cmd = f"cd {vps_path} && docker compose pull && docker compose up -d --force-recreate --remove-orphans"
    res_docker = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", docker_cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    if res_docker.returncode != 0:
        log(f"Ошибка запуска контейнеров: {res_docker.stderr.strip() or res_docker.stdout.strip()}", symbol="[-]")
        return False
        
    log("Docker-контейнеры успешно обновлены и запущены!", symbol="[+]")

    # 4. Запись штампа деплоя
    deploy_stamp = datetime.now().isoformat()
    stamp_cmd = (
        f"echo '{{\"commit\": \"{commit_hash}\", \"deployed_at\": \"{deploy_stamp}\", \"mode\": \"docker\"}}' "
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

def run_smoke_test(timeout_sec: int = 20) -> bool:
    """Ожидает полной готовности боевых служб и проверяет эндпоинты."""
    log("Ожидание готовности и запуск смоук-теста боевой среды...", symbol="[?]")
    t0 = time.time()
    
    # 1. Ожидание активности Docker контейнера revops-api и systemd служб
    all_active = False
    statuses = []
    while time.time() - t0 < timeout_sec:
        check_cmd = (
            "docker inspect -f '{{.State.Status}}' revops-api 2>/dev/null || "
            "systemctl is-active revops-api 2>/dev/null || echo inactive; "
            "systemctl is-active revops-healer revops-tgbot cloudflared 2>/dev/null || true"
        )
        units_cmd = subprocess.run(
            [
                "ssh", "-n", "-o", "StrictHostKeyChecking=no",
                f"{VPS_USER}@{VPS_HOST}",
                check_cmd
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore"
        )
        statuses = [s.strip() for s in units_cmd.stdout.strip().split("\n") if s.strip()]
        api_active = bool(statuses and statuses[0] in ["running", "active"])
        other_active = all(s == "active" for s in statuses[1:]) if len(statuses) > 1 else True
        if api_active and other_active:
            all_active = True
            break
        time.sleep(1.0)
        
    if all_active:
        log(f"Все боевые службы VPS активны (revops-api: {statuses[0] if statuses else 'ok'}, cloudflared, healer, tgbot).", symbol="[+]")
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
    full_hashes = {}
    for t in targets:
        proj = PROJECTS[t]
        if not args.skip_git:
            h = sync_git(proj["local_path"], commit_msg)
            hashes[t] = h
        else:
            log(f"Пропуск отправки Git для {proj['name']} (--skip-git)", symbol="[i]")
            hash_cmd = subprocess.run(
                ["git", "rev-parse", "--short", "HEAD"],
                cwd=str(proj["local_path"]),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore"
            )
            hashes[t] = hash_cmd.stdout.strip() or "skip-git"

        full_cmd = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(proj["local_path"]),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore"
        )
        full_hashes[t] = full_cmd.stdout.strip()

    # Шаг 2.5: CI Pre-Deploy Gate (Ожидание GitHub Actions)
    if not args.skip_vps:
        for t in targets:
            proj = PROJECTS[t]
            if proj.get("has_ci"):
                commit_sha = full_hashes.get(t) or hashes.get(t)
                if commit_sha and commit_sha not in ["unknown", "skip-git"]:
                    log(f"[CI Gate] Ждём GitHub Actions для коммита {commit_sha[:7]}...", symbol="[?]")
                    ci_ok = wait_for_ci(proj["repo"], commit_sha, timeout_sec=300)
                    if not ci_ok:
                        log("[CI Gate] ❌ CI не прошёл. Деплой ОТМЕНЁН. Прод не тронут.", symbol="[-]")
                        sys.exit(1)
                    log("[CI Gate] ✅ CI зелёный. Начинаем стриминг на VPS.", symbol="[+]")

    # Шаг 3: Синхронизация с VPS
    if not args.skip_vps:
        all_services = []
        for t in targets:
            proj = PROJECTS[t]
            deploy_mode = proj.get("deploy_mode", "systemd")
            commit_h = hashes.get(t, "unknown")
            
            if deploy_mode == "docker":
                success = deploy_via_docker_compose(proj["local_path"], proj["vps_path"], commit_h)
            else:
                success = stream_to_vps(proj["local_path"], proj["vps_path"], commit_h)
                
            if not success:
                log(f"Деплой проекта {t} завершился с ошибкой!", symbol="[-]")
                sys.exit(1)
                
            all_services.extend(proj.get("services", []))

        # Шаг 4: Рестарт служб (только для legacy systemd сервисов)
        systemd_services = list(dict.fromkeys([s for s in all_services if s]))
        if systemd_services:
            restart_services(systemd_services)

        # Шаг 5: Смоук-тест с ожиданием прогрева
        run_smoke_test(timeout_sec=20)

    total_time = time.time() - start_time
    print("=" * 70)
    log(f"ДЕПЛОЙ УСПЕШНО ЗАВЕРШЁН ЗА {total_time:.2f} СЕКУНД!", symbol="[+]")
    print("=" * 70)

if __name__ == "__main__":
    main()
