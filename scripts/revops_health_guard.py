#!/usr/bin/env python3
"""RevOps Enterprise OS - Autonomous Health Guard & Self-Healing Watchdog

Continuous health monitoring, auto-recovery of failed services, disk protection,
and external heartbeat ping (Dead Man's Switch). Supports running as one-shot check or continuous container daemon.
"""

import argparse
import json
import os
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

# Paths & Defaults
BASE_DIR = Path(__file__).resolve().parent.parent
CREDS_FILE = BASE_DIR / "telegram_credentials.json"
HEARTBEAT_CONFIG = BASE_DIR / "heartbeat_config.json"
LOG_DIR = BASE_DIR / "logs"
LOG_FILE = LOG_DIR / "health_guard.log"

SERVICES_TO_MONITOR = [
    "cloudflared.service",
    "revops-healer.service",
    "revops-tgbot.service",
]

DOCKER_CONTAINERS_TO_MONITOR = [
    "revops-api",
    "n8n",
    "caddy-n8n",
]

HTTP_ENDPOINTS = [
    {"name": "RevOps Intelligence SaaS API", "url": "http://127.0.0.1:8000/api/v1/health", "container": "revops-api"},
    {"name": "n8n Workflow Engine", "url": "http://127.0.0.1:5678/healthz", "container": "n8n"},
]


def log_message(msg: str):
    """Write timestamped log message."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{ts}] {msg}"
    print(formatted)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass


def send_telegram_alert(text: str):
    """Send alert via Telegram using stored credentials or environment variables."""
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("ADMIN_CHAT_ID")
    api_base = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org").rstrip("/")

    if not bot_token and CREDS_FILE.exists():
        try:
            data = json.loads(CREDS_FILE.read_text(encoding="utf-8"))
            bot_token = data.get("bot_token")
            chat_id = data.get("chat_id")
            api_base = data.get("api_base", api_base).rstrip("/")
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
        log_message(f"Failed to send Telegram alert: {e}")
        return False


def check_http_endpoint(url: str, timeout: int = 5) -> bool:
    """Check if an HTTP endpoint returns 200 OK."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RevOps-HealthGuard/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 400
    except Exception:
        return False


def is_systemd_service_active(service_name: str) -> bool:
    """Check if systemd service is active (running)."""
    try:
        res = subprocess.run(["systemctl", "is-active", service_name], capture_output=True, text=True, check=False)
        return res.stdout.strip() == "active"
    except Exception:
        return False


def is_docker_container_running(container_name: str) -> bool:
    """Check if docker container is in running state."""
    try:
        res = subprocess.run(
            ["docker", "inspect", "-f", "{{.State.Running}}", container_name],
            capture_output=True,
            text=True,
            check=False,
        )
        return res.stdout.strip().lower() == "true"
    except Exception:
        return False


def get_disk_info():
    """Get disk usage of root filesystem."""
    try:
        usage = shutil.disk_usage("/")
        total_gb = usage.total / (1024**3)
        used_gb = usage.used / (1024**3)
        free_gb = usage.free / (1024**3)
        percent = (usage.used / usage.total) * 100
        return {
            "total_gb": round(total_gb, 2),
            "used_gb": round(used_gb, 2),
            "free_gb": round(free_gb, 2),
            "percent_used": round(percent, 1),
            "is_critical": free_gb < 1.0,
        }
    except Exception as e:
        return {"error": str(e), "is_critical": False}


def get_ram_info():
    """Get RAM info from /proc/meminfo."""
    try:
        meminfo = {}
        with open("/proc/meminfo", "r", encoding="utf-8") as f:
            for line in f:
                parts = line.split(":")
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().split()[0]
                    meminfo[key] = int(val)
        total_mb = meminfo.get("MemTotal", 0) / 1024
        avail_mb = meminfo.get("MemAvailable", 0) / 1024
        used_mb = total_mb - avail_mb
        return {
            "total_mb": round(total_mb, 1),
            "used_mb": round(used_mb, 1),
            "available_mb": round(avail_mb, 1),
            "percent_used": round((used_mb / total_mb) * 100, 1) if total_mb else 0,
        }
    except Exception as e:
        return {"error": str(e)}


