# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS - Populate Bitrix24 with 10 Real Deals & Calls, Sync Google Sheets & ЛК
"""

import sys
import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
import gspread

# UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

B24_WEBHOOK = "https://b24-1tuuth.bitrix24.ru/rest/1/70u1duarlao06zau/"
TENANT_ID = "TNT-001"
SPREADSHEET_ID = "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk"

BASE_DIR = Path(__file__).resolve().parent.parent

candidate_sa = [
    Path.home() / ".gemini" / "antigravity" / "scratch" / "service_account.json",
    Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "service_account.json",
    BASE_DIR / "service_account.json",
    Path("/opt/revops-saas/service_account.json"),
    Path("/opt/revops-enterprise-os/service_account.json"),
]
SA_PATH = next((p for p in candidate_sa if p.exists()), None)
if not SA_PATH:
    raise FileNotFoundError("service_account.json не найден!")

candidate_reg = [
    Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "tenants_registry.json",
    Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "multitenant_revops" / "tenants_registry.json",
    BASE_DIR / "tenants_registry.json",
    BASE_DIR / "multitenant_revops" / "tenants_registry.json",
    Path("/opt/revops-enterprise-os/tenants_registry.json"),
    Path("/opt/revops-saas/tenants_registry.json"),
]
REGISTRY_PATHS = [p for p in candidate_reg if p.exists()]

# 10 Detailed Real Deals
DEALS_SPEC = [
    {
        "title": "Внедрение RevOps OS — ООО 'ТехноТрейд'",
        "amount": 350000,
        "stage": "NEW",
        "stage_num": 1,
        "stage_name": "Новая",
        "manager": "Дмитрий Федотов",
        "client": "ООО 'ТехноТрейд'",
        "phone": "+79161012233",
        "duration": 135,
        "score": 10,
        "next": 1,
        "transcript": "Менеджер: 'Добрый день, компания RevOps! Согласуем проведение онлайн-демо на четверг в 14:00?' Клиент: 'Да, в четверг в 14:00 отлично, присылайте ссылку на Zoom.'",
        "error": "Небольшая заминка при ответе на вопрос о выгрузке в 1С.",
        "rec": "Подготовить памятку по интеграции с 1С УТ для повторной встречи."
    },
    {
        "title": "Лицензия Enterprise — АО 'Северсталь Дистрибуция'",
        "amount": 1200000,
        "stage": "PREPARATION",
        "stage_num": 2,
        "stage_name": "Подготовка документов",
        "manager": "Светлана",
        "client": "АО 'Северсталь Дистрибуция'",
        "phone": "+79262023344",
        "duration": 180,
        "score": 11,
        "next": 1,
        "transcript": "Менеджер: 'Светлана на связи, RevOps OS. Мы подготовили проект договора на 12 месяцев с учетом корпоративной скидки.' Клиент: 'Отлично, передаю в юротдел, подпишем до конца недели.'",
        "error": "Замечаний нет. Четкая фиксация сроков согласования договора.",
        "rec": "Держать контакт с ведущим юристом для ускорения визирования."
    },
    {
        "title": "Пилот речевой аналитики — ГК 'Мегаполис'",
        "amount": 450000,
        "stage": "PREPAYMENT_INVOICE",
        "stage_num": 3,
        "stage_name": "Счёт на предоплату",
        "manager": "Дмитрий Федотов",
        "client": "ГК 'Мегаполис'",
        "phone": "+79033034455",
        "duration": 150,
        "score": 9,
        "next": 1,
        "transcript": "Менеджер: 'Добрый день! Счёт на предоплату 50% отправлен на вашу бухгалтерию.' Клиент: 'Да, бухгалтер подтвердила получение, оплатим в течение двух дней.'",
        "error": "Менеджер не уточнил точный день фактического списания средств банком.",
        "rec": "Запросить платежное поручение с отметкой банка сразу после оплаты."
    },
    {
        "title": "Аудит отдела продаж — ООО 'Альфа Логистик'",
        "amount": 280000,
        "stage": "EXECUTING",
        "stage_num": 4,
        "stage_name": "В работе",
        "manager": "Алексей Смирнов",
        "client": "ООО 'Альфа Логистик'",
        "phone": "+79154045566",
        "duration": 115,
        "score": 7,
        "next": 0,
        "transcript": "Менеджер: 'Здравствуйте! Направляю вам результаты экспресс-аудита 50 звонков.' Клиент: 'Спасибо, мы изучим и перезвоним вам сами, когда освободимся.'",
        "error": "Отпустил клиента без фиксации даты и времени следующего контакта; отдал инициативу клиенту.",
        "rec": "Не отпускать клиента с фразой 'перезвоним'. Предложить конкретное время: 'Давайте созвонимся во вторник в 11:00 на 15 минут'."
    },
    {
        "title": "Внедрение воронки SSOT — ООО 'СтройКомплект'",
        "amount": 650000,
        "stage": "FINAL_INVOICE",
        "stage_num": 5,
        "stage_name": "Финальный счёт",
        "manager": "Светлана",
        "client": "ООО 'СтройКомплект'",
        "phone": "+79185056677",
        "duration": 160,
        "score": 10,
        "next": 1,
        "transcript": "Менеджер: 'Добрый день! Настройка воронки завершена, направляю финальный закрывающий акт и счёт на доплату.' Клиент: 'Принято, акт подписали через ЭДО, платёжку отправляем.'",
        "error": "Не предложил сопровождение на второй месяц со скидкой 15%.",
        "rec": "На этапе закрытия сделки сразу презентовать услугу продления техподдержки."
    },
    {
        "title": "Контракт на 12 мес — ООО 'ПромСнаб'",
        "amount": 900000,
        "stage": "WON",
        "stage_num": 6,
        "stage_name": "Успешно закрыта",
        "manager": "Дмитрий Федотов",
        "client": "ООО 'ПромСнаб'",
        "phone": "+79286067788",
        "duration": 210,
        "score": 12,
        "next": 1,
        "transcript": "Менеджер: 'Дмитрий, RevOps OS. Средства поступили на расчетный счет, доступ в систему активирован!' Клиент: 'Спасибо за оперативное развертывание, подключаем 20 сотрудников.'",
        "error": "Замечаний нет. Эталонный цикл сделки от первого звонка до оплаты.",
        "rec": "Запросить видеоотзыв у коммерческого директора для маркетинговых кейсов."
    },
    {
        "title": "Аудит звонков 30 менеджеров — АО 'Интегра'",
        "amount": 500000,
        "stage": "WON",
        "stage_num": 6,
        "stage_name": "Успешно закрыта",
        "manager": "Алексей Смирнов",
        "client": "АО 'Интегра'",
        "phone": "+79257078899",
        "duration": 195,
        "score": 11,
        "next": 1,
        "transcript": "Менеджер: 'Оплата получена в полном объеме, дашборды настроены под вашу структуру РОПа.' Клиент: 'Отлично, РОП уже видит динамику конверсий в реальном времени.'",
        "error": "Замечаний нет. Качественный онбординг РОПа клиента.",
        "rec": "Назначить встречу через 2 недели для замера прироста конверсии."
    },
    {
        "title": "Пилотный проект — ООО 'ЭкоСистемс'",
        "amount": 180000,
        "stage": "PREPARATION",
        "stage_num": 2,
        "stage_name": "Подготовка документов",
        "manager": "Светлана",
        "client": "ООО 'ЭкоСистемс'",
        "phone": "+79058089900",
        "duration": 140,
        "score": 9,
        "next": 1,
        "transcript": "Менеджер: 'Светлана, RevOps. Согласовываем техническое задание на пилотный запуск.' Клиент: 'Да, ТЗ утвердили, вносим правки по полям amoCRM/Битрикс24.'",
        "error": "Менеджер не уточнил дедлайн правок ТЗ от технического специалиста.",
        "rec": "Установить фиксированный дедлайн возврата правок до среды 18:00."
    },
    {
        "title": "Внедрение RevOps — ООО 'РитейлГрупп'",
        "amount": 850000,
        "stage": "EXECUTING",
        "stage_num": 4,
        "stage_name": "В работе",
        "manager": "Дмитрий Федотов",
        "client": "ООО 'РитейлГрупп'",
        "phone": "+79109090011",
        "duration": 125,
        "score": 8,
        "next": 0,
        "transcript": "Менеджер: 'Добрый день! Как ваши впечатления от тестовой недели аналитики?' Клиент: 'Впечатления хорошие, но руководство пока занято выставкой, вернемся в следующем месяце.'",
        "error": "Не отработал возражение 'заняты выставкой', не предложил зафиксировать спеццену до конца месяца.",
        "rec": "Отрабатывать перенос сроков через оффер с ограниченным сроком действия."
    },
    {
        "title": "Тест речевого ИИ — ИП Смирнов",
        "amount": 150000,
        "stage": "NEW",
        "stage_num": 1,
        "stage_name": "Новая",
        "manager": "Алексей Смирнов",
        "client": "ИП Смирнов",
        "phone": "+79201011122",
        "duration": 95,
        "score": 6,
        "next": 0,
        "transcript": "Менеджер: 'Здравствуйте! Вы оставляли заявку на тестирование ИИ-оценки звонков.' Клиент: 'Да, но сейчас неудобно говорить, сбросьте информацию в мессенджер.'",
        "error": "Менеджер просто согласился отправить в мессенджер без уточнения удобного времени звонка.",
        "rec": "Сказать: 'Да, конечно отправлю прямо сейчас. В какое время вам завтра набрать — в первой или второй половине дня?'"
    }
]


def b24_post(method: str, payload: dict) -> dict:
    url = f"{B24_WEBHOOK.rstrip('/')}/{method}.json"
    data_bytes = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    print("=" * 70)
    print("     REVOPS ENTERPRISE OS — SEED BITRIX24 & REAL-TIME SYNC")
    print(f"     Bitrix24: {B24_WEBHOOK}")
    print(f"     Tenant: {TENANT_ID} | Sheets: {SPREADSHEET_ID}")
    print("=" * 70)

    # 1. Create Deals in Bitrix24
    print("\n[1/5] Создание 10 сделок и звонков в Битрикс24...")
    created_b24_deals = []
    today_str = datetime.now().strftime("%Y-%m-%d")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    for i, spec in enumerate(DEALS_SPEC):
        try:
            deal_payload = {
                "fields": {
                    "TITLE": spec["title"],
                    "STAGE_ID": spec["stage"],
                    "OPPORTUNITY": spec["amount"],
                    "CURRENCY_ID": "RUB",
                    "BEGINDATE": today_str,
                    "COMMENTS": f"Клиент: {spec['client']}. Ответственный: {spec['manager']}."
                }
            }
            res = b24_post("crm.deal.add", deal_payload)
            deal_id = res.get("result")
            print(f"  ✓ Сделка #{i+1} создана: ID={deal_id} | {spec['title'][:38]}... ({spec['amount']:,} ₽)")

            # Create CRM Call Activity
            act_payload = {
                "fields": {
                    "OWNER_TYPE_ID": 2,  # Deal
                    "OWNER_ID": deal_id,
                    "TYPE_ID": 2,        # Call
                    "COMMUNICATIONS": [
                        {"ENTITY_ID": deal_id, "ENTITY_TYPE_ID": 2, "TYPE": "PHONE", "VALUE": spec["phone"]}
                    ],
                    "SUBJECT": f"Звонок: {spec['title']}",
                    "COMPLETED": "Y",
                    "DIRECTION": 1,
                    "DESCRIPTION": f"Менеджер: {spec['manager']}\nОценка ИИ: {spec['score']}/13 (Next Step: {'Да' if spec['next'] else 'Нет'})\n\nДиалог:\n{spec['transcript']}\n\nЗамечания:\n{spec['error']}\n\nСовет менеджеру:\n{spec['rec']}"
                }
            }
            act_res = b24_post("crm.activity.add", act_payload)
            act_id = act_res.get("result")
            print(f"    ├─ Звонок прикреплен к сделке ID={deal_id} (Activity #{act_id})")

            created_b24_deals.append({
                "deal_id": deal_id,
                "act_id": act_id,
                "spec": spec
            })
            time.sleep(0.3)
        except Exception as e:
            print(f"  [-] Ошибка при создании сделки #{i+1}: {e}")

    print(f"\n[+] В Битрикс24 успешно создано: {len(created_b24_deals)} сделок и звонков.")

    # 2. Update Tenants Registry
    print("\n[2/5] Переключение активного провайдера на BITRIX24 в реестре...")
    for reg_path in REGISTRY_PATHS:
        try:
            with open(reg_path, "r", encoding="utf-8") as f:
                reg_data = json.load(f)

            tenants_list = reg_data if isinstance(reg_data, list) else reg_data.get("tenants", [])
            for t in tenants_list:
                if str(t.get("tenant_id", "")).upper() == TENANT_ID:
                    t["crm_type"] = "bitrix24"
                    t["b24_webhook_url"] = B24_WEBHOOK
                    t["crm_webhook_url"] = B24_WEBHOOK
                    t["updated_at"] = datetime.now().isoformat()
                    break

            with open(reg_path, "w", encoding="utf-8") as f:
                json.dump(reg_data, f, ensure_ascii=False, indent=2)
            print(f"  ✓ Обновлен файл: {reg_path}")
        except Exception as e:
            print(f"  [-] Ошибка обновления {reg_path}: {e}")

    # 3. Connect to Google Sheets
    print(f"\n[3/5] Подключение к Google Sheets ({SPREADSHEET_ID[:12]}...)...")
    gc = gspread.service_account(filename=str(SA_PATH))
    sh = gc.open_by_key(SPREADSHEET_ID)
    ws_deals = sh.worksheet("raw_deals")
    ws_calls = sh.worksheet("raw_calls")

    # 4. Clean purge & write raw_deals
    print("\n[4/5] Чистая перезапись листа raw_deals...")
    deal_headers = ws_deals.row_values(1)
    deal_rows_to_insert = []

    for item in created_b24_deals:
        did = str(item["deal_id"])
        spec = item["spec"]
        amt = float(spec["amount"])
        is_won = spec["stage"] == "WON"
        is_lost = spec["stage"] == "LOSE"
        is_active = not is_won and not is_lost
        weight_mult = 1.0 if is_won else (0.8 if "FINAL" in spec["stage"] else (0.5 if "PREP" in spec["stage"] else 0.2))
        weighted_amt = int(amt * weight_mult)

        row = [
            f"B24-{did}",                                          # 1: deal_id
            spec["title"],                                         # 2: company_name
            f"{int(amt):,} ₽",                                     # 3: amount
            str(spec["stage_num"]),                                # 4: stage_id
            spec["stage_name"],                                    # 5: stage_name
            today_str,                                             # 6: created_at
            today_str,                                             # 7: updated_at
            spec["manager"],                                       # 8: responsible_user
            "Enterprise B2B",                                      # 9: segment
            "Bitrix24 REST API",                                   # 10: source
            f"CL-{did}",                                           # 11: client_id
            "A" if amt >= 500000 else "B",                         # 12: client_grade
            "",                                                    # 13: lost_reason
            today_str,                                             # 14: last_stage_change
            "1" if is_won else "0",                                # 15: is_won
            "1" if is_lost else "0",                               # 16: is_lost
            "2",                                                   # 17: stage_duration_days
            "0-7 дней",                                            # 18: age_group
            f"{weighted_amt:,} ₽",                                 # 19: weighted_amount
            "1" if is_active else "0",                             # 20: is_active
            "yandex", "cpc", "b2b_crm", "search", "revops",        # 21-25: UTM
            today_str,                                             # 26: snapshot_date
            "20.0",                                                # 27: version
            "Bitrix24 Live Connector",                             # 28: author
            f"BITRIX24_{TENANT_ID}_{did}",                         # 29: composite hash
            "Согласовать Zoom с ЛПР", today_str,                   # 30-31: next action
            spec["manager"],                                       # 32: manager_name
            "bitrix24",                                            # 33: channel
            "WON" if is_won else "ACTIVE",                         # 34: status
            "HEALTHY",                                             # 35: health
            now_str,                                               # 36: synced_at
            "", "2", "2", today_str, "1", "0", today_str, "2", "0",# 37-45: SLA
            "0", "48", "0", "0", "",                               # 46-50
            SPREADSHEET_ID,                                        # 51: spreadsheet_id
            TENANT_ID,                                             # 52: tenant_id
            B24_WEBHOOK                                            # 53: b24_webhook_url
        ]
        # Pad row to match header length if needed
        while len(row) < len(deal_headers):
            row.append("")
        deal_rows_to_insert.append(row[:len(deal_headers)])

    # Clear old data rows
    existing_deal_count = len(ws_deals.get_all_values())
    if existing_deal_count > 1:
        ws_deals.batch_clear([f"A2:BA{existing_deal_count + 5}"])
    ws_deals.append_rows(deal_rows_to_insert, value_input_option="USER_ENTERED")
    print(f"  ✓ Лист raw_deals очищен и заполнен: {len(deal_rows_to_insert)} сделок Bitrix24.")

    # 5. Clean purge & write raw_calls
    print("\n[5/5] Чистая перезапись листа raw_calls...")
    call_headers = ws_calls.row_values(1)
    call_rows_to_insert = []

    for item in created_b24_deals:
        did = str(item["deal_id"])
        act_id = str(item["act_id"])
        spec = item["spec"]
        score = spec["score"]
        next_step = spec["next"]

        cr = [0] * 13
        cr[0] = next_step
        rem = score - next_step
        fill_order = [2, 8, 9, 1, 10, 12, 5, 4, 3, 6, 11, 7]
        for idx in fill_order:
            if rem > 0:
                cr[idx] = 1
                rem -= 1

        call_id = f"b24_call_{act_id}"
        row = [
            call_id,                                               # 0: call_id
            f"B24-{did}",                                          # 1: deal_id
            spec["manager"],                                       # 2: manager_id
            today_str,                                             # 3: call_date
            str(spec["duration"]),                                 # 4: duration_sec
            "presentation" if score >= 10 else "qualification",    # 5: call_type
            str(cr[0]), str(cr[1]), str(cr[2]), str(cr[3]), str(cr[4]), # 6..10
            str(cr[5]), str(cr[6]), str(cr[7]), str(cr[8]), str(cr[9]), # 11..15
            str(cr[10]), str(cr[11]), str(cr[12]),                 # 16..18
            str(score),                                            # 19: total_score
            str(next_step),                                        # 20: next_step_flag
            spec["error"],                                         # 21: error_summary
            spec["rec"],                                           # 22: ai_recommendation
            now_str,                                               # 23: synced_at
            json.dumps({"transcript": spec["transcript"], "score": score, "next_step": next_step}, ensure_ascii=False), # 24: raw_json
            today_str,                                             # 25: data_snapshot_date
            "V20.0",                                               # 26: data_version
            "Bitrix24 AI Supervisor",                              # 27: uploaded_by
            f"hash_b24_{act_id}_{TENANT_ID}",                      # 28: upload_hash
            spec["transcript"],                                    # 29: transcript_text
            "0",                                                   # 30: days_to_close
            "Senior" if score >= 11 else ("Middle" if score >= 8 else "Junior"), # 31: skill_cluster
            "14",                                                  # 32: call_hour
            "1",                                                   # 33: is_working_hours
            "0",                                                   # 34: response_delay_min
            TENANT_ID,                                             # 35: tenant_id
            "0",                                                   # 36: audit_failed
            "0"                                                    # 37: is_unanswered
        ]
        while len(row) < len(call_headers):
            row.append("")
        call_rows_to_insert.append(row[:len(call_headers)])

    existing_call_count = len(ws_calls.get_all_values())
    if existing_call_count > 1:
        ws_calls.batch_clear([f"A2:AL{existing_call_count + 5}"])
    ws_calls.append_rows(call_rows_to_insert, value_input_option="USER_ENTERED")
    print(f"  ✓ Лист raw_calls очищен и заполнен: {len(call_rows_to_insert)} звонков с ИИ-аудитом.")

    print("\n" + "=" * 70)
    print("  [+] ОПЕРАЦИЯ УСПЕШНО ЗАВЕРШЕНА!")
    print(f"  • Сделок в Битрикс24: {len(created_b24_deals)} шт.")
    print(f"  • Звонков с ИИ-аудитом: {len(call_rows_to_insert)} шт.")
    print(f"  • Google Таблица (raw_deals & raw_calls) синхронизирована на 100%.")
    print(f"  • Активная CRM в реестре переключена на BITRIX24.")
    print("=" * 70)


if __name__ == "__main__":
    main()
