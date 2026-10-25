# Staging deploy (ручной)

## 1. Собрать образ
```bash
cd deploy
docker compose -f docker-compose.staging.yml build
```

## 2. Запустить
```bash
docker compose -f docker-compose.staging.yml up -d
curl -i http://localhost:8081/app/
# ожидается: HTTP/1.1 200, Content-Type: text/html
```

## 3. Внешний Nginx (на staging-хосте)
Добавить в `/etc/nginx/sites-available/staging-ai-rop.conf`:

```nginx
location /app/ {
    proxy_pass http://127.0.0.1:8081/app/;
    proxy_set_header Host $host;
}
location /app/assets/ {
    proxy_pass http://127.0.0.1:8081/app/assets/;
    proxy_set_header Host $host;
}
```

```bash
nginx -t && nginx -s reload
```

## 4. Проверить в браузере
- `https://staging.ai-rop.ru/app/` → логин → `/pulse` → `/audit` → `/settings` → `/fleet`
- Console: API-ошибки ожидаемы (staging API может быть не подключён), JS-ошибки — нет
- Network: все `/app/assets/*` = 200

## 5. Откат staging
```bash
docker compose -f docker-compose.staging.yml down
# и убрать location /app/ из /etc/nginx/
```

## 6. Прод-Cutover — НЕ через этот файл
См. `deploy/CUTOVER-CHECKLIST.md`
