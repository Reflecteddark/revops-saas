# RevOps Enterprise OS — B2B SaaS Platform

[![Python](https://img.shields.io/badge/python-3.12%20%7C%203.14-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.142-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%20RLS-336791.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Enterprise-red.svg)]()

> Полноценный переход платформы **RevOps Enterprise OS V17.6** в мультиарендную (Multi-Tenant) облачную B2B SaaS-архитектуру.

---

## 🏛️ Ключевые возможности платформы

1. **Multi-Tenancy & Data Isolation (Изоляция данных)**
   - Поддержка организаций (`tenants`), рабочих пространств (`workspaces`) и изоляция данных на уровне строк (PostgreSQL Row-Level Security).
2. **7 Промышленных Ролей RBAC**
   - 👑 CEO / Собственник
   - 📋 РОП / Head of Sales
   - 💼 KAM (Менеджер по продажам)
   - 📞 SDR (Телемаркетолог)
   - 🌐 CMO (Директор по маркетингу)
   - 💳 CFO (Финансовый директор)
   - ⚙️ RevOps Admin
3. **Пульт РОПа «15 минут в день» & Радар Рисков**
   - Автоматический перехват зависших сделок (нарушение SLA этапа).
   - Детекция сделок без назначенного следующего шага.
4. **Диагностический аудит 7 Смертных Грехов ОП**
   - Расчёт упущенной выручки (₽) в реальном времени.
   - Оценка возврата потерь (до 65% за 60 дней внедрения).
5. **Речевой ИИ-Аудит Звонков (13 критериев Whisper + LLM)**
   - Оценка квалификации, выявления болей, отработки возражений и фиксации дедлайна.
   - Reverse ETL: генерация структурированного примечания для обратной записи в amoCRM / Bitrix24.
6. **Сценарный симулятор Монте-Карло 95%**
   - 10 000 стохастических итераций на базе векторизованного NumPy.
   - Прогнозирование коридора выручки P10, P50, P90 с 95% доверительным интервалом.
7. **Мультиканальная W-Shaped Атрибуция**
   - Распределение ценности сделки (40% первый контакт, 20% КЭВ, 40% дожим).

---

## 🚀 Быстрый старт (Local Development)

### 1. Запуск API и веб-дашборда
```bash
# Из папки revops-saas:
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload
```
* Веб-дашборд: **http://127.0.0.1:8000/**
* Интерактивная Swagger API документация: **http://127.0.0.1:8000/docs**

### 2. Запуск тестов
```bash
pytest tests/ -v
```

---

## 📦 Развертывание в Docker
```bash
cd deploy
docker-compose up -d
```
Поднимает:
- PostgreSQL 16 с RLS политиками (`port 5432`)
- Redis 7 (`port 6379`)
- ClickHouse OLAP (`port 8123`)
- MinIO S3 для аудиозаписей (`port 9000`, веб-консоль `9001`)
- FastAPI Core Backend (`port 8000`)

---

## 🐙 Подключение к новому GitHub репозиторию

Для отправки кода в ваш новый GitHub репозиторий:
```bash
cd C:\Users\strel\.gemini\antigravity\scratch\revops-saas
git add .
git commit -m "feat: initial commit of RevOps B2B SaaS platform"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-NEW-REPO>.git
git push -u origin main
```

---

## 🏛️ Единая Monorepo-Архитектура (SSOT)

Весь проект (бэкенд, промо-лендинг и личный кабинет) управляется из **одного** репозитория:

```
revops-saas/
├── apps/
│   ├── api/             # FastAPI Core Backend (CRM коннекторы, база, вебхуки, сокеты)
│   ├── landing/         # Продающий промо-лендинг ai-rop.ru (index.html, offer, css, images, ...)
│   └── web/             # Личный кабинет / Дашборд ai-rop.ru/app/ (app.js, js/*.js)
├── vercel.json          # Маршрутизация Vercel для ai-rop.ru
└── scripts/
    └── sync_to_landing_mirror.py # Утилита синхронизации с переходным зеркалом
```

### Маршрутизация на проде (ai-rop.ru):
- `https://ai-rop.ru/` → Промо-лендинг (`apps/landing/index.html`)
- `https://ai-rop.ru/app/` → Личный кабинет (`apps/web/index.html`)
- `https://report.ai-rop.ru/` → Cloudflare Tunnel к FastAPI (`apps/api/`)
