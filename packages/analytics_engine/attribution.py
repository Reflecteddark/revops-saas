"""
W-Shaped Revenue Attribution Engine (V17.6 Block).
Distributes deal value across touchpoints:
- 40% First Touch (Первый клик / визит)
- 20% Lead Creation / Qualification (Квалификация)
- 40% Opportunity Close (Дожим / оплата)
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Any


@dataclass
class TouchpointEvent:
    deal_id: str
    channel: str           # e.g., 'Yandex Direct', 'Telegram Ads', 'SEO', 'Referral'
    stage: str             # 'first_touch', 'mid_touch', 'close_touch'
    cost_rub: float = 0.0


@dataclass
class ChannelAttribution:
    channel: str
    attributed_revenue_rub: float
    total_cost_rub: float
    romi_pct: float
    deals_influenced: int


def calculate_w_shaped_attribution(
    deals: list[dict[str, Any]],
    channel_ad_spend: dict[str, float],
) -> dict[str, Any]:
    """
    Applies W-shaped attribution across closed deals and ad spend per channel.
    """
    channel_revenue: dict[str, float] = defaultdict(float)
    channel_deals_count: dict[str, set] = defaultdict(set)

    for deal in deals:
        budget = float(deal.get("budget", 0.0))
        first_ch = deal.get("first_touch_channel", "Direct / None")
        mid_ch = deal.get("mid_touch_channel", first_ch)
        close_ch = deal.get("close_touch_channel", mid_ch)
        deal_id = deal.get("id", "deal_unknown")

        # 40% First Touch, 20% Mid Touch, 40% Close Touch
        channel_revenue[first_ch] += budget * 0.40
        channel_revenue[mid_ch] += budget * 0.20
        channel_revenue[close_ch] += budget * 0.40

        channel_deals_count[first_ch].add(deal_id)
        channel_deals_count[mid_ch].add(deal_id)
        channel_deals_count[close_ch].add(deal_id)

    all_channels = set(list(channel_revenue.keys()) + list(channel_ad_spend.keys()))
    results: list[ChannelAttribution] = []

    total_attributed_rev = sum(channel_revenue.values())
    total_spend = sum(channel_ad_spend.values())

    for ch in sorted(all_channels):
        rev = channel_revenue.get(ch, 0.0)
        spend = channel_ad_spend.get(ch, 0.0)
        romi = ((rev - spend) / spend * 100.0) if spend > 0 else (100.0 if rev > 0 else 0.0)

        results.append(
            ChannelAttribution(
                channel=ch,
                attributed_revenue_rub=round(rev, 2),
                total_cost_rub=round(spend, 2),
                romi_pct=round(romi, 1),
                deals_influenced=len(channel_deals_count.get(ch, set())),
            )
        )

    overall_romi = ((total_attributed_rev - total_spend) / total_spend * 100.0) if total_spend > 0 else 0.0

    return {
        "total_attributed_revenue_rub": round(total_attributed_rev, 2),
        "total_ad_spend_rub": round(total_spend, 2),
        "blended_romi_pct": round(overall_romi, 1),
        "channels": [r.__dict__ for r in results],
    }
