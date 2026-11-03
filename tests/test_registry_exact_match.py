# -*- coding: utf-8 -*-
"""A tenant id must resolve to ITS config only - never to a tenant whose id merely contains it."""

from apps.api import tenant_registry


def test_similar_tenant_ids_do_not_share_a_config(monkeypatch):
    registry = {"tenants": [{"tenant_id": "TNT-100", "spreadsheet_id": "SHEET-100"},
                            {"tenant_id": "TNT-001", "spreadsheet_id": "SHEET-001"}]}
    monkeypatch.setattr(tenant_registry, "load_tenants_registry", lambda: registry)

    assert tenant_registry.get_tenant_config("tnt-100")["spreadsheet_id"] == "SHEET-100"
    for lookalike in ("TNT-1000", "TNT-0011", "TNT-001-TEST", "TNT-9ZZ-NOPE", ""):
        cfg = tenant_registry.get_tenant_config(lookalike)
        assert not cfg or cfg.get("spreadsheet_id") not in ("SHEET-100", "SHEET-001"), lookalike
