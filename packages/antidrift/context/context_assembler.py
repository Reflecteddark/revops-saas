"""
packages/antidrift/context/context_assembler.py

Trusted Context Assembler (Layer 0 Fact-Plane & Anti-Hallucination Barrier).
Assembles signed, deterministic fact-packages before LLM invocation or intent verification.
Zero hardcoding: dynamic multi-tenant isolation.
Fail-closed: raises ContextUnavailableError when DB mirror or CRM connection fails.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.database.models import Deal

logger = logging.getLogger("antidrift_context_assembler")


class ContextUnavailableError(RuntimeError):
    """
    Raised when TrustedContext cannot be reliably assembled
    due to database/CRM connection failure. Fail-closed security.
    """
    def __init__(self, message: str, is_transient: bool = False, retry_after: int = 5):
        super().__init__(message)
        self.is_transient = is_transient
        self.retry_after = retry_after


def _sanitize_markdown(val: Any) -> str:
    """Sanitizes text fields to prevent prompt/markdown injection into grounded prompt."""
    if not val:
        return ""
    s = str(val)
    s = s.replace("\r", " ").replace("\n", " ")
    for tag in ["#", "`", "[", "]", "<", ">"]:
        s = s.replace(tag, "")
    for injection_term in ["system:", "user:", "assistant:", "instruction:"]:
        s = re.sub(re.escape(injection_term), "", s, flags=re.IGNORECASE)
    return s.strip()


class TrustedContext(BaseModel):
    """
    Immutable, cryptographically signed set of ground-truth business facts.
    LLM agents are constrained to reason strictly within this context package.
    """
    tenant_id: str
    deal_id: str
    session_id: Optional[str] = None           # Task 4: Session-bound context hash
    deal_title: str = ""
    deal_amount: float = 0.0
    deal_stage: str = ""
    allowed_discount_max: float = 0.0          # Max allowed discount % (e.g. 5.0)
    allowed_deferment_days: int = 14           # Max payment deferment in days
    allowed_bonus_rub: float = 0.0             # Max allowed financial bonus
    allow_bonuses: bool = False                # Explicit authorization for bonuses
    allowed_free_services: list[str] = Field(default_factory=list) # e.g. ["доставка", "аудит"]
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
        if os.getenv("ENABLE_SESSION_BOUND_HASH", "1") in ("1", "true", "True") and self.session_id:
            payload["session_id"] = str(self.session_id)
        canonical_str = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
        return hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        """Serializes TrustedContext to standard dictionary."""
        return self.model_dump()

    def to_flat_dict(self) -> dict[str, Any]:
        """Returns flat key-value pairs of business facts for strict citation checking."""
        facts = {
            "tenant_id": self.tenant_id,
            "deal_id": str(self.deal_id),
            "deal_title": self.deal_title,
            "deal_amount": self.deal_amount,
            "deal_stage": self.deal_stage,
            "allowed_discount_max": self.allowed_discount_max,
            "allowed_deferment_days": self.allowed_deferment_days,
            "requires_human_above": self.requires_human_above,
            "context_hash": self.context_hash,
            "allowed_bonus_rub": self.allowed_bonus_rub,
            "allow_bonuses": self.allow_bonuses,
        }
        if self.session_id:
            facts["session_id"] = self.session_id
        return facts

    def to_markdown(self) -> str:
        """Renders canonical ground-truth facts for LLM injection with injection sanitization."""
        safe_tenant = _sanitize_markdown(self.tenant_id)
        safe_deal_id = _sanitize_markdown(self.deal_id)
        safe_title = _sanitize_markdown(self.deal_title) or 'Без названия'
        safe_stage = _sanitize_markdown(self.deal_stage) or 'Не указан'
        safe_services = ", ".join(_sanitize_markdown(s) for s in self.allowed_free_services) or "Нет"

        md = (
            f"### ДОВЕРЕННЫЙ БИЗНЕС-КОНТЕКСТ СДЕЛКИ (ИСТОЧНИК ИСТИНЫ)\n"
            f"- Идентификатор клиента / арендатора: {safe_tenant}\n"
            f"- Сделка: ID {safe_deal_id} ({safe_title})\n"
            f"- Бюджет / сумма сделки: {self.deal_amount:,.2f} ₽\n"
            f"- Текущий этап: {safe_stage}\n"
            f"- ЖЁСТКИЙ ПОТОЛОК СКИДКИ: {self.allowed_discount_max}%\n"
            f"- МАКСИМАЛЬНАЯ ОТСРОЧКА ПЛАТЕЖА: {self.allowed_deferment_days} дн.\n"
            f"- Разрешённые бесплатные услуги: {safe_services}\n"
            f"- Порог обязательного согласования человеком (РОП): {self.requires_human_above:,.2f} ₽\n"
            f"- Контрольная подпись контекста (context_hash): {self.context_hash}\n"
        )
        if self.session_id:
            md += f"- Идентификатор сессии: {_sanitize_markdown(self.session_id)}\n"
        return md

    def model_post_init(self, __context: Any) -> None:
        if not self.context_hash:
            self.context_hash = self.calculate_hash()


def build_grounded_system_prompt(base_prompt: str, trusted_context: TrustedContext) -> str:
    """
    Injects immutable ground-truth facts and strict operational guardrails
    into the agent's system prompt prior to generation.
    """
    return f"""{base_prompt.strip()}

