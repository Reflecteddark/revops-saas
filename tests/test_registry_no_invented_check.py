"""A tenant whose average check was never set must read as "not set" (None), never as an invented 150 000."""

from packages.database.models import Tenant


def test_a_tenant_without_an_average_check_reads_as_not_set():
    tenant = Tenant(id="TNT-IC1", name="IC1", slug="tnt-ic1", settings={"crm_type": "amocrm"})
    assert tenant.to_registry_dict()["avg_deal_check"] is None


def test_an_average_check_that_was_set_is_kept():
    tenant = Tenant(id="TNT-IC2", name="IC2", slug="tnt-ic2", settings={"avg_deal_check": 85000})
    assert tenant.to_registry_dict()["avg_deal_check"] == 85000


def test_clearing_the_average_check_stays_cleared():
    tenant = Tenant(id="TNT-IC3", name="IC3", slug="tnt-ic3", settings={"avg_deal_check": None})
    assert tenant.to_registry_dict()["avg_deal_check"] is None
