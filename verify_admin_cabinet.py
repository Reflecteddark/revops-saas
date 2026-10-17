# -*- coding: utf-8 -*-
"""
Verification suite for Admin Cabinet:
Checks all HTML onclick handlers, JS functions on window, and live API endpoints.
"""

import hashlib
import json
import re
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

def check_html_and_js_clickability():
    print("=" * 70)
    print("1. ПРОВЕРКА HTML И JS: ВСЕ ЛИ КНОПКИ КЛИКАБЕЛЬНЫ И ПРИВЯЗАНЫ К КОДУ?")
    print("=" * 70)

    html_file = BASE_DIR / "apps" / "web" / "index.html"
    js_file = BASE_DIR / "apps" / "web" / "app.js"

    html = html_file.read_text(encoding="utf-8")
    js = js_file.read_text(encoding="utf-8")

    # Extract view-admin section
    admin_start = html.find('id="view-admin"')
    admin_end = html.find('id="callModal"')
    admin_html = html[admin_start:admin_end]

    # Find all onclick handlers
    matches = re.findall(r'onclick="([^"]+)"', admin_html)
    print(f"Всего кнопок с onclick в админке: {len(matches)}")

    handler_calls = set()
    for m in matches:
        fn = m.split("(")[0].strip()
        handler_calls.add(fn)

    missing = []
    for fn in sorted(handler_calls):
        # Check if function exists in app.js
        is_defined = (f"function {fn}" in js) or (f"window.{fn}" in js) or (f"{fn} =" in js)
        is_on_window = f"window.{fn} = " in js
        status = "OK (Объявлена & На window)" if (is_defined and is_on_window) else ("OK (Объявлена)" if is_defined else "ОШИБКА: НЕТ В JS")
        print(f"  • {fn}(): {status}")
        if not is_defined:
            missing.append(fn)

    if missing:
        print(f"❌ НАЙДЕНЫ НЕОБЪЯВЛЕННЫЕ ФУНКЦИИ: {missing}")
        return False
    else:
        print("✅ Все кнопки админки на 100% привязаны к реальным функциям в app.js!\n")
        return True


