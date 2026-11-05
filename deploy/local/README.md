# RevOps Enterprise OS — Local Hosting Stack (Windows + RTX 5060 Ti)

Данный каталог содержит конфигурацию для запуска полного контура RevOps Enterprise OS на локальном ПК разработчика с аппаратным ускорением AI-аудита (NVIDIA GeForce RTX 5060 Ti 16 GB).

## Архитектура локального контура

```
[Интернет / CRM Клиентов]
         │ (HTTPS)
         ▼
[Cloudflare Anycast Network]
         │ (Argo Tunnel / QUIC)
         ▼
[cloudflared.exe (на ПК)]
   ├── report.ai-rop.ru   ──► http://127.0.0.1:8000 (Docker: revops-api, FastAPI)
   ├── webhook.ai-rop.ru  ──► http://127.0.0.1:5678 (Docker: revops-n8n, n8n Workflow)
   └── antigravity.ai-rop.ru ──► http://127.0.0.1:8047

[Внутренний контур Docker (WSL2)]
   ├── revops-postgres (PostgreSQL 16 Alpine: revops_db, n8n_db)
   ├── revops-redis    (Redis 7 Alpine: кэш и очереди)
   ├── revops-api      (FastAPI, SQLite revops_saas.db, Timescale/PG)
   └── revops-n8n      (n8n 2.43.8, рабочий воркфлоу аудио-аудита Sh4JkQtMKVdeRJn5)
         │
         │ (http://host.docker.internal:8765/audit)
         ▼
[Локальный AI-Сервис Аудита (Windows Host)]
   ├── faster-whisper large-v3-turbo (CUDA float16, PyAV стерео-сплиттинг)
   └── Ollama 0.5.12 + qwen3.5:9b (8K контекст, 13 B2B-критериев cr1..cr13)
```

## Управление стеком

1. **Запуск**: двойной клик по ярлыку на рабочем столе `Запустить_RevOps_Локально.lnk` или запуск `C:\revops\start_revops_local.bat`.
2. **Остановка**: `C:\revops\stop_revops_local.bat`.
3. **Мониторинг**:
   - `http://127.0.0.1:8765/health` — состояние Whisper и Ollama
   - `http://127.0.0.1:8000/api/v1/health` — состояние FastAPI
   - `http://127.0.0.1:5678/healthz` — состояние n8n

## Rollback на VPS (при необходимости)

VPS (`176.124.207.57`) находится в режиме холодного ожидания (standby):
1. На ПК: запустить `C:\revops\stop_revops_local.bat`
2. На VPS:
   ```bash
   ssh root@176.124.207.57
   systemctl enable --now revops-health-guard.timer cloudflared revops-tgbot
   cd /opt/revops-saas && docker compose up -d
   ```
   Трафик и бот мгновенно возвращаются на VPS без изменения DNS.
