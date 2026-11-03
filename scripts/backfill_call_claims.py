"""
One-time rollout of /calls/claim: mark calls that were already audited as done, so moving the n8n dedup from
workflow staticData to DB claims does not audit them a second time.

Sources:
  * call_recordings: calls that reached the cabinet;
  * amoCRM audit notes (n8n node 18 ends each one with "──────────\\nid: <call_id>") on the entities behind the
    latest 250 call events of every amoCRM tenant: the same window the n8n poll (node 02) reads. A call is claimed
    under the polling tenant, as node 14 does.

Read-only towards amoCRM. Dry run unless --apply.
Usage (inside the revops-api container): python -m scripts.backfill_call_claims [--apply]
"""

import argparse
import re
import time

import requests
from sqlalchemy import text

from apps.api.routers.calls_router import mark_call_processed
from apps.api.tenant_registry import load_tenants_registry
from packages.database.session import SessionLocal

AUDIT_FOOTER = re.compile(r"──────────\nid: (\S+)\s*$")
PLURAL = {"lead": "leads", "contact": "contacts", "company": "companies", "customer": "customers"}


def amo_get(domain: str, token: str, path: str, params: dict) -> dict:
    time.sleep(0.2)  # stay far below the amoCRM rate limit (7 rps)
    r = requests.get(f"https://{domain}{path}", headers={"Authorization": f"Bearer {token}"}, params=params, timeout=30)
    if r.status_code == 204:
        return {}
    r.raise_for_status()
    return r.json()


def audited_call_ids(domain: str, token: str) -> tuple[int, set[str]]:
    events = amo_get(domain, token, "/api/v4/events",
                     {"filter[type]": "outgoing_call,incoming_call", "limit": 250}).get("_embedded", {}).get("events", [])
    entities = {(PLURAL.get(str(e.get("entity_type", "lead")).lower(), "leads"), e["entity_id"])
                for e in events if e.get("entity_id")}
    found: set[str] = set()
    for entity_type, entity_id in sorted(entities):
        page = 1
        while True:
            notes = amo_get(domain, token, f"/api/v4/{entity_type}/{entity_id}/notes",
                            {"limit": 250, "page": page}).get("_embedded", {}).get("notes", [])
            for n in notes:
                m = AUDIT_FOOTER.search(str((n.get("params") or {}).get("text", "")))
                if m:
                    found.add(m.group(1))
            if len(notes) < 250:
                break
            page += 1
    return len(events), found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    apply = parser.parse_args().apply

    db = SessionLocal()
    try:
        targets: set[tuple[str, str]] = set()
        rows = db.execute(text("SELECT tenant_id, external_call_id FROM call_recordings WHERE external_call_id IS NOT NULL"))
        from_db = {(t.upper(), c) for t, c in rows if t and c}
        print(f"call_recordings: {len(from_db)} calls")
        targets |= from_db

        for tid, cfg in load_tenants_registry().items():
            if cfg.get("crm_type") != "amocrm" or not cfg.get("amo_token") or not cfg.get("amo_domain"):
                continue
            domain = str(cfg["amo_domain"]).replace("https://", "").replace("http://", "").strip("/")
            n_events, ids = audited_call_ids(domain, cfg["amo_token"])
            print(f"{tid}: {n_events} call events, {len(ids)} calls already have an audit note")
            targets |= {(tid, c) for c in ids}

        done = {(t, c) for t, c in db.execute(text("SELECT tenant_id, call_id FROM call_processing_claims WHERE status = 'done'"))}
        todo = sorted(k for k in targets - done if len(k[1]) <= 150)
        print(f"to mark done: {len(todo)} (already done: {len(targets & done)})")
        if not apply:
            print("dry run: nothing written (use --apply)")
            return
        for tid, call_id in todo:
            mark_call_processed(db, tid, call_id)
        print(f"marked done: {len(todo)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
