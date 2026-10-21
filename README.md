# RevOps Enterprise OS — B2B SaaS Platform (V21.1)

[![Python](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-GHCR%20Container-2496ED.svg)](https://github.com/Reflecteddark/revops-saas/pkgs/container/revops-saas)
[![Cloudflare Tunnel](https://img.shields.io/badge/Cloudflare-QUIC%20Tunnel-F38020.svg)](https://cloudflare.com)
[![License](https://img.shields.io/badge/License-Enterprise-red.svg)]()

> Мультиарендная (Multi-Tenant) облачная B2B SaaS-экосистема речевого аудита звонков, чат-аналитики и RevOps-управления выручкой отдела продаж.

---

## 🏛️ Ключевые возможности платформы V21.1

1. **Multi-Tenancy & Data Isolation (Строгая изоляция тенантов)**
   - Централизованный реестр клиентов `tenants_registry.json`.
   - Защита от IDOR в API тенантов, блокировка доступа к замороженным клиентам (HTTP 403 Forbidden).
   - Фронтенд-привязка контекста пользователя строго к `sess.tenant` (`getActiveTenantId()`).
2. **Zero-Leakage Server-Side Auth**
   - 100% ликвидация мастер-ключей и паролей на стороне браузера.
   - Серверная аутентификация через PBKDF2/bcrypt (`POST /api/v1/auth/login` и `POST /api/v1/auth/bootstrap`).
3. **Речевой ИИ-Аудит Звонков (13 B2B-критериев Gemini 3.5 Flash)**
   - Потоковый инлайн-анализ аудиозаписей телефонии `$binary.data` (Inline Audio) со строгим JSON-скорингом.
   - Детекция автоответчиков, классификация сливов и автоматический расчет штрафных баллов.
4. **Dynamic CRM Switch Engine & Three-Way Reconciliation**
   - Мгновенное переключение amoCRM ↔ Bitrix24 через API (`POST /api/v1/admin/crm/action`).
   - Автоматическая очистка `raw_deals` Google Sheets от сделок предыдущей CRM со 2 строки.
   - Инвалидация оперативного кэша `_DEALS_CACHE` и WebSocket-трансляция события `deals_updated`.
   - Фоновая сверка Three-Way Watchdog (`CRM REST API ↔ Google Sheets ↔ FastAPI`, $\Delta = 0$ ₽).
5. **Пульт РОПа «15 минут в день» & Радар Рисков**
   - Перехват зависших сделок (нарушение SLA этапа).
   - Детекция сделок без назначенного следующего шага и брошенных сделок ($\ge 14$ дней).
6. **Диагностический аудит 8 Смертных Грехов ОП**
   - Расчёт упущенной выручки (₽) в реальном времени, включая ночные сливы.
   - 11 Bento-витрин операционного контроля.
7. **Автономный Self-Healing Guard**
   - Мониторинг Docker-контейнеров, systemd-юнитов, диска и RAM с авторестартом и Telegram-алертами.

---

## 🏛️ Единая Monorepo-Архитектура (SSOT)

Весь проект управляется из единого Monorepo:

```
revops-saas/
├── apps/
│   ├── api/             # FastAPI Core Backend (Dockerized, Uvicorn, CRM-адаптеры, Auth, WebSockets)
│   ├── landing/         # B2B промо-лендинг ai-rop.ru (No Credit Cards, 422-ФЗ / 152-ФЗ)
│   └── web/             # Личный кабинет ai-rop.ru/app/ (Bento Shell, core.js, calls.js, deals.js)
├── packages/
│   └── database/        # Схемы данных и модели
├── deploy/              # Конфигурации Docker и развертывания
├── tests/               # Набор юнит- и интеграционных тестов (pytest)
├── vercel.json          # Маршрутизация Edge CDN для ai-rop.ru
└── .github/workflows/   # CI/CD: автотесты, сборка Docker в GHCR и деплой на VPS
```

### Маршрутизация на проде:
- `https://ai-rop.ru/` → Промо-лендинг (`apps/landing/index.html` на Vercel Edge CDN)
- `https://ai-rop.ru/app/` → Личный кабинет (`apps/web/index.html` на Vercel Edge CDN)
- `https://report.ai-rop.ru/` → Cloudflare Tunnel к контейнеру FastAPI (`apps/api/`) на VPS

---

## 🚀 Разработка и Запуск (Development)

### 1. Локальный запуск API
```bash
python -m uvicorn apps.api.main:app --host 127.0.0.1 --port 8000 --reload
```
* Веб-дашборд: **http://127.0.0.1:8000/**
* Интерактивная Swagger API документация: **http://127.0.0.1:8000/docs**

### 2. Запуск тестов
```bash
pytest tests/ -v
```

---

## 🐳 Контейнеризация и Продакшн-Деплой (Production)

Серверная часть платформы полностью контейнеризирована и публикуется в **GitHub Container Registry (GHCR)**:
* Образ: `ghcr.io/reflecteddark/revops-saas:latest`

### Пайплайн автодеплоя (CI/CD):
1. **GitHub Actions (`deploy.yml` / `ci-cd.yml`)**:
   - Запуск проверок линтера и тестов `pytest`.
   - Сборка multi-stage Docker-образа и публикация в GHCR.
2. **Деплой на выделенный Linux VPS (`176.124.207.57`)**:
   - Авторизация в GHCR на сервере.
   - Бесшовное обновление контейнера:
     ```bash
     docker pull ghcr.io/reflecteddark/revops-saas:latest
     docker stop revops-api || true
     docker rm revops-api || true
     docker run -d --name revops-api \
       --restart unless-stopped \
       --env-file /opt/revops-saas/.env \
       -v /opt/revops-enterprise-os/tenants_registry.json:/app/tenants_registry.json:ro \
       -v /opt/revops-enterprise-os/service_account.json:/app/service_account.json:ro \
       -p 127.0.0.1:8000:8000 \
       ghcr.io/reflecteddark/revops-saas:latest
     ```
3. **Белый сетевой периметр**:
   - Входящий трафик проксируется через **Cloudflare Tunnel (QUIC)** напрямую в порт `127.0.0.1:8000`.
   - Внешний трафик защищён WAF, Rate Limiting и сертификатами TLS 1.3.
