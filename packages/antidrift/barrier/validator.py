"""
packages/antidrift/barrier/validator.py

Intent & Action Validator.
Inspects AgentIntentPayload before any policy or execution step.
Enforces capability scopes, sanitizes reasoning, and blocks code injection.
"""

from __future__ import annotations

import re
from typing import Any
from packages.antidrift.contracts.intent import AgentIntentPayload, ActionItem


class IntentValidationError(Exception):
    def __init__(self, message: str, violations: list[str] | None = None):
        super().__init__(message)
        self.violations = violations or [message]


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
