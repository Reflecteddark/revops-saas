"""The test suite never spends the real Gemini quota, and no Gemini key lives in the code."""

import asyncio
import re
import subprocess
import time
from pathlib import Path

import packages.monitoring.ai_probe as ai_probe
from packages.monitoring.ai_probe import generate_gemini_content_cascade, probe_gemini_models_sync

REPO = Path(__file__).resolve().parent.parent


def test_the_suite_points_the_proxy_at_a_closed_local_port():
    assert ai_probe.GEMINI_PROXY_URL.startswith("http://127.0.0.1:")
    assert "workers.dev" not in ai_probe.GEMINI_PROXY_URL


def test_an_unmocked_cascade_fails_offline_and_fast():
    t0 = time.time()
    res = asyncio.run(generate_gemini_content_cascade(system_prompt="x", user_message="y", timeout=5.0))
    assert res["status"] == "error" and res["model"] == "deterministic_ssot"
    assert time.time() - t0 < 5


def test_an_unmocked_probe_fails_offline_and_fast():
    t0 = time.time()
    res = probe_gemini_models_sync(timeout=3.0)
    assert res["healthy"] is False
    assert time.time() - t0 < 10


def test_without_a_key_no_request_is_made(monkeypatch):
    calls = []
    monkeypatch.setattr(ai_probe, "GEMINI_PROXY_KEY", "")
    monkeypatch.setattr("httpx.AsyncClient.post", lambda *a, **k: calls.append(1))
    monkeypatch.setattr("urllib.request.urlopen", lambda *a, **k: calls.append(1))
    res = asyncio.run(generate_gemini_content_cascade(system_prompt="x", user_message="y", timeout=2.0))
    assert res["status"] == "error" and "GEMINI_PROXY_KEY" in res["error"]
    assert probe_gemini_models_sync(timeout=2.0)["healthy"] is False
    assert calls == []


def test_no_google_key_is_written_in_the_code():
    """A literal key, and the base64 of one ("AQ." is "QVEu" in base64): the repository and the image are public."""
    tracked = subprocess.run(["git", "ls-files", "apps", "packages", "scripts", "workers", "deploy"], cwd=REPO, capture_output=True, text=True, encoding="utf-8").stdout.splitlines()
    bad = re.compile(r"AQ\.[A-Za-z0-9_-]{30,}|QVEu[A-Za-z0-9+/=]{30,}|AIza[0-9A-Za-z_-]{30,}")
    found = []
    for name in tracked:
        if not name.endswith((".py", ".js", ".ts", ".tsx", ".json", ".yml", ".yaml", ".sh", ".md")):
            continue
        try:
            text = (REPO / name).read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if bad.search(text):
            found.append(name)
    assert found == []
