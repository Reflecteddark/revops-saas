"""Регрессия: /api/v1/deals не должен падать с 500."""
from fastapi.testclient import TestClient
from apps.api.main import app

client = TestClient(app)


def test_admin_router_imports_cleanly():
    from apps.api.routers import admin_router
    assert admin_router.router is not None


def test_app_imports_cleanly():
    assert app is not None


def test_deals_endpoint_returns_200():
    res = client.get("/api/v1/deals?tenant_id=TNT-001")
    assert res.status_code == 200, f"API упал: {res.status_code} {res.text[:200]}"
    data = res.json()
    assert "deals" in data
    assert "total" in data


def test_deals_pipelines_endpoint_returns_200():
    res = client.get("/api/v1/deals/pipelines?tenant_id=TNT-001")
    assert res.status_code == 200, f"Pipelines API error: {res.status_code} {res.text[:200]}"
    data = res.json()
    assert data["status"] == "ok"
    assert "pipelines" in data
    assert len(data["pipelines"]) >= 1
    main_p = data["pipelines"][0]
    assert "stages" in main_p
    assert len(main_p["stages"]) >= 1


def test_deal_single_detail_and_linked_calls():
    # Insert or query a test deal
    from packages.database.session import SessionLocal
    from packages.database.models import Deal, DealStage, CallRecording, Tenant, Workspace, SubscriptionTier
    db = SessionLocal()
    try:
        t = db.query(Tenant).filter(Tenant.id == "TNT-TEST-PIPELINE").first()
        if not t:
            t = Tenant(id="TNT-TEST-PIPELINE", name="Test Pipeline Tenant", slug="tnt-test-pipeline", tier=SubscriptionTier.PRO)
            db.add(t)
            db.commit()

        ws = db.query(Workspace).filter(Workspace.id == "ws_test_pipeline").first()
        if not ws:
            ws = Workspace(id="ws_test_pipeline", tenant_id="TNT-TEST-PIPELINE", name="Test WS", crm_type="amocrm")
            db.add(ws)
            db.commit()

        d = db.query(Deal).filter(Deal.id == "TEST-DEAL-001").first()
        if not d:
            d = Deal(
                id="TEST-DEAL-001",
                tenant_id="TNT-TEST-PIPELINE",
                workspace_id="ws_test_pipeline",
                title="ООО Ромашка Тест",
                budget=150000.0,
                stage=DealStage.QUALIFICATION,
                stage_name="Квалификация",
                pipeline_id="pipe_vip",
                pipeline_name="VIP Воронка",
                crm_source="amocrm"
            )
            db.add(d)
            db.commit()

        c = db.query(CallRecording).filter(CallRecording.id == "call-test-001").first()
        if not c:
            c = CallRecording(
                id="call-test-001",
                tenant_id="TNT-TEST-PIPELINE",
                deal_id="TEST-DEAL-001",
                client_phone="+79991234567",
                duration_seconds=185,
                overall_score=85.0,
                transcript_text="Здравствуйте, мы по поводу КП...",
                scorecard_criteria={"greeting": 1, "qualification": 1}
            )
            db.add(c)
            db.commit()

        # Query single deal detail
        res = client.get("/api/v1/deals/TEST-DEAL-001?tenant_id=TNT-TEST-PIPELINE")
        assert res.status_code == 200, f"Detail API error: {res.status_code} {res.text[:200]}"
        deal_info = res.json()["deal"]
        assert deal_info["id"] == "TEST-DEAL-001"
        assert deal_info["pipeline_name"] == "VIP Воронка"
        assert deal_info["calls_count"] >= 1
        assert len(deal_info["calls"]) >= 1
        assert deal_info["calls"][0]["overall_score"] == 85.0

        # Query deals list filtered by pipeline_id
        list_res = client.get("/api/v1/deals?tenant_id=TNT-TEST-PIPELINE&pipeline_id=pipe_vip")
        assert list_res.status_code == 200
        vip_deals = list_res.json()["deals"]
        assert len(vip_deals) >= 1
        assert vip_deals[0]["pipeline_id"] == "pipe_vip"
    finally:
        db.close()

