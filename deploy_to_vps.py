#!/usr/bin/env python3
"""
RevOps Enterprise OS — Unified Deployment Engine (Windows -> GitHub & Aeza VPS)
Сквозной деплой: валидация синтаксиса -> коммит и пуш в GitHub -> стриминг на VPS -> рестарт служб -> смоук-тест.
"""

import argparse
import base64
import json
import os
import py_compile
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

# Принудительная настройка кодировки консоли Windows на UTF-8 с безопасной заменой
if getattr(sys.stdout, "encoding", None) and str(sys.stdout.encoding).lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if getattr(sys.stderr, "encoding", None) and str(sys.stderr.encoding).lower() != "utf-8":
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
            log("GitHub обновлен успешно!", symbol="[+]")
    else:
        log("Все коммиты уже на GitHub.", symbol="[+]")

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

def load_github_token() -> str | None:
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
        Path(str(PROJECTS.get("saas", {}).get("local_path", "."))) / "deploy.env",
        Path(str(PROJECTS.get("saas", {}).get("local_path", "."))) / ".env",
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
                
            # Для revops-saas сборка и пуш Docker-образа происходят на шаге docker-build,
            # который зависит от backend и frontend тестов (needs: [...]).
            # Поэтому ждем, пока шаг сборки Docker-образа зарегистрируется и завершится!
            expects_docker_build = ("revops-saas" in repo.lower())
            has_docker_job = any("docker" in cr.get("name", "").lower() for cr in check_runs)
            
            all_completed = all(cr.get("status") == "completed" for cr in check_runs)
            all_success = all(cr.get("conclusion") in ["success", "neutral", "skipped"] for cr in check_runs)
            
            if expects_docker_build and not has_docker_job:
                status_summary = "ожидание регистрации сборки Docker-образа (GHCR)"
            elif all_completed and all_success:
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

def send_telegram_alert(text: str) -> bool:
    """Отправляет алерт в Telegram чат администратора."""
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("ADMIN_CHAT_ID") or os.getenv("TELEGRAM_CHAT_ID")
    api_base = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org").rstrip("/")

    candidate_files = [
        Path(__file__).resolve().parent / "telegram_credentials.json",
        Path.home() / "my_ai_crew" / "telegram_credentials.json",
        Path("telegram_credentials.json"),
    ]
    for c in candidate_files:
        if c.exists():
            try:
                data = json.loads(c.read_text(encoding="utf-8"))
                if not bot_token:
                    bot_token = data.get("bot_token")
                if not chat_id:
                    chat_id = str(data.get("chat_id", ""))
                api_base = data.get("api_base", api_base).rstrip("/")
                if bot_token and chat_id:
                    break
            except Exception:
                pass

    if not bot_token or not chat_id:
        return False

    try:
        url = f"{api_base}/bot{bot_token}/sendMessage"
        payload = json.dumps({"chat_id": chat_id, "text": text, "parse_mode": "HTML"}).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        log(f"[!] Ошибка отправки Telegram алерта: {e}", symbol="[!]")
        return False


def get_vps_deploy_info(vps_path: str) -> dict:
    """Получает текущие метаданные деплоя (.deploy_info.json) с VPS."""
    cmd = f"cat {vps_path}/.deploy_info.json 2>/dev/null || echo '{{}}'"
    res = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    try:
        return json.loads(res.stdout.strip())
    except Exception:
        return {}


def update_vps_deploy_info(vps_path: str, current_sha: str, previous_sha: str) -> bool:
    """Записывает метаданные деплоя в .deploy_info.json на VPS через base64."""
    deploy_stamp = datetime.now().isoformat()
    data = {
        "current_sha": current_sha,
        "previous_sha": previous_sha,
        "deployed_at": deploy_stamp,
        "mode": "docker"
    }
    raw_bytes = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
    b64_str = base64.b64encode(raw_bytes).decode("ascii")
    cmd = (
        f"python3 -c \""
        f"import pathlib, base64; "
        f"pathlib.Path('{vps_path}/.deploy_info.json').write_bytes(base64.b64decode('{b64_str}'))\""
    )
    res = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    return res.returncode == 0


def set_vps_image_tag(vps_path: str, tag: str) -> bool:
    """Обновляет или добавляет IMAGE_TAG в .env на VPS."""
    cmd = (
        f"python3 -c \""
        f"import pathlib; "
        f"p = pathlib.Path('{vps_path}/.env'); "
        f"txt = p.read_text(encoding='utf-8') if p.exists() else ''; "
        f"lines = [l for l in txt.splitlines() if not l.startswith('IMAGE_TAG=')]; "
        f"lines.append('IMAGE_TAG={tag}'); "
        f"p.write_text('\\n'.join(lines) + '\\n', encoding='utf-8')\""
    )
    res = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    return res.returncode == 0


