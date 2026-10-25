"""
Статические проверки: кодовая база не должна содержать fake fallbacks.
Эти тесты ловят регрессию ДО того, как код попадёт в прод.

Правило: любая финансовая цифра должна происходить из реальных данных.
Fallback → 0 + видимая ошибка, НЕ выдуманное число.
"""
import re
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).parent.parent
WEB_JS = REPO_ROOT / "apps" / "web" / "js"


def _read_all_js():
    for js_file in WEB_JS.rglob("*.js"):
        if ".test." in js_file.name:
            continue
        yield js_file, js_file.read_text(encoding="utf-8")


def test_no_length_times_constant():
    """Никаких `length * 500000` (и подобных) в JS."""
    pattern = re.compile(r"\.length\s*\*\s*[1-9]\d{4,}")
    for js_file, content in _read_all_js():
        for line_num, line in enumerate(content.splitlines(), 1):
            if pattern.search(line) and "// fallback-allowed" not in line:
                pytest.fail(f"❌ Fake pipeline in {js_file}:{line_num}\n{line.strip()}")


def test_no_getCallAmount_300k():
    """getCallAmount не должен возвращать 300000/150000."""
    calls_js = (WEB_JS / "calls.js").read_text(encoding="utf-8")
    fn = re.search(r"function getCallAmount\s*\([^)]*\)\s*\{[\s\S]*?\n\}", calls_js)
    assert fn, "getCallAmount не найдена"
    body = fn.group(0)
    assert "300000" not in body, "❌ getCallAmount возвращает 300000"
    assert "150000" not in body, "❌ getCallAmount возвращает 150000"


def test_no_default_score_9x():
    """Никаких avg_score: 9.5 / default_score = 9.1 (фейковые 'хорошие' скоры)."""
    pattern = re.compile(r"(avg_score|default_score|avgScore)\s*[:=]\s*[89]\.\d")
    for js_file, content in _read_all_js():
        for line_num, line in enumerate(content.splitlines(), 1):
            if pattern.search(line) and "// fallback-allowed" not in line:
                pytest.fail(f"❌ Hardcoded score in {js_file}:{line_num}\n{line.strip()}")


def test_no_cr_fallback_all_passed():
    """Python: cr = [1] * 13 запрещён (фейковый 'все пройдены')."""
    for py_file in (REPO_ROOT / "apps" / "api").rglob("*.py"):
        content = py_file.read_text(encoding="utf-8")
        for line_num, line in enumerate(content.splitlines(), 1):
            if "[1] * 13" in line and "fallback-allowed" not in line:
                # Разрешаем только если это не fallback, а явное значение в test
                if "test" not in str(py_file):
                    pytest.fail(f"❌ cr = [1]*13 (fake all-passed) in {py_file}:{line_num}\n{line.strip()}")


def test_getCallAmount_zero_on_invalid():
    """getCallAmount(undefined) должен вернуть 0, не 300000."""
    calls_js = (WEB_JS / "calls.js").read_text(encoding="utf-8")
    assert "if (!c) return 0" in calls_js, "❌ getCallAmount(undefined) должен возвращать 0"
    assert "return 300000" not in calls_js, "❌ getCallAmount всё ещё возвращает 300000"
