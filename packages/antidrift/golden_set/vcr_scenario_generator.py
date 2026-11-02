"""
packages/antidrift/golden_set/vcr_scenario_generator.py

Incident-to-VCR Generator (Sprint 3: Self-Healing & Closed-Loop Regression Engine):
Transforms production HARD_FAILURE incidents into sanitized Golden Set scenarios
and reproducible VCR cassettes.
"""

from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Optional

import yaml
from sqlalchemy.orm import Session

from packages.antidrift.golden_set.vcr_engine import PIISanitizer
from packages.antidrift.models import GoldenScenario, PendingVCRScenario, VCRCassette

logger = logging.getLogger("antidrift_vcr_scenario_generator")


class VCRScenarioGenerator:
    """
    Automates the ingestion of production policy breaches into the Golden Set:
    1. Sanitizes PII from production traces
    2. Categorizes incident into a benchmark cohort
    3. Produces executable pytest invariant definitions and frozen VCR cassettes
    """

    COHORT_MAP = {
        "GR-00": "01_safety",
        "GR-01": "01_safety",
        "GR-02": "04_conflicts",
        "GR-03": "03_financials",
        "GR-04": "02_core_sales",
        "GR-05": "01_safety",
    }

    @classmethod
    def map_policy_to_cohort(cls, rule_id: str) -> str:
        """Determines target benchmark cohort based on violated guardrail."""
        normalized = (rule_id or "").strip().upper()
        for prefix, cohort in cls.COHORT_MAP.items():
            if prefix in normalized:
                return cohort
        return "01_safety"

    @classmethod
    def capture_incident_as_pending(
        cls,
        db: Session,
        trace_id: str,
        source_policy: str,
        raw_trace: dict[str, Any],
        error_summary: str = "",
    ) -> Optional[PendingVCRScenario]:
        """
        Captures a live production HARD_FAILURE into pending_vcr_scenarios.
        Applies strict PII sanitization (redacting tokens, emails, phones).
        M7 Fix: Enforces daily quota (10 tests/day) and deduplication by root-cause.
        """
        if os.getenv("ENABLE_AUTO_VCR", "1") not in ("1", "true", "True"):
            return None

        # 1. M7 Daily Quota Guard (<= 50 auto-tests per 24 hours default in prod)
        is_testing = os.getenv("TESTING") in ("true", "1", "True")
        since_yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        if "MAX_DAILY_AUTO_VCR" in os.environ or not is_testing:
            max_daily = int(os.getenv("MAX_DAILY_AUTO_VCR", "50"))
            daily_count = (
                db.query(PendingVCRScenario)
                .filter(PendingVCRScenario.created_at >= since_yesterday)  # type: ignore[arg-type]
                .count()
            )
            if daily_count >= max_daily:
                logger.warning(
                    f"Auto-VCR capture throttled: daily limit of {max_daily} tests reached ({daily_count} in last 24h)."
                )
                return None

        # 2. M7 Deduplication Guard: Check if identical policy + error occurred for this tenant in last 24h
        norm_rule = str(source_policy or "HARD_FAILURE").strip()
        tenant_id = (raw_trace or {}).get("tenant_id")

        # Normalize root cause by stripping dynamic numbers/percentages (Audit 3.4)
        def _norm_root(msg: str) -> str:
            if not msg:
                return ""
            c = re.sub(r"\b\d+([.,]\d+)?%?", "<NUM>", msg)
            c = re.sub(r"[a-f0-9]{12,64}", "<HASH>", c)
            return " ".join(c.split()).lower()

        norm_input_err = _norm_root(error_summary)

        candidates = (
            db.query(PendingVCRScenario)
            .filter(
                PendingVCRScenario.source_policy == norm_rule,
                PendingVCRScenario.status.in_(("PENDING", "GENERATED", "APPROVED")),
                PendingVCRScenario.created_at >= since_yesterday,  # type: ignore[arg-type]
            )
            .all()
        )
        for existing_dup in candidates:
            dup_tenant = (existing_dup.pii_sanitized_trace or {}).get("tenant_id")
            existing_clean = _norm_root(existing_dup.error_summary or "")
            if (not tenant_id or dup_tenant == tenant_id) and (
                existing_clean == norm_input_err or not error_summary
            ):
                logger.info(
                    f"Auto-VCR capture deduplicated: matching scenario '{existing_dup.id}' already logged for rule '{norm_rule}'."
                )
                return existing_dup

        cohort = cls.map_policy_to_cohort(source_policy)
        sanitized_trace = PIISanitizer.sanitize_data(raw_trace)
        sanitized_error = PIISanitizer.sanitize_text(error_summary)

        # Audit 3.2: Store sanitized copy ONLY in raw_trace as well to prevent DB PII bypass
        pending = PendingVCRScenario(
            id=str(uuid.uuid4()),
            trace_id=trace_id,
            source_policy=source_policy or "HARD_FAILURE",
            cohort=cohort,
            raw_trace=sanitized_trace,
            pii_sanitized_trace=sanitized_trace,
            status="PENDING",
            error_summary=sanitized_error,
            created_at=datetime.now(timezone.utc),
        )

        db.add(pending)
        db.commit()
        db.refresh(pending)
        logger.info(
            f"Captured incident trace '{trace_id}' into pending VCR scenario '{pending.id}' "
            f"(cohort: {cohort}, policy: {source_policy})"
        )
        return pending

    @classmethod
    def generate_test_artifacts(
        cls,
        db: Session,
        scenario_id: str,
        base_dir: Optional[Path] = None,
    ) -> dict[str, Any]:
        """
        Converts a PENDING scenario into concrete Golden Scenario and VCR Cassette files.
        Marks pending record status as 'GENERATED'.
        """
        pending = (
            db.query(PendingVCRScenario)
            .filter(PendingVCRScenario.id == scenario_id)
            .first()
        )
        if not pending:
            raise ValueError(f"PendingVCRScenario '{scenario_id}' not found")
        if pending.status == "REJECTED":
            raise ValueError(f"Cannot generate test artifacts from REJECTED scenario '{scenario_id}'")

        root_dir = base_dir or Path(__file__).resolve().parent.parent.parent.parent
        short_id = pending.id[:8]
        cohort = pending.cohort

        # 1. Prepare Paths
        scenarios_dir = root_dir / "tests" / "golden_set" / cohort
        fixtures_dir = root_dir / "fixtures" / "vcr"
        scenarios_dir.mkdir(parents=True, exist_ok=True)
        fixtures_dir.mkdir(parents=True, exist_ok=True)

        json_file_path = scenarios_dir / f"auto_{short_id}.json"
        yaml_file_path = fixtures_dir / f"auto_{short_id}.yaml"

        sanitized: dict[str, Any] = getattr(pending, "pii_sanitized_trace", None) or {}
        crm_schema_hash = sanitized.get("crm_schema_hash", "default_hash")
        policy_ver = sanitized.get("policy_version", "v1.0")

        # 2. Structure Golden Scenario Payload
        golden_payload = {
            "scenario_id": f"auto_{short_id}",
            "cohort": cohort,
            "title": f"Auto-generated regression from incident {short_id} ({pending.source_policy})",
            "description": pending.error_summary or f"Regression test preventing breach of {pending.source_policy}",
            "input": sanitized,
            "expected_invariants": {
                "blocked": True,
                "expected_verdict": "HARD_FAILURE",
                "violated_rule": pending.source_policy,
            },
            "created_from_incident_id": pending.id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        # 3. Structure VCR Cassette Payload
        vcr_cassette_payload = {
            "version": 1,
            "cassette_id": f"cas_auto_{short_id}",
            "scenario_id": f"auto_{short_id}",
            "target_service": "crm_gateway",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "crm_schema_hash": crm_schema_hash,
            "policy_version": policy_ver,
            "status": "VALID",
            "interactions": [
                {
                    "request": {
                        "method": "POST",
                        "uri": "/api/v1/agents/execute",
                        "body": sanitized,
                    },
                    "response": {
                        "status": 403,
                        "body": {
                            "status": "BLOCKED",
                            "rule": pending.source_policy,
                            "error": pending.error_summary,
                        },
                    },
                }
            ],
        }

        # 4. Write artifacts to disk
        with open(json_file_path, "w", encoding="utf-8") as f:
            json.dump(golden_payload, f, ensure_ascii=False, indent=2)

        with open(yaml_file_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(vcr_cassette_payload, f, sort_keys=False, allow_unicode=True)

        # 5. Mirror in DB
        golden_db = GoldenScenario(
            scenario_id=f"auto_{short_id}",
            cohort=cohort,
            title=golden_payload["title"],
            description=golden_payload["description"],
            input_json=sanitized,
            crm_context_json={},
            expected_invariants_json=golden_payload["expected_invariants"],
            status="ACTIVE",
            created_from_incident_id=pending.id,
            created_at=datetime.now(timezone.utc),
        )
        db.merge(golden_db)

        cassette_db = VCRCassette(
            cassette_id=f"cas_auto_{short_id}",
            scenario_id=f"auto_{short_id}",
            target_service="crm_gateway",
            recorded_at=datetime.now(timezone.utc),
            crm_schema_hash=crm_schema_hash,
            policy_version=policy_ver,
            status="VALID",
            sanitized_payload_json=vcr_cassette_payload,
        )
        db.merge(cassette_db)

        setattr(pending, "status", "GENERATED")
        db.commit()

        return {
            "status": "GENERATED",
            "scenario_id": f"auto_{short_id}",
            "cohort": cohort,
            "json_path": str(json_file_path),
            "yaml_path": str(yaml_file_path),
        }

    @classmethod
    def review_pending_scenario(
        cls,
        db: Session,
        scenario_id: str,
        decision: str,
        base_dir: Optional[Path] = None,
    ) -> dict[str, Any]:
        """
        Processes human-in-the-loop review from Telegram bot or Admin Console.
        Decisions: 'APPROVE', 'REJECT'.
        """
        pending = (
            db.query(PendingVCRScenario)
            .filter(PendingVCRScenario.id == scenario_id)
            .first()
        )
        if not pending:
            raise ValueError(f"PendingVCRScenario '{scenario_id}' not found")

        decision_clean = decision.strip().upper()
        if decision_clean == "APPROVE":
            result = cls.generate_test_artifacts(db, scenario_id, base_dir=base_dir)
            setattr(pending, "status", "APPROVED")
            db.commit()
            return {"status": "APPROVED", "details": result}
        elif decision_clean == "REJECT":
            setattr(pending, "status", "REJECTED")
            db.commit()
            return {"status": "REJECTED", "scenario_id": scenario_id}
        else:
            raise ValueError(f"Unsupported review decision '{decision}'")

    @classmethod
    def get_golden_stats(cls, db: Session) -> dict[str, Any]:
        """Returns auto-generated test suite metrics for /golden_stats."""
        total_pending = (
            db.query(PendingVCRScenario)
            .filter(PendingVCRScenario.status == "PENDING")
            .count()
        )
        total_generated = (
            db.query(PendingVCRScenario)
            .filter(PendingVCRScenario.status.in_(["GENERATED", "APPROVED"]))
            .count()
        )
        total_rejected = (
            db.query(PendingVCRScenario)
            .filter(PendingVCRScenario.status == "REJECTED")
            .count()
        )

        seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent_generated = (
            db.query(PendingVCRScenario)
            .filter(
                PendingVCRScenario.status.in_(["GENERATED", "APPROVED"]),
                PendingVCRScenario.created_at >= seven_days_ago,
            )
            .count()
        )

        return {
            "auto_tests_total": total_generated,
            "auto_tests_last_7_days": recent_generated,
            "pending_review_count": total_pending,
            "rejected_count": total_rejected,
            "summary": (
                f"Авто-тестов из инцидентов: {total_generated} ({recent_generated} за последнюю неделю). "
                f"Ожидают ревью: {total_pending}."
            ),
        }
