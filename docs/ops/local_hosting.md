# RevOps Enterprise OS — Регламент локального хостинга на ПК

## 1. Архитектурная схема локального стека

Вся обработка звонков (транскрипция, диаризация, аудит критериев cr1..cr13) выполняется локально на ПК разработчика без обращения к внешним облачным сервисам распознавания (Gemini API).

```
                      [ amoCRM / Bitrix24 / Telephony ]
                                      │
                                      ▼
             [ Cloudflare Tunnel: report.ai-rop.ru / webhook.ai-rop.ru ]
                                      │
       ┌──────────────────────────────┴──────────────────────────────┐
       │                       Windows 11 Host                       │
       │                                                             │
       │  ┌───────────────────────────────────────────────────────┐  │
       │  │               WSL2 Docker Desktop (8 GB)              │  │
       │  │                                                       │  │
       │  │  [revops-postgres] ── (5432) ── PostgreSQL 16 Alpine   │  │
       │  │  [revops-redis]    ── (6379) ── Redis 7 Alpine         │  │
       │  │  [revops-api]      ── (8000) ── FastAPI (Python 3.12)  │  │
       │  │  [revops-n8n]      ── (5678) ── n8n (workflows)        │  │
       │  └───────────────────────────┬───────────────────────────┘  │
       │                              │ host.docker.internal:8765    │
       │                              ▼                              │
       │  ┌───────────────────────────────────────────────────────┐  │
       │  │          Local Audit Service (Port 8765)              │  │
       │  │  - faster-whisper large-v3-turbo (CUDA float16)       │  │
       │  │  - Stereo channel split: L (Client), R (Manager)      │  │
       │  │  - CR11 word share calculation (Client >= 30%)        │  │
       │  │  - Prompt injection into Gemini candidate envelope    │  │
       │  └───────────────────────────┬───────────────────────────┘  │
       │                              │ 127.0.0.1:11434              │
       │                              ▼                              │
       │  ┌───────────────────────────────────────────────────────┐  │
       │  │             Ollama Engine (RTX 5060 Ti 16GB)          │  │
       │  │  - qwen3.5:9b (Q4_K_M, thinking=False, ctx 4096)      │  │
       │  └───────────────────────────────────────────────────────┘  │
       └─────────────────────────────────────────────────────────────┘
```

---

## 2. Порядок запуска после перезагрузки ПК

Службы и процессы должны подниматься в строгой последовательности:

1. **Docker Desktop**:
   - Запускается автоматически через автозагрузку Windows.
   - WSL2 лимиты зафиксированы в `%UserProfile%\.wslconfig` (память: 8 GB, процессоры: 6).
   - Проверка: `docker ps` (должны быть `revops-postgres`, `revops-redis`, `revops-api`, `revops-n8n`).

2. **Ollama Daemon**:
   - Каталог моделей: `C:\Ollama` (переменная среды пользователя `OLLAMA_MODELS=C:\Ollama`).
   - Запуск демона:
     ```powershell
     $env:OLLAMA_MODELS = "C:\Ollama"
     ollama serve
     ```
   - Проверка: `curl.exe http://127.0.0.1:11434/api/tags` (в списке должны присутствовать `qwen3.5:9b` и `revops-262k:latest`).

3. **Локальный сервис аудита (`local-audit`)**:
   - Лаунчер: `C:\Users\strel\local_audit\run_service.bat`
   - Биндинг: `0.0.0.0:8765` (доступен хосту и Docker-контейнерам через `host.docker.internal:8765`).
   - Проверка: `curl.exe http://127.0.0.1:8765/health`
     Ответ: `{"status":"healthy","whisper":"loaded (large-v3-turbo, CUDA float16)","ollama_alive":true,...}`

4. **Проверка n8n**:
   - Веб-интерфейс: `http://localhost:5678`
   - Проверка узла 17: направлен на `http://host.docker.internal:8765/audit`.
   - Проверка узла 18b: направлен на `http://revops-api:8000/api/v1/calls/ingest`.

5. **Cloudflare Tunnel (в Фазе 3)**:
   - Служба `cloudflared` туннелирует трафик с публичных доменов `report.ai-rop.ru` и `webhook.ai-rop.ru` на локальные порты 8000 и 5678.

---

## 3. Регламент резервного копирования

- **Оперативная БД**: `C:\revops\data\revops_saas.db` (SQLite с WAL-журналированием).
- **PostgreSQL (n8n_db, revops_db)**: дампы формируются через `docker exec revops-postgres pg_dump -U revops_user -Fc <db>`.
- **Холодные бэкапы**: сохраняются на несистемный диск `D:\revops\backups\` каждые 6 часов.

---

## 4. План отката (Rollback Procedure)

Если локальный ПК теряет питание, сеть или выходит из строя во время эксплуатации:
1. Зайти в панель Cloudflare Zero Trust → Access → Tunnels.
2. Переключить публичные хостнеймы `report.ai-rop.ru` и `webhook.ai-rop.ru` обратно на VPS-туннель (`Aeza VPS 176.124.207.57`).
3. На VPS: активировать воркфлоу n8n (`UPDATE workflow_entity SET active=true;`).
4. На VPS: поднять `revops-api` и `revops-worker`.
5. Время отката: **< 3 минут**.

---

## 5. Мониторинг и устранение неполадок (Troubleshooting)

- **Ошибка "Connection refused" из n8n в local-audit**:
  - Убедиться, что `run_service.bat` слушает на `0.0.0.0:8765`, а не `127.0.0.1:8765`.
  - Проверить доступность: `docker exec revops-n8n wget -qO- http://host.docker.internal:8765/health`.
- **Таймаут Ollama при оценке звонка**:
  - Убедиться, что в запросе передан флаг `"think": false`. С ним модель `qwen3.5:9b` отвечает за ~4–8 секунд вместо 70–90 секунд.
- **Недостаток видеопамяти VRAM**:
  - Whisper `large-v3-turbo` занимает ~3.1 ГБ VRAM, `qwen3.5:9b` занимает ~6.5 ГБ VRAM.
  - Суммарное потребление стека: ~9.6 ГБ из 16 ГБ VRAM RTX 5060 Ti (запас ~6.4 ГБ).
