# -*- coding: utf-8 -*-
"""Amount parsing from CRM strings (audit 2026-11-03: a trailing "руб."/"р." dot inflated sums ×100)."""

import pytest

from apps.api.services.crm_deal_normalizer import parse_numeric_price


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("150 000 ₽", 150000.0),
        ("150 000,50 ₽", 150000.5),          # non-breaking space
        ("150 000,50", 150000.5),
        ("150 000,50 руб.", 150000.5),            # was 15 000 050
        ("1 500.75 руб.", 1500.75),               # was 150 075
        ("2 000.00 р.", 2000.0),                  # was 200 000
        ("р.2000", 2000.0),
        ("RUB 2 000,00", 2000.0),
        ("$1,234.56", 1234.56),
        ("1.234,56 EUR", 1234.56),
        ("€ 99,99", 99.99),
        ("1,500", 1500.0),                        # thousands separator rule kept
        ("100.500", 100500.0),
        ("300,50", 300.5),
        ("1 234 567", 1234567.0),
        ("1e6", 1000000.0),                       # was 16
        ("15 тыс.", 15000.0),                     # was 15
        ("0,5 млн", 500000.0),                    # was 0.5
        ("0.00", 0.0),
        (150000, 150000.0),
        (150000.5, 150000.5),
    ],
)
def test_known_amount_formats(raw, expected):
    price, unknown = parse_numeric_price(raw)
    assert price == pytest.approx(expected)
    assert unknown is False


@pytest.mark.parametrize("raw", [None, "", "  ", "abc", "-50 000", "−50 000", -5, float("nan")])
def test_unknown_or_negative_is_unknown_zero(raw):
    # a negative budget is junk/refund: it must not turn into a positive sum
    assert parse_numeric_price(raw) == (0.0, True)