{trusted_context.to_markdown()}
СТРОГИЕ ИНВАРИАНТЫ ГЕНЕРАЦИИ (ANTI-DRIFT GUARD):
1. Используй ТОЛЬКО факты из блока 'ДОВЕРЕННЫЙ БИЗНЕС-КОНТЕКСТ СДЕЛКИ'.
2. Любые скидки выше {trusted_context.allowed_discount_max}% или отсрочки более {trusted_context.allowed_deferment_days} дней ЗАПРЕЩЕНЫ.
3. Обязательно передай 'context_hash': '{trusted_context.context_hash}' в итоговом ответе.
4. В поле 'used_facts' явно перечисли факты из контекста, на которые опирался ответ.
5. Если клиент запрашивает условия, которых нет в контексте — НЕ ВЫДУМЫВАЙ! Установи requires_approval: true и зафиксируй вопрос в 'unverified_assumptions'.
"""


def assemble_trusted_context(
    db: Optional[Session],
    tenant_id: str,
    deal_id: str,
    session_id: Optional[str] = None,
    deal_context: Optional[dict[str, Any]] = None,
    allowed_discount_max: Optional[float] = None,
    allowed_deferment_days: Optional[int] = None,
    allowed_bonus_rub: Optional[float] = None,
    allow_bonuses: Optional[bool] = None,
    allowed_free_services: Optional[list[str]] = None,
    requires_human_above: Optional[float] = None,
    knowledge_refs: Optional[list[dict[str, Any]]] = None,
    enforce_policy_ceilings: bool = False,
) -> TrustedContext:
    """
    Assembles a verified TrustedContext for a given tenant, deal, and session.
    Queries the database mirror if available, or extracts from deal_context.
    Raises ContextUnavailableError (with is_transient flag) if DB query fails.
    """
    clean_tenant_id = tenant_id.strip()
    clean_deal_id = str(deal_id).strip()

    deal_title = ""
    deal_amount = 0.0
    deal_stage = ""

    # 1. Attempt lookup in DB mirror with fail-closed security
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
            err_msg = str(e).lower()
            is_transient = any(
                term in err_msg
                for term in ["timeout", "connection refused", "pool", "temporarily unavailable", "connect", "timed out"]
            )
            logger.error(
                f"Database error during trusted context assembly for deal {clean_deal_id} (transient={is_transient}): {e}"
            )
            raise ContextUnavailableError(
                f"Cannot assemble trusted context — database unavailable: {e}. Request blocked for safety.",
                is_transient=is_transient,
                retry_after=5 if is_transient else 0,
            ) from e

    # 2. Fallback to passed deal_context (when DB query was successful or db is None)
    if deal_context:
        if not deal_title:
            deal_title = str(deal_context.get("title", "") or "")
        if deal_amount == 0.0 and "budget" in deal_context:
            deal_amount = float(deal_context.get("budget", 0.0) or 0.0)
        elif deal_amount == 0.0 and "amount" in deal_context:
            deal_amount = float(deal_context.get("amount", 0.0) or 0.0)
        if not deal_stage:
            deal_stage = str(deal_context.get("stage", "") or deal_context.get("stage_name", "") or "")

    # 3. Policy limits from TenantPolicyRegistry (Audit 1.1: Calibrated per-tenant policies & whitelist)
    from packages.antidrift.contracts.policy_config import TenantPolicyRegistry
    tenant_cfg = TenantPolicyRegistry.get_config(clean_tenant_id)

    client_ref = None
    if deal_context:
        client_ref = str(deal_context.get("client_id") or deal_context.get("client_name") or deal_context.get("contact_phone") or "")

    effective_max_defer = tenant_cfg.get_effective_deferment_days(client_ref)
    disc_max = allowed_discount_max if allowed_discount_max is not None else tenant_cfg.allowed_discount_max
    defer_days = allowed_deferment_days if allowed_deferment_days is not None else effective_max_defer
    human_thresh = requires_human_above if requires_human_above is not None else tenant_cfg.requires_human_above

    # Audit 1.5: Caller inputs can only restrict, NEVER expand beyond tenant policy ceiling
    if enforce_policy_ceilings:
        if allowed_discount_max is not None:
            disc_max = min(float(allowed_discount_max), float(tenant_cfg.allowed_discount_max))
        if allowed_deferment_days is not None:
            defer_days = min(int(allowed_deferment_days), int(effective_max_defer))
        if requires_human_above is not None:
            human_thresh = min(float(requires_human_above), float(tenant_cfg.requires_human_above))

    ctx = TrustedContext(
        tenant_id=clean_tenant_id,
        deal_id=clean_deal_id,
        session_id=session_id,
        deal_title=deal_title,
        deal_amount=deal_amount,
        deal_stage=deal_stage,
        allowed_discount_max=disc_max,
        allowed_deferment_days=defer_days,
        allowed_bonus_rub=allowed_bonus_rub if allowed_bonus_rub is not None else 0.0,
        allow_bonuses=allow_bonuses if allow_bonuses is not None else False,
        allowed_free_services=allowed_free_services or [],
        requires_human_above=human_thresh,
        knowledge_refs=knowledge_refs or [],
    )
    return ctx
