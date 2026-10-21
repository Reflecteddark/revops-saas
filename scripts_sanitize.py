import sys
from pathlib import Path

replacements = [
    ('Gemini Score 9.1', 'AI Score 9.1'),
    ('Gemini Score 0.0', 'AI Score 0.0'),
    ('Gemini Score', 'AI Score'),
    ('13-ФАКТОРНЫЙ РЕЧЕВОЙ РАДАР СТАНДАРТОВ B2B (GEMINI AI)', '13-ФАКТОРНЫЙ РЕЧЕВОЙ РАДАР СТАНДАРТОВ B2B (ИИ-АУДИТ)'),
    ('Google Gemini 3.5 Flash (Cloudflare Proxy Worker)', 'RevOps Speech AI Core (Изолированный шлюз 152-ФЗ)'),
    ('Google Gemini 3.5 Flash', 'RevOps Speech AI Core'),
    ('Gemini 2.5 Flash &amp; SSOT', 'RevOps Neural &amp; SSOT'),
    ('13 критериям B2B-аудита Gemini AI', '13 критериям B2B-аудита Речевой ИИ-Супервайзер'),
    ('Gemini 2.5 Flash B2B Auditor', 'RevOps Neural Core B2B Auditor'),
    ('валидация JSON-схемы Gemini Flash (13 критериев)', 'валидация JSON-схемы Речевой ИИ-аудит (13 критериев)'),
    ('Речевой ИИ-Супервайзер 100% звонков (Gemini 3.5 Flash)', 'Речевой ИИ-Супервайзер 100% звонков (RevOps Speech AI Core)'),
    ('Gemini 3.5 Flash, 13 B2B критериев', 'RevOps Speech AI Core, 13 B2B критериев'),
    ('Gemini 3.5 Speech AI', 'RevOps Speech AI Core'),
    ('💰 Расход Gemini API', '💰 Расход ИИ-шлюза'),
    ('4. Google Gemini ИИ Аудит & 13 Критериев', '4. Нейросетевой ИИ-Аудит & 13 Критериев'),
    ('id="adminGeminiLatency"', 'id="adminAiLatency"'),
    ('Проверка сквозного канала Gemini', 'Проверка сквозного ИИ-канала'),
    ('id="btnTestGemini"', 'id="btnTestAi"'),
    ('onclick="testGeminiApi()"', 'onclick="testAiApi()"'),
    ('🧪 Тест Gemini API', '🧪 Тест ИИ-шлюза'),
    ('шлюзы Gemini и Telegram', 'шлюзы ИИ-аудита и Telegram'),
    ('ПОЛНЫЙ ТРАНСКРИПТ ДИАЛОГА (GEMINI 3.5 FLASH):', 'ПОЛНЫЙ ТРАНСКРИПТ ДИАЛОГА (REVOPS NEURAL AI):'),
    ('Качество речи и речевая дисциплина (Gemini 3.5 Flash)', 'Качество речи и речевая дисциплина (RevOps Speech AI Core)'),
    ('Стенограмма диалога (Gemini 3.5 Flash):', 'Стенограмма диалога (RevOps Speech AI Core):'),
    ('Gemini 3.5 Flash &bull; Strict JSON', 'RevOps Speech AI Core &bull; Strict JSON'),
    ('Средний балл речи Gemini (/13)', 'Средний балл речи ИИ (/13)'),
    ('Gemini 3.5 · 0.7s', 'RevOps AI · 0.7s'),
    ('Agent 2 CCO (Gemini 2.5 Flash)', 'Agent 2 CCO (RevOps Neural Core)'),
    ('Пинг Google Gemini 3.5 Flash через Cloudflare Proxy Worker...', 'Пинг RevOps Neural Speech Core через Cloudflare Proxy Worker...'),
    ('Тест Gemini API завершён', 'Тест ИИ-шлюза завершён'),
    ("showToast('Gemini API'", "showToast('ИИ-шлюз'"),
    ('Сбой связи с Gemini:', 'Сбой связи с ИИ-шлюзом:'),
    ("showToast('Ошибка Gemini'", "showToast('Ошибка ИИ-шлюза'"),
    ("const btn = document.getElementById('btnTestGemini');", "const btn = document.getElementById('btnTestAi') || document.getElementById('btnTestGemini');"),
    ("const latEl = document.getElementById('adminGeminiLatency');", "const latEl = document.getElementById('adminAiLatency') || document.getElementById('adminGeminiLatency');"),
    ("async function testGeminiApi()", "async function testAiApi()"),
    ("window.testGeminiApi = testGeminiApi;", "window.testAiApi = testAiApi;\nwindow.testGeminiApi = testAiApi;"),
    ("window.testGeminiApi = typeof testGeminiApi !== 'undefined' ? testGeminiApi : null;", "window.testAiApi = typeof testAiApi !== 'undefined' ? testAiApi : null;\nwindow.testGeminiApi = typeof testGeminiApi !== 'undefined' ? testGeminiApi : (typeof testAiApi !== 'undefined' ? testAiApi : null);"),
]

root = Path(r"C:\Users\strel\.gemini\antigravity\scratch\revops-saas")
target_files = [
    root / "apps/web/index.html",
    root / "apps/web/app.js",
    root / "apps/web/js/admin.js",
    root / "apps/web/js/calls.js",
    root / "apps/web/js/charts.js",
    root / "apps/web/js/core.js",
    root / "apps/web/js/deals.js",
    root / "apps/api/routers/diagnostics_router.py"
]

for p in target_files:
    if not p.exists():
        print(f"File missing: {p}")
        continue
    content = p.read_text(encoding="utf-8")
    orig = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != orig:
        p.write_text(content, encoding="utf-8")
        print(f"Updated: {p.relative_to(root)}")
    else:
        print(f"No changes needed: {p.relative_to(root)}")
