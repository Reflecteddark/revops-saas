"""
Baseline security headers on report.ai-rop.ru (FastAPI).
HTML pages must not be frameable by other sites (clickjacking on the cabinet); non-HTML
responses (JSON, call recordings played by amoCRM) must stay embeddable.
"""

from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app)


def test_json_responses_get_hsts_nosniff_referrer():
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.headers["strict-transport-security"].startswith("max-age=")
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "x-frame-options" not in res.headers


def test_html_pages_cannot_be_framed_by_other_sites():
    res = client.get("/")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/html")
    assert res.headers["x-frame-options"] == "SAMEORIGIN"
    assert "frame-ancestors 'self'" in res.headers["content-security-policy"]


def test_error_responses_also_carry_headers():
    res = client.get("/api/v1/definitely-not-a-route")
    assert res.status_code == 404
    assert res.headers["x-content-type-options"] == "nosniff"
