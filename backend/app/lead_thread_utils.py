"""Thread-level lead (opportunity) status: explicit overrides vs derived from latest interview."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any, Optional

from sqlmodel import Session, select

from app.models.interview import Interview
from app.models.lead_thread import LeadThread
from app.status_utils import compute_status, sanitize_status_for_interview_compute

# Stored in lead_threads.outcome_override (lowercase slugs)
ALLOWED_LEAD_OUTCOMES = frozenset(
    {
        "active",
        "unresponsive",
        "dropped",
        "dead",
        "rejected",
        "closed",
    }
)

# Human-readable labels for API + UI (no "Lead" prefix — status column is already lead context)
LEAD_STATUS_LABELS: dict[str, str] = {
    "active": "Active",
    "unresponsive": "Unresponsive",
    "dropped": "Dropped",
    "dead": "Dead",
    "rejected": "Rejected",
    "closed": "Closed",
    "in_pipeline": "In pipeline",
}


def ensure_lead_thread(session: Session, thread_id: uuid.UUID) -> LeadThread:
    """Create a lead_threads row if missing (idempotent)."""
    row = session.get(LeadThread, thread_id)
    if row:
        return row
    row = LeadThread(thread_id=thread_id)
    session.add(row)
    return row


def load_lead_map(session: Session, thread_ids: set[uuid.UUID]) -> dict[uuid.UUID, LeadThread]:
    if not thread_ids:
        return {}
    rows = session.exec(select(LeadThread).where(LeadThread.thread_id.in_(thread_ids))).all()
    return {r.thread_id: r for r in rows}


def _all_interviews_in_thread(session: Session, thread_id: uuid.UUID) -> list[Interview]:
    return session.exec(select(Interview).where(Interview.thread_id == thread_id)).all()


def _derive_lead_outcome(session: Session, thread_id: uuid.UUID) -> dict[str, Any]:
    rows = _all_interviews_in_thread(session, thread_id)
    if not rows:
        return {
            "lead_outcome": "active",
            "lead_status_label": LEAD_STATUS_LABELS["active"],
            "lead_source": "derived",
        }

    # ANY round converted -> is_converted = True
    any_converted = False
    for r in rows:
        sanitized = sanitize_status_for_interview_compute(r.status)
        cs = compute_status(sanitized, r.interview_date, r.created_at)
        raw_lower = (r.status or "").lower()
        if (cs and "converted" in cs.lower()) or "converted" in raw_lower:
            any_converted = True
            break

    # Outcome derived from LATEST round
    latest = max(rows, key=lambda x: (x.interview_date or date.min, x.created_at))
    sanitized = sanitize_status_for_interview_compute(latest.status)
    cs = compute_status(sanitized, latest.interview_date, latest.created_at)
    raw_lower = (latest.status or "").lower()

    if cs == "Unresponsed":
        outcome = "unresponsive"
    elif cs == "Dead":
        outcome = "dead"
    elif "reject" in raw_lower or (cs and "reject" in cs.lower()):
        outcome = "rejected"
    elif cs == "Upcoming":
        outcome = "active"
    else:
        outcome = "in_pipeline"

    return {
        "lead_outcome": outcome,
        "lead_status_label": LEAD_STATUS_LABELS.get(outcome, cs or outcome.title()),
        "lead_source": "derived",
        "is_converted": any_converted,
    }


def effective_lead_fields(
    session: Session,
    thread_id: uuid.UUID,
    lead_row: Optional[LeadThread],
) -> dict[str, Any]:
    """Return lead_outcome, lead_status_label, lead_source, lead_notes for API responses."""
    notes: Optional[str] = None
    closed_at: Optional[datetime] = None
    if lead_row:
        notes = lead_row.notes
        closed_at = lead_row.closed_at

    # Determine outcome
    res = {}
    override = (lead_row.outcome_override or "").strip().lower() if lead_row else ""
    if override and override in ALLOWED_LEAD_OUTCOMES:
        res = {
            "lead_outcome": override,
            "lead_status_label": LEAD_STATUS_LABELS.get(
                override, override.replace("_", " ").title()
            ),
            "lead_source": "explicit",
        }
    else:
        res = _derive_lead_outcome(session, thread_id)

    # Attach common fields
    res["lead_notes"] = notes
    res["lead_closed_at"] = closed_at
    
    # Always include/apply conversion status
    if lead_row and lead_row.is_converted_override is not None:
        res["is_converted"] = lead_row.is_converted_override
    else:
        # If not overridden, we might still need to derive it if 'res' came from explicit override
        if "is_converted" not in res:
            derived = _derive_lead_outcome(session, thread_id)
            res["is_converted"] = derived.get("is_converted", False)
        
    return res


def is_lead_terminal_outcome(outcome: str) -> bool:
    o = outcome.lower()
    return o in ("dropped", "dead", "rejected", "closed") or o in ("unresponsive",)
