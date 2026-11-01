"""
packages/antidrift/context/context_assembler.py

Trusted Context Assembler (Layer 0 Fact-Plane & Anti-Hallucination Barrier).
Assembles signed, deterministic fact-packages before LLM invocation or intent verification.
Zero hardcoding: dynamic multi-tenant isolation.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.database.models import Deal

logger = logging.getLogger("antidrift_context_assembler")


class TrustedContext(BaseModel):
    """
    Immutable, cryptographically signed set of ground-truth business facts.
    LLM agents are constrained to reason strictly within this context package.
    """
    tenant_id: str
    deal_id: str
    deal_title: str = ""
    deal_amount: float = 0.0
    deal_stage: str = ""
    allowed_discount_max: float = 0.0          # Max allowed discount % (e.g. 5.0)
    allowed_deferment_days: int = 14           # Max payment deferment in days
    requires_human_above: float = 300000.0     # Amounts above this force human approval
    knowledge_refs: list[dict[str, Any]] = Field(default_factory=list)
    assembled_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    context_hash: str = ""

    def calculate_hash(self) -> str:
        """Computes deterministic SHA-256 hash over canonical facts."""
        payload = {
            "tenant_id": self.tenant_id,
            "deal_id": str(self.deal_id),
            "deal_title": self.deal_title,
            "deal_amount": round(float(self.deal_amount), 2),
            "deal_stage": str(self.deal_stage),
            "allowed_discount_max": round(float(self.allowed_discount_max), 2),
            "allowed_deferment_days": int(self.allowed_deferment_days),
            "requires_human_above": round(float(self.requires_human_above), 2),
            "knowledge_refs": self.knowledge_refs,
        }
        canonical_str = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        """Serializes TrustedContext to standard dictionary."""
        return self.model_dump()

    def model_post_init(self, __context: Any) -> None:
        if not self.context_hash:
            self.context_hash = self.calculate_hash()


def assemble_trusted_context(
    db: Optional[Session],
    tenant_id: str,
    deal_id: str,
    deal_context: Optional[dict[str, Any]] = None,
    allowed_discount_max: Optional[float] = None,
    allowed_deferment_days: Optional[int] = None,
    requires_human_above: Optional[float] = None,
    knowledge_refs: Optional[list[dict[str, Any]]] = None,
) -> TrustedContext:
    """
    Assembles a verified TrustedContext for a given tenant and deal.
    Queries the database mirror if available, or extracts from deal_context.
    """
    clean_tenant_id = tenant_id.strip()
    clean_deal_id = str(deal_id).strip()

    deal_title = ""
    deal_amount = 0.0
    deal_stage = ""

    # 1. Attempt lookup in DB mirror
    if db is not None and clean_deal_id:
        try:
            deal = (
                db.query(Deal)
                .filter(
                    (Deal.id == clean_deal_id) | (Deal.external_crm_id == clean_deal_id),
                    Deal.tenant_id == clean_tenant_id,
                )
                .first()
            )
            if deal:
                deal_title = str(getattr(deal, "title", "") or "")
                deal_amount = float(getattr(deal, "budget", 0.0) or 0.0)
                deal_stage = str(getattr(deal, "stage_name", "") or getattr(deal, "stage", "") or "")
        except Exception as e:
            logger.warning(f"Could not load deal {clean_deal_id} from DB mirror: {e}")

    # 2. Fallback to passed deal_context
    if deal_context:
        if not deal_title:
            deal_title = str(deal_context.get("title", "") or "")
        if deal_amount == 0.0 and "budget" in deal_context:
            deal_amount = float(deal_context.get("budget", 0.0) or 0.0)
        elif deal_amount == 0.0 and "amount" in deal_context:
            deal_amount = float(deal_context.get("amount", 0.0) or 0.0)
        if not deal_stage:
            deal_stage = str(deal_context.get("stage", "") or deal_context.get("stage_name", "") or "")

    # 3. Policy limits
    disc_max = allowed_discount_max if allowed_discount_max is not None else 5.0
    defer_days = allowed_deferment_days if allowed_deferment_days is not None else 14
    human_thresh = requires_human_above if requires_human_above is not None else 300000.0

    ctx = TrustedContext(
        tenant_id=clean_tenant_id,
        deal_id=clean_deal_id,
        deal_title=deal_title,
        deal_amount=deal_amount,
        deal_stage=deal_stage,
        allowed_discount_max=disc_max,
        allowed_deferment_days=defer_days,
        requires_human_above=human_thresh,
        knowledge_refs=knowledge_refs or [],
    )
    return ctx
