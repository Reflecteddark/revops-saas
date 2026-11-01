"""
packages/antidrift/barrier/validator.py

Intent & Action Validator.
Inspects AgentIntentPayload before any policy or execution step.
Enforces capability scopes, sanitizes reasoning, blocks code injection,
and performs Layer 1.5 Fact-Checking against TrustedContext.
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any, Optional
from packages.antidrift.contracts.intent import AgentIntentPayload, ActionItem


class IntentValidationError(Exception):
    def __init__(self, message: str, violations: list[str] | None = None):
        super().__init__(message)
        self.violations = violations or [message]


class ValidationResult(list):
    """
    Dual-interface validation result:
    - Behaves as list[str] for backward compatibility with len(), iter, truthiness
    - Exposes object properties: .blocked (bool), .reason (str), .violations (list[str])
    """
    def __init__(
        self,
        violations: list[str] | None = None,
        blocked: Optional[bool] = None,
        reason: Optional[str] = None,
    ):
        items: list[str] = list(violations or [])
        if reason and reason not in items:
            items.append(reason)
        super().__init__(items)
        self.blocked: bool = blocked if blocked is not None else (len(items) > 0)
        self.reason: str = reason or ("; ".join(items) if items else "")
        self.violations: list[str] = list(items)

    @property
    def is_valid(self) -> bool:
        return not self.blocked


# Dangerous substrings that must never appear in agent reasoning or parameters
DANGEROUS_PATTERNS = [
    re.compile(r"<\s*script", re.IGNORECASE),
    re.compile(r"\bdrop\s+table\b", re.IGNORECASE),
    re.compile(r"\bdelete\s+from\b", re.IGNORECASE),
    re.compile(r"\bexec\s*\(", re.IGNORECASE),
    re.compile(r"\beval\s*\(", re.IGNORECASE),
    re.compile(r"\brm\s+-rf\b", re.IGNORECASE),
    re.compile(r"\b__import__\b", re.IGNORECASE),
]

# Sensitive secrets patterns (API tokens, private keys)
SECRET_PATTERNS = [
    re.compile(r"\b(ghp|gho|pat|xoxb|xoxp)_[a-zA-Z0-9]{20,}\b"),
    re.compile(r"\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b"),  # JWT prefix
    re.compile(r"\b(AIzaSy)[a-zA-Z0-9_-]{33}\b"),                  # Google API key
]


class IntentValidator:
    """Validates structural integrity, scope permissions, and safety of AgentIntentPayload."""

    @classmethod
    def validate_intent(cls, intent: AgentIntentPayload) -> list[str]:
        """
        Validates the intent against hard structural constraints.
        Returns a list of violation messages. Empty list = VALID.
        """
        violations: list[str] = []

        # 1. Check capability scopes
        action_scope_map = {
            "crm_get_deal": "crm.read",
            "crm_get_contact": "crm.read",
            "crm_get_tasks": "crm.read",
            "crm_add_tag": "crm.tags",
            "crm_remove_tag": "crm.tags",
            "crm_add_note": "crm.notes",
            "crm_update_stage": "crm.update_stage",
            "crm_create_task": "crm.create_task",
            "crm_set_field": "crm.set_field",
            "crm_change_budget": "crm.financials",
            "crm_reassign_manager": "crm.reassign",
            "crm_close_deal_lost": "crm.close_deal",
            "crm_close_deal_won": "crm.close_deal",
            "trigger_webhook": "integrations.webhooks",
            "crm_delete_entity": "crm.destructive",
        }

        for action in intent.proposed_actions:
            action_type_val = action.action_type.value
            required_scope = action_scope_map.get(action_type_val)
            if required_scope and required_scope not in intent.capability_scopes:
                violations.append(
                    f"Action '{action_type_val}' requires scope '{required_scope}', "
                    f"authorized scopes: {intent.capability_scopes}"
                )

        # 2. Check for code injection in reasoning_summary and string payload fields
        cls._scan_for_injection(intent.reasoning_summary, "reasoning_summary", violations)
        
        for action in intent.proposed_actions:
            cls._scan_payload_recursively(action.payload, f"action[{action.action_id}].payload", violations)

        if intent.proposed_client_reply:
            cls._scan_for_injection(intent.proposed_client_reply.text, "client_reply.text", violations)

        # 3. Check for leaked secrets
        cls._scan_for_secrets(intent.reasoning_summary, "reasoning_summary", violations)

        return violations

    @classmethod
    def _scan_for_injection(cls, text: str, field_name: str, violations: list[str]) -> None:
        if not text:
            return
        for pattern in DANGEROUS_PATTERNS:
            if pattern.search(text):
                violations.append(f"Dangerous code pattern detected in {field_name}: '{pattern.pattern}'")

    @classmethod
    def _scan_for_secrets(cls, text: str, field_name: str, violations: list[str]) -> None:
        if not text:
            return
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                violations.append(f"Potential secret token leaked in {field_name}")

    @classmethod
    def _scan_payload_recursively(cls, obj: Any, path: str, violations: list[str]) -> None:
        if isinstance(obj, str):
            cls._scan_for_injection(obj, path, violations)
            cls._scan_for_secrets(obj, path, violations)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                cls._scan_payload_recursively(v, f"{path}.{k}", violations)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                cls._scan_payload_recursively(v, f"{path}[{i}]", violations)

    @classmethod
    def _check_discount_claims(cls, text: str, trusted_context: Any) -> list[str]:
        violations: list[str] = []
        max_allowed_discount = float(getattr(trusted_context, "allowed_discount_max", 0.0) or 0.0)

        # 1. Numeric percentages
        discount_patterns = [
            re.compile(r"(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
            re.compile(r"(?:скидк\w*|дисконт\w*)\s+(?:в\s+)?(\d+(?:\.\d+)?)", re.IGNORECASE),
            re.compile(r"(\d+(?:\.\d+)?)\s*процент\w*", re.IGNORECASE),
        ]
        for pattern in discount_patterns:
            for match in pattern.finditer(text):
                try:
                    discount_val = float(match.group(1))
                    if discount_val > max_allowed_discount:
                        violations.append(
                            f"Proposed discount {discount_val}% exceeds maximum authorized limit "
                            f"{max_allowed_discount}% from trusted context (GR-03)"
                        )
                except (ValueError, IndexError):
                    pass

        # 2. Russian word numbers with percent
        word_numbers = {
            "ноль": 0, "один": 1, "два": 2, "три": 3, "четыре": 4, "пять": 5,
            "шесть": 6, "семь": 7, "восемь": 8, "девять": 9, "десять": 10,
            "одиннадцать": 11, "двенадцать": 12, "тринадцать": 13, "четырнадцать": 14, "пятнадцать": 15,
            "шестнадцать": 16, "семнадцать": 17, "восемнадцать": 18, "девятнадцать": 19, "двадцать": 20,
            "тридцать": 30, "сорок": 40, "пятьдесят": 50, "шестьдесят": 60, "семьдесят": 70,
            "восемьдесят": 80, "девяносто": 90, "сто": 100
        }
        word_discount_pattern = re.compile(
            r"(?:скидк\w*|дисконт\w*)\s+(?:в\s+)?([а-яё]+)\s*процент\w*", re.IGNORECASE
        )
        for match in word_discount_pattern.finditer(text):
            word = match.group(1).lower()
            if word in word_numbers:
                discount_val = float(word_numbers[word])
                if discount_val > max_allowed_discount:
                    violations.append(
                        f"Proposed discount {discount_val}% ({word}) exceeds maximum authorized limit "
                        f"{max_allowed_discount}% from trusted context (GR-03)"
                    )
        return violations

    @classmethod
    def _check_deferment_claims(cls, text: str, trusted_context: Any) -> list[str]:
        violations: list[str] = []
        max_allowed_deferment = int(getattr(trusted_context, "allowed_deferment_days", 14) or 14)

        # 1. Numeric days
        deferment_pattern = re.compile(
            r"(?:отсрочк\w*|рассрочк\w*)\s+(?:на\s+)?(\d+)\s*(?:дн|day)", re.IGNORECASE
        )
        for match in deferment_pattern.finditer(text):
            try:
                days_val = int(match.group(1))
                if days_val > max_allowed_deferment:
                    violations.append(
                        f"Proposed deferment {days_val} days exceeds maximum authorized limit "
                        f"{max_allowed_deferment} days from trusted context (GR-03)"
                    )
            except (ValueError, IndexError):
                pass

        # 2. Word-based durations
        duration_phrases = [
            (re.compile(r"(?:отсрочк\w*|рассрочк\w*)\s+(?:на\s+)?два\s+месяц\w*", re.IGNORECASE), 60),
            (re.compile(r"(?:отсрочк\w*|рассрочк\w*)\s+(?:на\s+)?полгода", re.IGNORECASE), 180),
            (re.compile(r"(?:отсрочк\w*|рассрочк\w*)\s+(?:на\s+)?месяц", re.IGNORECASE), 30),
            (re.compile(r"(?:отсрочк\w*|рассрочк\w*)\s+(?:на\s+)?три\s+недел\w*", re.IGNORECASE), 21),
            (re.compile(r"(?:отсрочк\w*|рассрочк\w*)\s+(?:на\s+)?две\s+недел\w*", re.IGNORECASE), 14),
            (re.compile(r"(?:отсрочк\w*|рассрочк\w*)\s+(?:на\s+)?недел\w*", re.IGNORECASE), 7),
        ]
        for pattern, days_val in duration_phrases:
            if pattern.search(text):
                if days_val > max_allowed_deferment:
                    violations.append(
                        f"Proposed deferment {days_val} days exceeds maximum authorized limit "
                        f"{max_allowed_deferment} days from trusted context (GR-03)"
                    )
                break
        return violations

    @classmethod
    def _check_financial_bonuses(cls, text: str, trusted_context: Any) -> list[str]:
        violations: list[str] = []
        allowed_bonus = float(getattr(trusted_context, "allowed_bonus_rub", 0.0) or 0.0)
        allow_bonuses = bool(getattr(trusted_context, "allow_bonuses", False))

        bonus_patterns = [
            re.compile(r"(?:бонус\w*|подар\w*|дарим)\s+(?:в\s+размере\s+)?(\d[\d\s]*)\s*(?:₽|руб)", re.IGNORECASE),
            re.compile(r"(\d[\d\s]*)\s*(?:₽|руб)\s*(?:в\s+подарок|бонус\w*)", re.IGNORECASE),
            re.compile(r"(?:бонус\w*|подарок)\s+(\d[\d\s]*)\s*(?:к|k|тыс)", re.IGNORECASE),
            re.compile(r"(?:денежн\w*\s+компенсаци\w*|бесплатн\w*\s+месяц\s+подписк\w*)", re.IGNORECASE),
        ]
        for pat in bonus_patterns:
            m = pat.search(text)
            if m:
                claimed_amount = 0.0
                if m.groups() and m.group(1):
                    raw_num = m.group(1).replace(" ", "")
                    try:
                        claimed_amount = float(raw_num)
                        if any(k in m.group(0).lower() for k in ("к", "k", "тыс")):
                            claimed_amount *= 1000.0
                    except ValueError:
                        claimed_amount = 0.0

                if not allow_bonuses and allowed_bonus == 0.0:
                    violations.append(
                        f"Unauthorized financial bonus or gift promised in reply: '{m.group(0).strip()}' (GR-03)"
                    )
                    break
                elif claimed_amount > 0 and claimed_amount > allowed_bonus:
                    violations.append(
                        f"Proposed bonus amount {claimed_amount:,.0f} ₽ exceeds authorized limit "
                        f"{allowed_bonus:,.0f} ₽ from trusted context (GR-03)"
                    )
                    break
        return violations

    @classmethod
    def _check_legal_guarantees(cls, text: str) -> list[str]:
        violations: list[str] = []
        guarantee_patterns = [
            re.compile(r"гарантиру\w*\s+100%\s*возврат", re.IGNORECASE),
            re.compile(r"гарантиру\w*\s+возврат\s+(?:денег|средств)", re.IGNORECASE),
            re.compile(r"обязуемся\s+выплатить\s+(?:неустойку|штраф|компенсацию)", re.IGNORECASE),
            re.compile(r"выплатим\s+неустойку", re.IGNORECASE),
            re.compile(r"юридически\s+гарантиру\w*", re.IGNORECASE),
            re.compile(r"гаранти\w*\s+результат\w*(?:\s+или\s+вернем\s+деньги)?", re.IGNORECASE),
            re.compile(r"гарантируем\s+окупаемость", re.IGNORECASE),
            re.compile(r"штрафн\w*\s+санкци\w*\s+(?:включим|гарантируем)", re.IGNORECASE),
        ]
        for pat in guarantee_patterns:
            m = pat.search(text)
            if m:
                violations.append(
                    f"Unauthorized legal or financial guarantee offered: '{m.group(0).strip()}' (GR-03)"
                )
        return violations

    @classmethod
    def _check_amount_misquotes(cls, text: str, trusted_context: Any) -> list[str]:
        violations: list[str] = []
        ctx_amount = getattr(trusted_context, "deal_amount", None)
        if ctx_amount is None or float(ctx_amount) <= 0:
            return violations

        ctx_amount = float(ctx_amount)
        misquote_pattern = re.compile(
            r"(?:бюджет\w*|сумм\w*(?:\s+сделки|\s+договора)?|стоимост\w*)\s*(?:составляет|в)?\s*(\d[\d\s]*)\s*(?:[kк]|тыс(?:\.|яч)?)?\s*(?:₽|руб)?",
            re.IGNORECASE,
        )
        for match in misquote_pattern.finditer(text):
            raw_str = match.group(1).replace(" ", "")
            try:
                val = float(raw_str)
                full_match = match.group(0).lower()
                if "к" in full_match or "k" in full_match or "тыс" in full_match:
                    val *= 1000.0

                if val > 0 and abs(val - ctx_amount) / ctx_amount > 0.01:
                    violations.append(
                        f"Reply misquotes deal amount / budget: mentions {val:,.0f} ₽, "
                        f"but trusted context deal_amount is {ctx_amount:,.0f} ₽ (GR-03)"
                    )
            except (ValueError, IndexError):
                pass
        return violations

    @classmethod
    def _check_unauthorized_services(cls, text: str, trusted_context: Any) -> list[str]:
        violations: list[str] = []
        allowed_services = [
            str(s).strip().lower()
            for s in (getattr(trusted_context, "allowed_free_services", []) or [])
        ]
        service_patterns = [
            (re.compile(r"бесплатн\w*\s+доставк\w*", re.IGNORECASE), "доставка"),
            (re.compile(r"бесплатн\w*\s+аудит\w*", re.IGNORECASE), "аудит"),
            (re.compile(r"бесплатн\w*\s+интеграци\w*", re.IGNORECASE), "интеграция"),
            (re.compile(r"бесплатн\w*\s+настройк\w*", re.IGNORECASE), "настройка"),
            (re.compile(r"бесплатн\w*\s+внедрени\w*", re.IGNORECASE), "внедрение"),
            (re.compile(r"бесплатн\w*\s+техподдержк\w*", re.IGNORECASE), "техподдержка"),
            (re.compile(r"бесплатн\w*\s+перенос\w*\s+данных", re.IGNORECASE), "перенос данных"),
        ]
        for pat, key in service_patterns:
            m = pat.search(text)
            if m:
                if not any(key in allowed for allowed in allowed_services):
                    violations.append(
                        f"Unauthorized free service promised: '{m.group(0).strip()}' (GR-03)"
                    )
        return violations

    @classmethod
    def validate_reply_text(
        cls,
        reply_text: str,
        trusted_context: Any,
    ) -> ValidationResult:
        """
        Post-validation of generated agent communication text across 6 categories:
        1. Discounts (numeric and verbal)
        2. Payment deferments (days and timeframes)
        3. Financial bonuses and gifts
        4. Legal / financial unconditional guarantees
        5. Deal amount / budget misquotes
        6. Unauthorized complimentary services
        """
        violations: list[str] = []
        if not reply_text or trusted_context is None:
            return ValidationResult(violations, blocked=False)

        text = reply_text.strip()
        is_extended_enabled = os.getenv("ENABLE_EXTENDED_REPLY_CHECKS", "1") in ("1", "true", "True")

        # 1. Discount verification
        violations.extend(cls._check_discount_claims(text, trusted_context))

        # 2. Payment deferment verification
        violations.extend(cls._check_deferment_claims(text, trusted_context))

        if is_extended_enabled:
            # 3. Financial bonuses
            violations.extend(cls._check_financial_bonuses(text, trusted_context))

            # 4. Legal guarantees
            violations.extend(cls._check_legal_guarantees(text))

            # 5. Amount misquotes
            violations.extend(cls._check_amount_misquotes(text, trusted_context))

            # 6. Unauthorized services
            violations.extend(cls._check_unauthorized_services(text, trusted_context))

        return ValidationResult(violations)

    @classmethod
    def validate_context_freshness(
        cls,
        proposal: Any,
        trusted_context: Any,
        ttl_seconds: int = 60,
    ) -> ValidationResult:
        """
        Validates that the context bound to the intent proposal is sufficiently fresh (TTL).
        Blocks stale context to prevent attacks or race conditions using outdated CRM data (GR-03).
        """
        violations: list[str] = []
        if os.getenv("ENABLE_CONTEXT_TTL", "1") not in ("1", "true", "True"):
            return ValidationResult(violations, blocked=False)

        if trusted_context is None:
            return ValidationResult(violations, blocked=False)

        # Context assemble timestamp: either from proposal or from trusted_context
        assembled_at = getattr(proposal, "context_assembled_at", None)
        if assembled_at is None:
            if getattr(proposal, "context_hash", None):
                violations.append("Missing context_assembled_at timestamp (GR-03)")
                return ValidationResult(violations)
            assembled_at = getattr(trusted_context, "assembled_at", None)

        if assembled_at:
            now = datetime.now(timezone.utc)
            if assembled_at.tzinfo is None:
                assembled_at = assembled_at.replace(tzinfo=timezone.utc)
            age = (now - assembled_at).total_seconds()
            if age > ttl_seconds:
                violations.append(
                    f"Context is stale: assembled {age:.1f}s ago, TTL is {ttl_seconds}s (GR-03)"
                )

        return ValidationResult(violations)

    @classmethod
    def _detect_commercial_claims(cls, text: str) -> bool:
        """Detects commercial promises (discounts, deferments, financial terms) in text."""
        if not text:
            return False
        commercial_patterns = [
            re.compile(r"\d+\s*%", re.IGNORECASE),
            re.compile(r"процент", re.IGNORECASE),
            re.compile(r"скидк\w*", re.IGNORECASE),
            re.compile(r"дисконт\w*", re.IGNORECASE),
            re.compile(r"\d+\s*(?:дн|day)", re.IGNORECASE),
            re.compile(r"отсрочк\w*", re.IGNORECASE),
            re.compile(r"рассрочк\w*", re.IGNORECASE),
            re.compile(r"\d+\s*(?:₽|руб)", re.IGNORECASE),
            re.compile(r"бонус\w*", re.IGNORECASE),
            re.compile(r"подарок\w*", re.IGNORECASE),
            re.compile(r"бюджет\w*", re.IGNORECASE),
            re.compile(r"стоимост\w*", re.IGNORECASE),
            re.compile(r"цен[ауые]", re.IGNORECASE),
        ]
        text_lower = text.lower()
        return any(p.search(text_lower) for p in commercial_patterns)

    @classmethod
    def validate_used_facts_against_context(
        cls,
        cited_facts: list[str],
        trusted_context: Any,
        reply_text: Optional[str] = None,
    ) -> ValidationResult:
        """
        Validates that every citation in 'used_facts' strictly matches
        the canonical ground-truth facts from TrustedContext.
        Blocks empty used_facts when commercial claims are made in reply_text (GR-03).
        Blocks hallucinated keys, corrupted values, and malformed citations (GR-03).
        """
        violations: list[str] = []
        if trusted_context is None:
            return ValidationResult(violations, blocked=False)

        # 0. Check for missing used_facts when commercial claims are made in reply text
        if reply_text:
            has_commercial_claims = cls._detect_commercial_claims(reply_text)
            if has_commercial_claims and not cited_facts:
                violations.append(
                    "Missing used_facts — commercial claims made without citing trusted context facts (GR-03)"
                )
                return ValidationResult(violations)

        if not cited_facts:
            return ValidationResult(violations, blocked=False)

        if not hasattr(trusted_context, "to_flat_dict"):
            return ValidationResult(violations, blocked=False)

        context_facts = trusted_context.to_flat_dict()

        for cited in cited_facts:
            if not isinstance(cited, str) or ":" not in cited:
                violations.append(f"Malformed fact citation: '{cited}' (expected 'key: value')")
                continue

            key, value = cited.split(":", 1)
            key, value = key.strip(), value.strip()

            if key not in context_facts:
                violations.append(
                    f"LLM cited non-existent fact '{key}' (hallucinated citation, GR-03)"
                )
                continue

            ctx_val = context_facts[key]

            # Strict integer vs float vs bool vs None vs string comparison
            is_match = False
            try:
                if isinstance(ctx_val, bool):
                    is_match = str(value).strip().lower() in ("true", "1") if ctx_val else str(value).strip().lower() in ("false", "0")
                elif isinstance(ctx_val, int):
                    # Strict integer check: 14 vs "14" or "14.0", but NOT "14.0001"
                    val_f = float(value)
                    is_match = val_f.is_integer() and int(val_f) == ctx_val
                elif isinstance(ctx_val, float):
                    is_match = abs(ctx_val - float(value)) < 1e-4
                elif ctx_val is None:
                    is_match = str(value).strip().lower() in ("none", "null", "")
                else:
                    is_match = str(ctx_val).strip().lower() == value.lower()
            except (ValueError, TypeError):
                is_match = str(ctx_val).strip().lower() == value.lower()

            if not is_match:
                violations.append(
                    f"Fact '{key}' misquoted: context={ctx_val}, cited={value} (GR-03)"
                )

        return ValidationResult(violations)

    @classmethod
    def validate_against_trusted_context(
        cls,
        intent: AgentIntentPayload,
        trusted_context: Any,
        require_hash: bool = False,
    ) -> ValidationResult:
        """
        Layer 1.5 Fact-Check:
        Verifies agent statements against the cryptographically signed TrustedContext.
        Detects hallucinated discounts, unauthorized payment deferments, and context hash mismatches.
        If require_hash is True, missing context_hash is treated as a bypass attempt (GR-03).
        """
        violations: list[str] = []
        if trusted_context is None:
            return ValidationResult(violations, blocked=False)

        # 1. Verify Context Hash (with zero-bypass protection)
        claimed_hash = getattr(intent, "context_hash", None)
        expected_hash = getattr(trusted_context, "context_hash", None)

        if require_hash and not claimed_hash:
            violations.append("Missing context_hash — fact-check bypass attempt (GR-03)")
        elif claimed_hash and expected_hash and claimed_hash != expected_hash:
            violations.append(
                f"Context hash mismatch: intent signed with '{claimed_hash}', but active context is '{expected_hash}' (GR-03)"
            )

        # 1.1 Session-bound context verification (Task 4)
        session_bound_enabled = os.getenv("ENABLE_SESSION_BOUND_HASH", "1") in ("1", "true", "True")
        if session_bound_enabled:
            ctx_session = getattr(trusted_context, "session_id", None)
            intent_session = getattr(intent, "session_id", None)
            if ctx_session and intent_session and ctx_session != intent_session:
                violations.append(
                    f"Cross-session replay detected: context session '{ctx_session}' does not match intent session '{intent_session}' (GR-03)"
                )

        # 1.2 Freshness & TTL check (Task 3)
        is_ttl_enabled = os.getenv("ENABLE_CONTEXT_TTL", "1") in ("1", "true", "True")
        if is_ttl_enabled and (require_hash or getattr(intent, "context_hash", None)):
            freshness_result = cls.validate_context_freshness(intent, trusted_context)
            if freshness_result.blocked:
                violations.extend(freshness_result.violations)

        # 2. Check cited used_facts against ground truth facts with reply text inspection
        is_used_facts_enabled = os.getenv("ENABLE_USED_FACTS_VALIDATION", "1") in ("1", "true", "True")
        if is_used_facts_enabled and (require_hash or getattr(intent, "context_hash", None)):
            cited_facts = getattr(intent, "used_facts", None) or []
            reply_text = getattr(intent.proposed_client_reply, "text", None) if intent.proposed_client_reply else None
            facts_result = cls.validate_used_facts_against_context(
                cited_facts=cited_facts,
                trusted_context=trusted_context,
                reply_text=reply_text,
            )
            if facts_result.blocked:
                violations.extend(facts_result.violations)

        # 3. Check reply text via standalone validate_reply_text
        if intent.proposed_client_reply and intent.proposed_client_reply.text:
            text_result = cls.validate_reply_text(intent.proposed_client_reply.text, trusted_context)
            violations.extend(text_result.violations)

        return ValidationResult(violations)


# Convenient module-level aliases
validate_against_trusted_context = IntentValidator.validate_against_trusted_context
validate_reply_text = IntentValidator.validate_reply_text
validate_used_facts_against_context = IntentValidator.validate_used_facts_against_context
validate_context_freshness = IntentValidator.validate_context_freshness