def perform_disk_emergency_cleanup():
    """Perform emergency disk cleanup when disk space is critically low."""
    log_message("CRITICAL: Disk free space < 1.0 GB. Running emergency prune...")
    subprocess.run(["docker", "system", "prune", "-f", "--volumes=false"], check=False)
    subprocess.run(["apt-get", "clean"], check=False)
    subprocess.run(["journalctl", "--vacuum-size=100M"], check=False)
    new_disk = get_disk_info()
    log_message(f"Emergency cleanup completed. Free disk space now: {new_disk.get('free_gb')} GB")
    return new_disk


def ping_external_heartbeat():
    """Ping external monitoring service (Healthchecks.io / Dead Man's Switch)."""
    if not HEARTBEAT_CONFIG.exists():
        return None
    try:
        cfg = json.loads(HEARTBEAT_CONFIG.read_text(encoding="utf-8"))
        hb_url = cfg.get("heartbeat_url")
        if not hb_url or not hb_url.startswith("http"):
            return None
        req = urllib.request.Request(hb_url, headers={"User-Agent": "RevOps-Pulse/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        log_message(f"External heartbeat ping failed: {e}")
        return False


def run_diagnostics_and_healing(auto_fix: bool = True, notify: bool = True):
    """Run full diagnostic cycle and self-healing actions."""
    report = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "status": "healthy",
        "failures": [],
        "healed": [],
        "disk": get_disk_info(),
        "ram": get_ram_info(),
        "services": {},
        "containers": {},
        "endpoints": {},
    }

    # 1. Check Disk
    if report["disk"].get("is_critical"):
        report["failures"].append(f"Диск переполнен: осталось всего {report['disk']['free_gb']} GB")
        if auto_fix:
            report["disk"] = perform_disk_emergency_cleanup()
            report["healed"].append("Выполнена экстренная очистка Docker кэша и системных журналов")

    # 2. Check Systemd Services (if host has systemd)
    if shutil.which("systemctl"):
        for svc in SERVICES_TO_MONITOR:
            active = is_systemd_service_active(svc)
            report["services"][svc] = "active" if active else "failed"
            if not active:
                report["status"] = "degraded"
                report["failures"].append(f"Служба {svc} остановлена")
                if auto_fix:
                    log_message(f"Attempting restart for service {svc}...")
                    subprocess.run(["systemctl", "restart", svc], check=False)
                    time.sleep(2)
                    if is_systemd_service_active(svc):
                        report["healed"].append(f"Служба {svc} успешно перезапущена")
                        report["services"][svc] = "active (recovered)"
                    else:
                        report["failures"].append(f"Службу {svc} не удалось поднять рестартом")

    # 3. Check Docker Containers
    if shutil.which("docker"):
        for ctr in DOCKER_CONTAINERS_TO_MONITOR:
            running = is_docker_container_running(ctr)
            report["containers"][ctr] = "running" if running else "stopped"
            if not running:
                report["status"] = "degraded"
                report["failures"].append(f"Контейнер {ctr} остановлен")
                if auto_fix:
                    log_message(f"Attempting restart for docker container {ctr}...")
                    subprocess.run(["docker", "restart", ctr], check=False)
                    time.sleep(3)
                    if is_docker_container_running(ctr):
                        report["healed"].append(f"Контейнер {ctr} успешно перезапущен")
                        report["containers"][ctr] = "running (recovered)"
                    else:
                        report["failures"].append(f"Контейнер {ctr} не удалось поднять рестартом")

    # 4. Check HTTP Health Endpoints
    for ep in HTTP_ENDPOINTS:
        ok = check_http_endpoint(ep["url"])
        report["endpoints"][ep["name"]] = "ok" if ok else "unresponsive"
        if not ok:
            report["status"] = "degraded"
            report["failures"].append(f"Эндпоинт {ep['name']} ({ep['url']}) не отвечает")
            if auto_fix and shutil.which("docker"):
                if ep.get("container"):
                    log_message(f"Restarting container {ep['container']} due to unresponsive HTTP...")
                    subprocess.run(["docker", "restart", ep["container"]], check=False)
                    time.sleep(3)
                    if check_http_endpoint(ep["url"]):
                        report["healed"].append(f"Эндпоинт {ep['name']} восстановил отклик после перезапуска")
                        report["endpoints"][ep["name"]] = "ok (recovered)"

    # Final status evaluation
    if report["failures"] and not report["healed"]:
        report["status"] = "critical"
    elif report["failures"] and report["healed"]:
        unresolved = [f for f in report["failures"] if not any(h.split()[1] in f for h in report["healed"] if len(h.split()) > 1)]
        if not unresolved:
            report["status"] = "recovered"
        else:
            report["status"] = "partially_recovered"

    # Send External Heartbeat if healthy or recovered
    if report["status"] in ("healthy", "recovered"):
        ping_external_heartbeat()

    # Telegram notification on incidents
    if notify and report["status"] != "healthy":
        fail_text = "\n".join(f"• {f}" for f in report["failures"])
        heal_text = "\n".join(f"• {h}" for h in report["healed"]) if report["healed"] else "Нет"
        tg_text = (
            f"🛠️ <b>[RevOps Self-Healing Guard]</b>\n"
            f"Статус системы: <b>{report['status'].upper()}</b>\n\n"
            f"<b>Зафиксированные сбои:</b>\n{fail_text}\n\n"
            f"<b>Действия авторемонта:</b>\n{heal_text}\n\n"
            f"Диск: свободно {report['disk'].get('free_gb')} GB | RAM: свободно {report['ram'].get('available_mb')} MB"
        )
        send_telegram_alert(tg_text)

    return report


def format_summary_for_tg(report: dict) -> str:
    """Format diagnostic report into human-readable Telegram summary."""
    status_icon = "🟢" if report["status"] == "healthy" else "🟡" if "recovered" in report["status"] else "🔴"
    lines = [
        f"{status_icon} <b>RevOps OS Health Dashboard</b>",
        f"📅 <i>{report['timestamp']}</i>",
        "",
        "<b>Службы и сервисы:</b>",
    ]
    for svc, st in report.get("services", {}).items():
        icon = "✅" if "active" in st else "❌"
        lines.append(f"  {icon} {svc}: <code>{st}</code>")
    for ctr, st in report.get("containers", {}).items():
        icon = "✅" if "running" in st else "❌"
        lines.append(f"  {icon} Docker {ctr}: <code>{st}</code>")
    for ep, st in report.get("endpoints", {}).items():
        icon = "✅" if "ok" in st else "❌"
        lines.append(f"  {icon} HTTP {ep}: <code>{st}</code>")

    disk = report.get("disk", {})
    ram = report.get("ram", {})
    lines.extend([
        "",
        "<b>Ресурсы сервера:</b>",
        f"  💾 Диск: свободно <b>{disk.get('free_gb')} GB</b> из {disk.get('total_gb')} GB ({disk.get('percent_used')}% занято)",
        f"  🧠 ОЗУ: свободно <b>{ram.get('available_mb')} MB</b> из {ram.get('total_mb')} MB ({ram.get('percent_used')}% занято)",
    ])

    if report.get("healed"):
        lines.append("\n<b>Последние автоисцеления:</b>")
        for h in report["healed"]:
            lines.append(f"  ⚡ {h}")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="RevOps Health Guard & Self-Healing Watchdog")
    parser.add_argument("--json", action="store_true", help="Print report in JSON")
    parser.add_argument("--summary", action="store_true", help="Print human-readable summary")
    parser.add_argument("--no-fix", action="store_true", help="Do not attempt auto-recovery")
    parser.add_argument("--no-notify", action="store_true", help="Do not send Telegram alerts")
    parser.add_argument("--interval", type=int, default=0, help="Run continuously in background daemon loop every N seconds")
    args = parser.parse_args()

    if args.interval > 0:
        log_message(f"Starting Health Guard daemon loop (interval={args.interval}s)...")
        while True:
            try:
                report = run_diagnostics_and_healing(auto_fix=not args.no_fix, notify=not args.no_notify)
                log_message(f"Health cycle finished: status={report.get('status')}")
            except Exception as e:
                log_message(f"Health cycle loop error: {e}")
            time.sleep(args.interval)
    else:
        report = run_diagnostics_and_healing(auto_fix=not args.no_fix, notify=not args.no_notify)
        if args.json:
            print(json.dumps(report, indent=2, ensure_ascii=False))
        elif args.summary:
            print(format_summary_for_tg(report))
        else:
            log_message(f"Health cycle finished: status={report['status']}")


if __name__ == "__main__":
    main()