BACKUP_SERVICE_UNIT = """[Unit]
Description=RevOps Hot Backup Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory={vps_path}
ExecStart=/usr/bin/docker exec revops-api python scripts/telegram_backup_engine.py
StandardOutput=journal
StandardError=journal
"""

BACKUP_TIMER_UNIT = """[Unit]
Description=Run RevOps Hot Backup every 6 hours
After=revops-api.service

[Timer]
OnCalendar=*-*-* 00,06,12,18:00:00
Persistent=true

[Install]
WantedBy=timers.target
"""


def setup_vps_backup_timer(vps_path: str = "/opt/revops-saas") -> bool:
    """Устанавливает и активирует revops-backup.service и revops-backup.timer на VPS."""
    log("Настройка автоматического таймера бэкапов (systemd: revops-backup.timer)...", symbol="[>]")
    service_content = BACKUP_SERVICE_UNIT.format(vps_path=vps_path)
    timer_content = BACKUP_TIMER_UNIT

    b64_svc = base64.b64encode(service_content.encode("utf-8")).decode("ascii")
    b64_timer = base64.b64encode(timer_content.encode("utf-8")).decode("ascii")

    cmd = (
        f"echo '{b64_svc}' | base64 -d > /etc/systemd/system/revops-backup.service && "
        f"echo '{b64_timer}' | base64 -d > /etc/systemd/system/revops-backup.timer && "
        f"systemctl daemon-reload && "
        f"systemctl enable --now revops-backup.timer"
    )
    res = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    if res.returncode != 0:
        log(f"[-] Ошибка установки systemd таймера бэкапа: {res.stderr.strip()}", symbol="[-]")
        return False

    log("✅ revops-backup.timer успешно установлен и активирован (каждые 6 часов)", symbol="[+]")
    return True



def resolve_commit_sha(repo: str, sha_or_prefix: str, local_path: Path | None = None) -> str:
    """Разрешает короткий или символический SHA в полный 40-значный коммит SHA."""
    if not sha_or_prefix or sha_or_prefix in ("latest", "unknown"):
        return sha_or_prefix
    if len(sha_or_prefix) == 40:
        return sha_or_prefix

    # Попытка локального разрешения через git rev-parse
    if local_path and (local_path / ".git").exists():
        try:
            res = subprocess.run(
                ["git", "rev-parse", sha_or_prefix],
                cwd=str(local_path),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore"
            )
            full_sha = res.stdout.strip()
            if len(full_sha) == 40:
                return full_sha
        except Exception:
            pass

    # Удалённое разрешение через GitHub REST API
    try:
        url = f"https://api.github.com/repos/{repo}/commits/{sha_or_prefix}"
        headers = {"User-Agent": "RevOps-Deploy/1.0"}
        tok = load_github_token()
        if tok:
            headers["Authorization"] = f"Bearer {tok}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("sha", sha_or_prefix)
    except Exception:
        pass
    return sha_or_prefix


