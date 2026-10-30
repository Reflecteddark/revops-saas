# -*- coding: utf-8 -*-
"""
Загрузчик аудиозвонков (MP3) в amoCRM для запуска ИИ-аудита RevOps.

Скрипт передает MP3 аудиозапись на сервер RevOps, регистрирует ее
как звонок телефонии в amoCRM (с виджетом плеера) и запускает автоматический
пайплайн: n8n -> Google Gemini AI (13 критериев) -> Google Таблица raw_calls.

Использование:
    python scripts/upload_call_to_amocrm.py "путь/к/звонку.mp3"
    python scripts/upload_call_to_amocrm.py "путь/к/звонку.mp3" --lead-id 5066115
    python scripts/upload_call_to_amocrm.py --folder "calls_to_upload"
"""

import os
import sys
import argparse
from pathlib import Path
import requests

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

API_ENDPOINT = "https://report.ai-rop.ru/api/v1/calls/inject-amocrm"
DEFAULT_TENANT = "TNT-004"


def upload_single_call(
    file_path: Path,
    tenant_id: str = DEFAULT_TENANT,
    lead_id: int | None = None,
    phone: str = "+79990001122",
    duration: int | None = None,
    direction: str = "call_in"
) -> bool:
    if not file_path.exists() or not file_path.is_file():
        print(f"❌ Файл не найден: {file_path}")
        return False

    file_size_kb = file_path.stat().st_size / 1024
    print(f"\n🎙️ Обработка: {file_path.name} ({file_size_kb:.1f} KB)")
    print(f"   Тенант: {tenant_id}")
    if lead_id:
        print(f"   Сделка amoCRM: #{lead_id}")
    else:
        print("   Сделка amoCRM: авто-определение (последняя активная)")

    try:
        with open(file_path, "rb") as f:
            audio_bytes = f.read()

        params = {
            "tenant_id": tenant_id,
            "filename": file_path.name,
            "phone": phone,
            "call_direction": direction
        }
        if lead_id:
            params["lead_id"] = lead_id
        if duration:
            params["duration"] = duration

        print("   ⏳ Загрузка аудио на сервер и регистрация в amoCRM...")
        resp = requests.post(
            API_ENDPOINT,
            params=params,
            data=audio_bytes,
            headers={"Content-Type": "audio/mpeg"},
            timeout=30
        )

        if resp.status_code == 200:
            data = resp.json()
            print("   ✅ УСПЕШНО ЗАРЕГИСТРИРОВАНО!")
            print(f"   • Сделка в amoCRM: #{data.get('lead_id')}")
            print(f"   • ID звонка (call_id): {data.get('call_id')}")
            print(f"   • ID примечания: {data.get('note_id')}")
            print(f"   • Ссылка на аудио: {data.get('audio_url')}")
            print("   🤖 n8n подхватит звонок в течение ~1-2 мин, Gemini проведет аудит")
            print("      и запишет результаты в Google Sheets и дашборд.")
            return True
        else:
            print(f"   ❌ Ошибка сервера ({resp.status_code}): {resp.text}")
            return False

    except Exception as e:
        print(f"   ❌ Исключение при отправке: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Загрузка звонков MP3 в amoCRM для ИИ-аудита")
    parser.add_argument("file", nargs="?", help="Путь к файлу .mp3")
    parser.add_argument("--folder", "-f", help="Папка с файлами .mp3 для пакетной загрузки")
    parser.add_argument("--tenant", "-t", default=DEFAULT_TENANT, help="ID тенанта (по умолчанию TNT-004)")
    parser.add_argument("--lead-id", "-l", type=int, help="ID сделки в amoCRM (опционально)")
    parser.add_argument("--phone", "-p", default="+79990001122", help="Номер телефона клиента")
    parser.add_argument("--duration", "-d", type=int, help="Длительность звонка в секундах")
    args = parser.parse_args()

    # Сценарий 1: указан конкретный файл
    if args.file:
        target = Path(args.file)
        upload_single_call(target, args.tenant, args.lead_id, args.phone, args.duration)
        return

    # Сценарий 2: указана папка или ищем в стандартной папке 'calls_to_upload'
    folder_path = Path(args.folder) if args.folder else Path(__file__).resolve().parent.parent / "calls_to_upload"
    if folder_path.exists() and folder_path.is_dir():
        mp3_files = sorted(list(folder_path.glob("*.mp3")) + list(folder_path.glob("*.wav")) + list(folder_path.glob("*.m4a")))
        if not mp3_files:
            print(f"ℹ️ В папке '{folder_path}' нет файлов .mp3 / .wav / .m4a.")
            print("Положите файлы в папку 'calls_to_upload' и запустите снова.")
            return

        print(f"📂 Найдено файлов для загрузки: {len(mp3_files)}")
        success_count = 0
        for f in mp3_files:
            ok = upload_single_call(f, args.tenant, args.lead_id, args.phone, args.duration)
            if ok:
                success_count += 1

        print(f"\n🏁 Завершено! Успешно отправлено: {success_count}/{len(mp3_files)} звонков.")
    else:
        print("Укажите файл: python upload_call_to_amocrm.py <путь_к_mp3>")
        print("Или положите звонки в папку 'calls_to_upload'.")


if __name__ == "__main__":
    main()
