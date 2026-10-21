"""
Integration tests for FastAPI endpoints, Multi-Tenancy, and RBAC roles.
"""

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from packages.database.session import init_db


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


def test_health_check(client):
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["rbac_roles"] == 7


def test_tenant_registration_and_auth(client):
    reg_payload = {
        "company_name": "Acme SaaS Corp",
        "admin_name": "Илья Семенов",
        "admin_email": "ilya@acmesaas.io",
        "password": "Password123!"
    }
    res = client.post("/api/v1/auth/register-tenant", json=reg_payload)
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["role"] == "👑 CEO"

    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Test /me
    me_res = client.get("/api/v1/auth/me", headers=headers)
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "ilya@acmesaas.io"
    assert me_data["role"] == "👑 CEO"


def test_diagnostics_endpoint_authenticated(client):
    # Register a new tenant to test
    reg_payload = {
        "company_name": "Beta Corp",
        "admin_name": "Анна Смирнова",
        "admin_email": "anna@betacorp.ru",
        "password": "Password123!"
    }
    res = client.post("/api/v1/auth/register-tenant", json=reg_payload)
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Seven Sins
    sins_payload = {
        "monthly_leads": 200,
        "avg_ticket_rub": 150000.0,
        "current_conversion_pct": 8.0
    }
    sins_res = client.post("/api/v1/diagnostics/seven-sins", json=sins_payload, headers=headers)
    assert sins_res.status_code == 200
    sins_data = sins_res.json()
    assert sins_data["total_lost_revenue_rub"] > 0

    # Express calc
    exp_payload = {
        "monthly_leads": 120,
        "avg_ticket_rub": 250000.0,
        "current_close_rate_pct": 5.0
    }
    exp_res = client.post("/api/v1/diagnostics/express-calculator", json=exp_payload, headers=headers)
    assert exp_res.status_code == 200
    exp_data = exp_res.json()
    assert exp_data["monthly_upside"] > 0


def test_monte_carlo_endpoint(client):
    reg_payload = {
        "company_name": "Gamma Corp",
        "admin_name": "Павел Дуров",
        "admin_email": "pavel@gammacorp.com",
        "password": "Password123!"
    }
    res = client.post("/api/v1/auth/register-tenant", json=reg_payload)
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    mc_payload = {
        "leads_mean": 300.0,
        "conv_qual_pct": 50.0,
        "conv_close_pct": 20.0,
        "iterations": 1000
    }
    mc_res = client.post("/api/v1/simulator/run-monte-carlo", json=mc_payload, headers=headers)
    assert mc_res.status_code == 200
    mc_data = mc_res.json()
    assert mc_data["iterations_run"] == 1000
    assert mc_data["median_revenue_p50"] > 0


def test_speech_scoring_endpoint(client):
    reg_payload = {
        "company_name": "Delta Corp",
        "admin_name": "Мария Воронова",
        "admin_email": "maria@deltacorp.ru",
        "password": "Password123!"
    }
    res = client.post("/api/v1/auth/register-tenant", json=reg_payload)
    token = res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    speech_payload = {
        "client_phone": "+7 999 123-45-67",
        "duration_seconds": 240,
        "scores": {
            "greeting_and_intro": 9.0,
            "client_qualification": 8.0,
            "pain_discovery": 7.5,
            "value_presentation": 8.0,
            "price_presentation": 7.0,
            "objection_handling": 6.0,
            "next_step_fixation": 8.5,
            "script_compliance": 8.0,
            "talk_listen_ratio": 7.0,
            "empathy_and_tone": 9.0,
            "competitor_defense": 7.0,
            "urgency_creation": 6.0,
            "no_toxicity_stress": 10.0
        }
    }
    speech_res = client.post("/api/v1/calls/evaluate", json=speech_payload, headers=headers)
    assert speech_res.status_code == 200
    speech_data = speech_res.json()
    assert speech_data["overall_score"] > 60.0
    assert "crm_note_text" in speech_data