def rollback_docker(vps_path: str, target_sha: str | None = None) -> bool:
    """
    Выполняет откат Docker сервиса на указанный SHA (или previous_sha).
    Не запускает git push и не ждёт CI (образ уже существует в GHCR).
    """
    repo = str(PROJECTS["saas"]["repo"])
    local_path = Path(str(PROJECTS["saas"]["local_path"]))
    info = get_vps_deploy_info(vps_path)
    current_sha = info.get("current_sha") or info.get("commit") or "latest"
    previous_sha = info.get("previous_sha")

    if not target_sha:
        target_sha = previous_sha

    if not target_sha or target_sha in ("unknown", "latest", ""):
        log("[-] Ошибка отката: предыдущая версия (previous_sha) не найдена в .deploy_info.json!", symbol="[-]")
        log("Укажите целевой SHA вручную: python deploy_to_vps.py saas --rollback <sha>", symbol="[i]")
        return False

    target_full = resolve_commit_sha(repo, target_sha, local_path)
    target_short = target_full[:7]
    current_short = current_sha[:7] if current_sha != "latest" else "latest"

    log(f"⏪ [Rollback] Запуск процедуры отката на версию {target_short} ({target_full})...", symbol="[^]")
    log(f"[i] Текущая активная версия в проде: {current_short}", symbol="[i]")

    # 1. Проверяем доступность SSH
    if not check_ssh_reachability(timeout_sec=4):
        log(f"VPS {VPS_HOST} недоступен по SSH. Откат прерван.", symbol="[-]")
        return False

    # 2. Выставляем целевой IMAGE_TAG в .env на VPS
    set_vps_image_tag(vps_path, target_full)

    # 3. Пуллим целевой образ и перезапускаем контейнер
    log(f"Загрузка образа {target_short} и перезапуск контейнера...", symbol="[^]")
    docker_cmd = f"cd {vps_path} && docker compose pull && docker compose up -d --force-recreate --remove-orphans"
    res_docker = subprocess.run(
        ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", docker_cmd],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="ignore"
    )
    if res_docker.returncode != 0:
        log(f"[-] Ошибка pull/up при откате: {res_docker.stderr.strip() or res_docker.stdout.strip()}", symbol="[-]")
        return False

    # 4. Проверяем смоук-тестом
    log("Проверка здоровья боевого API после отката...", symbol="[?]")
    smoke_ok = run_smoke_test(timeout_sec=20)

    if smoke_ok:
        update_vps_deploy_info(vps_path, current_sha=target_short, previous_sha=current_short)
        log(f"✅ [Rollback] ОТКАТ УСПЕШНО ВЫПОЛНЕН! Активная версия: {target_short}", symbol="[+]")
        return True
    else:
        log(f"❌ [Rollback] Смоук-тест версии {target_short} провален! Экстренное восстановление {current_short}...", symbol="[-]")
        set_vps_image_tag(vps_path, resolve_commit_sha(repo, current_sha, local_path))
        subprocess.run(
            ["ssh", "-n", "-o", "StrictHostKeyChecking=no", f"{VPS_USER}@{VPS_HOST}", docker_cmd],
            capture_output=True
        )
        send_telegram_alert(
            f"🚨 <b>[RevOps Disaster Alert]</b>\n"
            f"Попытка отката на <code>{target_short}</code> завершилась ошибкой смоук-теста!\n"
            f"Сервер автоматически возвращен на <code>{current_short}</code>."
        )
        return False


def list_versions(repo: str, vps_path: str):
    """Показывает список доступных версий/образов для отката."""
    log(f"Запрос списка доступных версий из {repo}...", symbol="[?]")
    info = get_vps_deploy_info(vps_path)
    current_sha = info.get("current_sha", "")
    previous_sha = info.get("previous_sha", "")
    deployed_at = info.get("deployed_at", "неизвестно")

    print("\n" + "=" * 70)
    print("      ТЕКУЩЕЕ СОСТОЯНИЕ НА VPS")
    print("=" * 70)
    print(f"  • Текущая активная версия (current_sha):  {current_sha or 'latest'}")
    print(f"  • Предыдущая версия (previous_sha):      {previous_sha or 'нет'}")
    print(f"  • Время последнего деплоя:               {deployed_at}")
    print("=" * 70)

    url = f"https://api.github.com/repos/{repo}/commits?per_page=15"
    headers = {"User-Agent": "RevOps-Deploy/1.0"}
    tok = load_github_token()
    if tok:
        headers["Authorization"] = f"Bearer {tok}"

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            commits = json.loads(resp.read().decode("utf-8"))

        print("\n" + "=" * 70)
        print("      ДОСТУПНЫЕ ДЛЯ ОТКАТА ВЕРСИИ (GHCR / GitHub Commits)")
        print("=" * 70)
        for c in commits:
            sha_full = c["sha"]
            sha_short = sha_full[:7]
            msg = c["commit"]["message"].splitlines()[0]
            date_str = c["commit"]["committer"]["date"].replace("T", " ").replace("Z", " UTC")

            badge = ""
            if sha_short == current_sha or sha_full == current_sha:
                badge = " 🟢 [АКТИВЕН В ПРОДЕ]"
            elif sha_short == previous_sha or sha_full == previous_sha:
                badge = " 🟡 [ПРЕДЫДУЩАЯ ВЕРСИЯ]"

            print(f"  [{sha_short}] {date_str} - {msg[:45]}{badge}")
        print("=" * 70)
        print("Для отката выполните:")
        print("  python deploy_to_vps.py saas --rollback <sha>")
        print(f"  python deploy_to_vps.py saas --rollback           (на {previous_sha or 'предыдущую'})\n")
    except Exception as e:
        log(f"[-] Не удалось получить список коммитов: {e}", symbol="[-]")


