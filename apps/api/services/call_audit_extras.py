# -*- coding: utf-8 -*-
"""
The audit contract v2 (docs/audit/spec_contract_v2.md): what the AI says about a call besides the 13 marks.

n8n sends it with /calls/ingest; it is stored inside scorecard_criteria (JSON), so no migration is needed. Everything
arrives from the outside, so it is cut to size and checked before it is stored or shown to a РОП.
"""

from types import SimpleNamespace
from typing import Any

N_CRITERIA = 13
TEXT_MAX = 400  # one reason or one quote
SUMMARY_MAX = 800
SHORT_MAX = 60  # call_type, ended_by, audit_model
URL_MAX = 2000


def _text(value: Any, limit: int) -> str:
    return str(value).strip()[:limit] if value is not None else ""


def clean_evidence(raw: Any) -> dict[str, dict[str, str]] | None:
    """{"cr1": {"why", "quote"}, ...}: only known criteria, only non-empty items, texts cut to TEXT_MAX."""
    if not isinstance(raw, dict):
        return None
    out: dict[str, dict[str, str]] = {}
    for i in range(1, N_CRITERIA + 1):
        item = raw.get(f"cr{i}")
        if not isinstance(item, dict):
            continue
        why, quote = _text(item.get("why"), TEXT_MAX), _text(item.get("quote"), TEXT_MAX)
        if why or quote:
            out[f"cr{i}"] = {"why": why, "quote": quote}
    return out or None


def clean_audio_url(value: Any) -> str | None:
    url = _text(value, URL_MAX + 1)
    if not url or len(url) > URL_MAX:
        return None
    return url if url.startswith(("https://", "http://", "/")) else None


def has_audio(sc: Any, audio_column: Any) -> bool:
    return bool(clean_audio_url(sc.get("audio_url") if isinstance(sc, dict) else None) or audio_column)


def without_audio_link(sc: Any) -> dict[str, Any]:
    """A scorecard as the browser may see it: the recording link stays on the server (it may be a signed link)."""
    return {k: v for k, v in sc.items() if k != "audio_url"} if isinstance(sc, dict) else {}


def audit_extras(payload: Any) -> dict[str, Any]:
    """The contract-v2 fields of an ingest payload that may be shown to the cabinet. The audio link is NOT among them."""
    extras: dict[str, Any] = {}
    for key, limit in (("call_type", SHORT_MAX), ("ended_by", SHORT_MAX), ("audit_model", SHORT_MAX), ("summary", SUMMARY_MAX)):
        value = _text(getattr(payload, key, None), limit)
        if value:
            extras[key] = value
    version = getattr(payload, "audit_version", None)
    if isinstance(version, int) and not isinstance(version, bool):
        extras["audit_version"] = version
    reached = getattr(payload, "reached_decision_maker", None)
    if isinstance(reached, bool):
        extras["reached_decision_maker"] = reached
    evidence = clean_evidence(getattr(payload, "evidence", None))
    if evidence:
        extras["evidence"] = evidence
    return extras


def pick_extras(sc: dict[str, Any]) -> dict[str, Any]:
    """The same fields read back from a stored scorecard, in the same shape (nothing stored is trusted blindly)."""

    keys = ("call_type", "ended_by", "audit_model", "summary", "audit_version", "reached_decision_maker", "evidence")
    return audit_extras(SimpleNamespace(**{k: sc.get(k) for k in keys}))