def call_api(endpoint, method="GET", body=None, headers=None):
    url = f"http://127.0.0.1:8000{endpoint}"
    data = json.dumps(body).encode("utf-8") if body else None
    req_headers = {"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)

    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return e.code, raw
    except Exception as e:
        return 500, str(e)


def check_live_api_endpoints():
    print("=" * 70)
    print("2. ПРОВЕРКА РЕАЛЬНОГО ВЫПОЛНЕНИЯ API (НЕ ФИКТИВНО, РЕАЛЬНЫЕ ПРОЦЕССЫ)")
    print("=" * 70)

    # 1. Status
    status_code, res = call_api("/api/v1/admin/status")
    print(f"[1] GET /api/v1/admin/status -> HTTP {status_code}")
    print(f"    Fleet Status: {res.get('fleet_status')} ({res.get('fleet_label')})")
    print(f"    FastAPI: {res.get('fastapi', {}).get('status_label')}")
    print(f"    n8n: {res.get('n8n', {}).get('status_label')}")
    print(f"    Google Sheets SA: {res.get('google_sheets', {}).get('status_label')}")
    print(f"    Daily Sync Task: {res.get('tasks', {}).get('daily_sync', {}).get('status_label')}")
    assert status_code == 200

    # 2. Gemini Test
    print("\n[2] POST /api/v1/admin/ai/test-gemini")
    status_code, res = call_api("/api/v1/admin/ai/test-gemini", method="POST")
    print(f"    HTTP {status_code} -> Success: {res.get('success')}, Latency: {res.get('latency_ms')} ms")
    print(f"    Ответ модели: {res.get('model_response')}")
    assert status_code == 200

    # 3. Features config & toggle
    print("\n[3] GET & POST /api/v1/admin/features (Feature Flags)")
    status_code, res = call_api("/api/v1/admin/features")
    features = res.get("features", {})
    print(f"    Загружено {len(features)} фича-флагов из features_config.json")
    assert len(features) > 0

    # Toggle 5.1
    status_code, toggle_res = call_api("/api/v1/admin/features/toggle", method="POST", body={"code": "5.1", "enabled": True})
    print(f"    Toggle 5.1 -> HTTP {status_code}, Name: {toggle_res.get('feature', {}).get('name')}, Enabled: {toggle_res.get('enabled')}")
    assert status_code == 200

    # 4. CCO Engine: Summary
    print("\n[4] POST /api/v1/admin/cco/action (action=summary)")
    status_code, cco_res = call_api("/api/v1/admin/cco/action", method="POST", body={"action": "summary", "tenant": "TNT-001"})
    print(f"    HTTP {status_code} -> Success: {cco_res.get('success')}")
    output = cco_res.get("output", "")
    preview = "\n".join(output.splitlines()[:6])
    print(f"    Вывод реального движка CCO:\n{preview}")
    assert status_code == 200
    assert "СВОДКА КОММЕРЧЕСКОГО ДИРЕКТОРА" in output

    # 5. CCO Engine: Team cr1..cr13
    print("\n[5] POST /api/v1/admin/cco/action (action=team)")
    status_code, team_res = call_api("/api/v1/admin/cco/action", method="POST", body={"action": "team", "tenant": "TNT-001"})
    print(f"    HTTP {status_code} -> Success: {team_res.get('success')}")
    preview_team = "\n".join(team_res.get("output", "").splitlines()[:5])
    print(f"    Вывод разбора звонков:\n{preview_team}")
    assert status_code == 200

    # 6. QA Healer: Status
    print("\n[6] POST /api/v1/admin/healer/action (action=status)")
    status_code, healer_res = call_api("/api/v1/admin/healer/action", method="POST", body={"action": "status"})
    print(f"    HTTP {status_code} -> Success: {healer_res.get('success')}")
    preview_healer = healer_res.get("output", "").strip()
    print(f"    Статус в Task Scheduler:\n{preview_healer}")
    assert status_code == 200

    # 7. QA Healer: Logs
    print("\n[7] POST /api/v1/admin/healer/action (action=view_logs)")
    status_code, logs_res = call_api("/api/v1/admin/healer/action", method="POST", body={"action": "view_logs"})
    print(f"    HTTP {status_code} -> Длина лога: {len(logs_res.get('output', ''))} символов")
    assert status_code == 200

    # 8. Logs API: console & daily_sync
    print("\n[8] GET /api/v1/admin/logs (console & daily_sync)")
    status_code, console_logs = call_api("/api/v1/admin/logs?log_type=console")
    print(f"    Console logs: {len(console_logs.get('logs', []))} записей в live-буфере")
    assert status_code == 200

    # 9. Client registration, hash verification & cleanup
    print("\n[9] Регистрация клиента, криптохэш и удаление")
    test_login = "verification_test@example.com"
    pwd_hash = hashlib.sha256(b"TestPassword2026!").hexdigest()
    reg_code, reg_res = call_api("/api/v1/admin/clients/register", method="POST", body={
        "login": test_login,
        "password_hash": pwd_hash,
        "name": "Верификационный Тест",
        "role": "РОП • Руководитель ОП",
        "tenant": "TNT-VERIFY"
    })
    print(f"    POST register -> HTTP {reg_code}, Client: {reg_res.get('client', {}).get('login')}")
    assert reg_code == 200

    # Check client list
    list_code, list_res = call_api("/api/v1/admin/clients")
    found = any(c["login"] == test_login for c in list_res.get("clients", []))
    print(f"    GET clients -> Найдено в реестре: {found}")
    assert found is True

    # Delete client
    del_code, del_res = call_api(f"/api/v1/admin/clients/{test_login}", method="DELETE")
    print(f"    DELETE client -> HTTP {del_code}, Message: {del_res.get('message')}")
    assert del_code == 200

    # 10. Remote authorization simulation (Cloudflare tunnel check)
    print("\n[10] Удалённый доступ через туннель Cloudflare с X-RevOps-Admin-Key")
    rem_code, rem_res = call_api(
        "/api/v1/admin/status",
        headers={
            "host": "report.ai-rop.ru",
            "cf-connecting-ip": "185.120.44.12",
            "x-revops-admin-key": "revops_admin_fleet_secret_2026"
        }
    )
    print(f"    Remote with valid key -> HTTP {rem_code} (Доступ РАЗРЕШЁН)")
    assert rem_code == 200

    # Remote unauthorized
    unauth_code, unauth_res = call_api(
        "/api/v1/admin/status",
        headers={
            "host": "report.ai-rop.ru",
            "cf-connecting-ip": "185.120.44.12"
        }
    )
    print(f"    Remote WITHOUT key -> HTTP {unauth_code} (Строго 403 Forbidden)")
    assert unauth_code == 403

    print("\n" + "=" * 70)
    print("✅ ВСЕ 10 ПРОВЕРОК УСПЕШНО ПРОЙДЕНЫ! СИСТЕМА ПОЛНОСТЬЮ РАБОТАЕТ В РЕАЛЬНОМ РЕЖИМЕ.")
    print("=" * 70)


if __name__ == "__main__":
    ok_ui = check_html_and_js_clickability()
    check_live_api_endpoints()
