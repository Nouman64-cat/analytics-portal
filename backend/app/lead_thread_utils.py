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


def _latest_interview_in_thread(session: Session, thread_id: uuid.UUID) -> Optional[Interview]:
    rows = session.exec(select(Interview).where(Interview.thread_id == thread_id)).all()
    if not rows:
        return None
    return max(rows, key=lambda x: (x.interview_date or date.min, x.created_at))


def _derive_lead_from_latest(session: Session, thread_id: uuid.UUID) -> dict[str, Any]:
    latest = _latest_interview_in_thread(session, thread_id)
    if not latest:
        return {
            "lead_outcome": "active",
            "lead_status_label": LEAD_STATUS_LABELS["active"],
            "lead_source": "derived",
        }

    sanitized = sanitize_status_for_interview_compute(latest.status)
    cs = compute_status(sanitized, latest.interview_date, latest.created_at)
    raw_lower = (latest.status or "").lower()

    if cs == "Unresponsed":
        return {
            "lead_outcome": "unresponsive",
            "lead_status_label": LEAD_STATUS_LABELS["unresponsive"],
            "lead_source": "derived",
        }
    if cs == "Dead":
        return {
            "lead_outcome": "dead",
            "lead_status_label": LEAD_STATUS_LABELS["dead"],
            "lead_source": "derived",
        }
    if cs == "Upcoming":
        return {
            "lead_outcome": "active",
            "lead_status_label": LEAD_STATUS_LABELS["active"],
            "lead_source": "derived",
        }

    # "Converted" is a round outcome only; the lead stays in pipeline until closed/rejected/etc.
    if (cs and "converted" in cs.lower()) or "converted" in raw_lower:
        return {
            "lead_outcome": "in_pipeline",
            "lead_status_label": LEAD_STATUS_LABELS["in_pipeline"],
            "lead_source": "derived",
        }
    if "reject" in raw_lower or (cs and "reject" in cs.lower()):
        return {
            "lead_outcome": "rejected",
            "lead_status_label": LEAD_STATUS_LABELS["rejected"],
            "lead_source": "derived",
        }
    # dropped / closed / dead are lead-thread outcomes only (set on the lead, not interview.status)

    return {
        "lead_outcome": "in_pipeline",
        "lead_status_label": cs if cs else LEAD_STATUS_LABELS["in_pipeline"],
        "lead_source": "derived",
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

    override = (lead_row.outcome_override or "").strip().lower() if lead_row else ""
    if override == "converted":
        override = ""
    if override and override in ALLOWED_LEAD_OUTCOMES:
        return {
            "lead_outcome": override,
            "lead_status_label": LEAD_STATUS_LABELS.get(
                override, override.replace("_", " ").title()
            ),
            "lead_source": "explicit",
            "lead_notes": notes,
            "lead_closed_at": closed_at,
        }

    derived = _derive_lead_from_latest(session, thread_id)
    derived["lead_notes"] = notes
    derived["lead_closed_at"] = closed_at
    return derived


def is_lead_terminal_outcome(outcome: str) -> bool:
    o = outcome.lower()
    return o in ("dropped", "dead", "rejected", "closed") or o in ("unresponsive",)
