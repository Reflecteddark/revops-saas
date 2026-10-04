"""
Unit Tests for Database Engine Primary & Read Replica Routing.
Verifies:
- Dual connection pool configuration
- get_read_db() dependency yields active session
- Telemetry properly reflects read replica configuration
"""

import os
from packages.database.session import get_db, get_read_db, get_db_routing_info, engine, engine_read
from sqlalchemy.orm import Session


def test_db_routing_telemetry():
    info = get_db_routing_info()
    assert "primary_configured" in info
    assert info["primary_configured"] is True
    assert "has_read_replica" in info
    assert "read_dialect" in info


def test_get_db_and_get_read_db_sessions():
    # 1. Primary write session
    write_gen = get_db()
    write_session = next(write_gen)
    assert isinstance(write_session, Session)
    try:
        next(write_gen)
    except StopIteration:
        pass

    # 2. Read replica analytical session
    read_gen = get_read_db()
    read_session = next(read_gen)
    assert isinstance(read_session, Session)
    try:
        next(read_gen)
    except StopIteration:
        pass


def test_monitoring_endpoint_exposes_database_telemetry():
    from fastapi.testclient import TestClient
    from apps.api.main import app

    client = TestClient(app)
    res = client.get("/api/v1/monitoring/health")
    assert res.status_code == 200
    data = res.json()
    assert "database" in data
    assert data["database"]["primary_configured"] is True
