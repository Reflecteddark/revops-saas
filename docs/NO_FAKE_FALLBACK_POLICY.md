# Политика: НИКАКИХ фейковых fallback

## Правило
Любая цифра на дашборде, отчёте, PDF или алерте ДОЛЖНА происходить из 
реального источника. Если источник недоступен → показать 0 + видимую ошибку.
НИКОГДА не подставлять расчётное или среднее значение как fallback.

## Антипаттерны (ЗАПРЕЩЕНЫ)
- `deals.length * 500000` (fake pipeline)
- `getCallAmount() → 300000` (fake amount)
- `cr = [1] * 13` (fake "all criteria passed")
- `avg_score = 9.5` (fake "good score")
- `totalRisk += 500000` (fake risk)

## Правильный паттерн
```javascript
const pipeline = deals.length > 0 ? deals.reduce(...) : 0;
if (deals.length === 0 && apiError) {
  showDataUnavailableBanner('Пайплайн недоступен');
}
```

## Исключения
Если fallback действительно нужен (UI placeholder) — добавь комментарий:

```javascript
const check = val || 300000; // fallback-allowed: UI slider default
```
CI и pre-commit проверяют `fallback-allowed` и пропускают такие строки.

## История
2026-10-25: Правило введено после бага, где дашборд показывал
7M пайплайна вместо 4.46M из-за `callsList.length * 500000` при HTTP 500.
Причина 500: циклический импорт в `admin_router.py`.
Фикс: удалён импорт + 16 fake fallbacks + 4 уровня защиты.
