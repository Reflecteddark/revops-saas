# RevOps React — Cutover Checklist (прод)

## T-24 часа (за день до)
- [ ] Staging (`staging.ai-rop.ru/app`) работает 24 часа без падений
- [ ] Все 4 страницы открываются, данные с прода
- [ ] Логин/логаут работают, cookies уходят/приходят
- [ ] WebSocket: `ws.readyState === 1`, в Network видны WS frames
- [ ] Light/dark тема сохраняется между сессиями
- [ ] TenantSelector переключает тенант, данные меняются
- [ ] Sentry / error tracker на React подключён
- [ ] План отката согласован с командой

## T-1 час (за час до)
- [ ] Legacy `ai-rop.ru/app` открывается (baseline)
- [ ] `apps/web/dist/` собран с `VITE_BASE_PATH=/app/`, `VITE_API_URL=/api/v1`, `VITE_WS_URL=wss://ai-rop.ru`
- [ ] Артефакт загружен на прод-сервер (`/var/www/revops-react/`)
- [ ] Nginx конфиг подготовлен, но **НЕ применён**
- [ ] Все на связи: ты, бэкендер, devops

## T-0 (переключение)
- [ ] `cp /etc/nginx/sites-available/ai-rop.conf /etc/nginx/sites-available/ai-rop.conf.bak-$(date +%Y%m%d-%H%M)`
- [ ] Применить `deploy/nginx/revops-react.conf` (заменить `location /app/`)
- [ ] `nginx -t` → OK
- [ ] `nginx -s reload`
- [ ] Открыть `ai-rop.ru/app` в инкогнито → логин → /pulse
- [ ] Проверить: Network 200 на `/app/assets/*`, `/api/v1/*`
- [ ] Проверить: WS connected
- [ ] Если 200/WS OK → **Cutover успешен**

## Откат (30 секунд)
- [ ] `cp /etc/nginx/sites-available/ai-rop.conf.bak-YYYYMMDD-HHMM /etc/nginx/sites-available/ai-rop.conf`
- [ ] `nginx -t && nginx -s reload`
- [ ] Открыть `ai-rop.ru/app` → legacy работает
- [ ] **Не удалять** `/var/www/revops-react/` и legacy-файлы минимум 30 дней

## T+1 час
- [ ] Sentry: нет новых JS-ошибок (кроме API-404)
- [ ] Метрики: 401 < 5% запросов
- [ ] WS connected > 90% пользователей

## T+24 часа
- [ ] Sentry: тренд ошибок стабилен
- [ ] Жалобы пользователей — нет / обработаны
- [ ] Legacy остаётся доступен как fallback

## T+30 дней
- [ ] Legacy можно удалять (`apps/web/index.html`, `apps/web/js/`)
- [ ] `main` мерж `feat/react-migration`