def deploy_via_docker_compose(local_path: Path, vps_path: str, commit_hash: str, commit_full_hash: str | None = None) -> bool:
    """
    Копирует docker-compose.yml на VPS и запускает контейнеры через Docker Compose.
    Создает необходимые директории (data, logs) заранее на VPS.
    Записывает .deploy_info.json с current_sha и previous_sha.
    """
    log(f"Подготовка окружения и деплой Docker на VPS: {vps_path}...", symbol="[>]")

    if not check_ssh_reachability(timeout_sec=4):
        log(f"VPS {VPS_HOST} недоступен по SSH. Проверьте сервер в панели Aeza.", symbol="[-]")
        return False

    # 1. Читаем старый .deploy_info.json для фиксации previous_sha
    old_info = get_vps_deploy_info(vps_path)
    old_sha = old_info.get("current_sha") or old_info.get("commit") or ""

    # 2. Заранее создаем директории data/ и logs/ на хосте, чтобы избежать создания с правами root-only
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

    # 3. Копируем docker-compose.yml через SCP
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

    # 4. Выставляем IMAGE_TAG в .env на VPS
    tag_to_set = commit_full_hash or commit_hash
    set_vps_image_tag(vps_path, tag_to_set)

    # 5. Выполняем docker compose pull && docker compose up -d
    log(f"Обновление и запуск Docker-контейнеров (IMAGE_TAG={commit_hash[:7]})...", symbol="[^]")
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

    # 6. Запись метаданных деплоя
    curr_short = commit_hash[:7] if commit_hash != "unknown" else "unknown"
    prev_short = old_sha[:7] if old_sha else ""
    update_vps_deploy_info(vps_path, current_sha=curr_short, previous_sha=prev_short)

    # 7. Настройка и запуск таймера резервного копирования
    setup_vps_backup_timer(vps_path)
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
    parser.add_argument("--rollback", nargs="?", const="", default=None,
                        help="Откатить сервис saas на указанный SHA (или на previous_sha, если SHA не передан)")
    parser.add_argument("--list-versions", action="store_true",
                        help="Показать список доступных версий и текущее состояние VPS")
    parser.add_argument("--setup-backup", action="store_true",
                        help="Установить и активировать revops-backup.timer на VPS")
    args = parser.parse_args()

    # Быстрый режим: просмотр доступных версий
    if args.list_versions:
        list_versions(PROJECTS["saas"]["repo"], PROJECTS["saas"]["vps_path"])
        sys.exit(0)

    # Быстрый режим: настройка таймера бэкапов
    if args.setup_backup:
        setup_vps_backup_timer(PROJECTS["saas"]["vps_path"])
        sys.exit(0)

    # Быстрый режим: процедура отката (Rollback)
    if args.rollback is not None:
        target_sha = args.rollback.strip() if args.rollback else None
        print("=" * 70)
        print("      REVOPS ENTERPRISE OS — ROLLBACK ENGINE")
        print(f"      Целевая версия: {target_sha or 'previous_sha'} | VPS: {VPS_HOST} (Aeza 24/7)")
        print("=" * 70)
        ok = rollback_docker(PROJECTS["saas"]["vps_path"], target_sha=target_sha)
        if ok:
            print("=" * 70)
            log("ОТКАТ УСПЕШНО ЗАВЕРШЁН!", symbol="[+]")
            print("=" * 70)
            sys.exit(0)
        else:
            print("=" * 70)
            log("ОТКАТ ЗАВЕРШИЛСЯ С ОШИБКОЙ!", symbol="[-]")
            print("=" * 70)
            sys.exit(1)

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
                stream_to_vps(proj["local_path"], proj["vps_path"], commit_h)
                success = deploy_via_docker_compose(proj["local_path"], proj["vps_path"], commit_h, full_hashes.get(t))
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

        # Шаг 5: Смоук-тест с ожиданием прогрева и авто-откатом при сбое
        smoke_ok = run_smoke_test(timeout_sec=20)
        if not smoke_ok:
            log("[-] Смоук-тест боевой среды провален!", symbol="[-]")
            if "saas" in targets:
                vps_p = PROJECTS["saas"]["vps_path"]
                info = get_vps_deploy_info(vps_p)
                prev = info.get("previous_sha")
                if prev:
                    log(f"[!] Смоук-тест провален. Автоматический откат на previous_sha ({prev})...", symbol="[!]")
                    rb_ok = rollback_docker(vps_p, target_sha=prev)
                    status_text = "УСПЕШНО ВЫПОЛНЕН" if rb_ok else "ПРОВАЛИЛСЯ"
                    send_telegram_alert(
                        f"🚨 <b>[RevOps Auto-Rollback Alert]</b>\n"
                        f"Смоук-тест нового релиза <code>{hashes.get('saas', 'unknown')}</code> провален!\n"
                        f"Автоматический откат на <code>{prev}</code>: <b>{status_text}</b>"
                    )
            sys.exit(1)

    total_time = time.time() - start_time
    print("=" * 70)
    log(f"ДЕПЛОЙ УСПЕШНО ЗАВЕРШЁН ЗА {total_time:.2f} СЕКУНД!", symbol="[+]")
    print("=" * 70)

if __name__ == "__main__":
    main()
