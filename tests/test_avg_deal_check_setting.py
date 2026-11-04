"""
The company's average deal check is a setting the CLIENT controls (Settings -> General), not a value baked in at tenant creation.
- saving stores it at the tenant top level (where /insights reads it); 0/null clears it; an absent field leaves it alone
- reading returns it (None when not set - nothing is assumed)
- a currency cell that holds other text must not be shown as the currency
"""

from apps.api import tenant_registry
from apps.api.routers.settings_router import (
    GeneralSettings,
    SettingsPayload,
    _clean_currency,
    get_tenant_settings_or_fallback,
    save_settings_to_sheets,
)


def _patch_registry(monkeypatch, tenant):
    reg = {"tenants": [tenant]}
    monkeypatch.setattr(tenant_registry, "load_tenants_registry", lambda: reg)
    monkeypatch.setattr(tenant_registry, "save_tenants_registry", lambda data, *a, **k: True)
    return reg


def test_avg_deal_check_is_saved_to_the_tenant(monkeypatch):
    reg = _patch_registry(monkeypatch, {"tenant_id": "TNT-AVG", "avg_deal_check": 150000})

    save_settings_to_sheets(SettingsPayload(tenant_id="TNT-AVG", general=GeneralSettings(avg_deal_check=90000)))

    assert reg["tenants"][0]["avg_deal_check"] == 90000.0
    # it is not duplicated into general_settings
    assert "avg_deal_check" not in reg["tenants"][0].get("general_settings", {})


def test_zero_or_null_clears_the_avg_deal_check(monkeypatch):
    reg = _patch_registry(monkeypatch, {"tenant_id": "TNT-AVG", "avg_deal_check": 150000})
    save_settings_to_sheets(SettingsPayload(tenant_id="TNT-AVG", general=GeneralSettings(avg_deal_check=0)))
    assert reg["tenants"][0]["avg_deal_check"] is None

    reg = _patch_registry(monkeypatch, {"tenant_id": "TNT-AVG", "avg_deal_check": 150000})
    save_settings_to_sheets(SettingsPayload(tenant_id="TNT-AVG", general=GeneralSettings(avg_deal_check=None)))
    assert reg["tenants"][0]["avg_deal_check"] is None


def test_saving_other_fields_leaves_the_avg_deal_check_alone(monkeypatch):
    reg = _patch_registry(monkeypatch, {"tenant_id": "TNT-AVG", "avg_deal_check": 150000})

    save_settings_to_sheets(SettingsPayload(tenant_id="TNT-AVG", general=GeneralSettings(monthly_target=3000000)))

    assert reg["tenants"][0]["avg_deal_check"] == 150000


def test_settings_read_returns_the_avg_deal_check_or_none(monkeypatch):
    monkeypatch.setattr(tenant_registry, "get_tenant_config", lambda tid: {"tenant_name": "X", "avg_deal_check": 120000})
    assert get_tenant_settings_or_fallback("TNT-AVG")["general"]["avg_deal_check"] == 120000

    monkeypatch.setattr(tenant_registry, "get_tenant_config", lambda tid: {"tenant_name": "X"})
    assert get_tenant_settings_or_fallback("TNT-AVG")["general"]["avg_deal_check"] is None


def test_currency_cell_with_other_text_falls_back():
    assert _clean_currency("ТЕСТ АМО ЦРМ", "RUB (₽)") == "RUB (₽)"
    assert _clean_currency("", "RUB (₽)") == "RUB (₽)"
    assert _clean_currency("RUB (₽)", "USD") == "RUB (₽)"
    assert _clean_currency("USD", "RUB (₽)") == "USD"
    assert _clean_currency("рубли", "USD") == "рубли"
