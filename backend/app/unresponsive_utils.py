"""Shared logic for finding leads that are unresponsive for 15+ days.

Handles both:
  - Explicit: outcome_override == "unresponsive" (with or without unresponsive_since)
  - Derived:  latest interview has no status and its date/created_at is 15-29 days old
              (these leads show as "Unresponsive" in the UI but have NULL outcome_override)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional
import uuid

from sqlmodel import Session, select, or_, and_

from app.models.interview import Interview
from app.models.lead_thread import LeadThread

UNRESPONSIVE_FOLLOWUP_DAYS = 15
UNRESPONSIVE_TO_DEAD_DAYS = 30

_TERMINAL_OVERRIDES = frozenset({"dropped", "dead", "rejected", "closed", "unresponsive"})


@dataclass
class UnresponsiveLeadInfo:
    thread_id: uuid.UUID
    lead_thread: LeadThread
    days_unresponsive: int


def find_unresponsive_leads_needing_followup(session: Session) -> list[UnresponsiveLeadInfo]:
    """Return all leads currently showing as Unresponsive for 15–29 days.

    Covers both explicitly-set (outcome_override='unresponsive') and
    derived (NULL override, latest interview has no status and is 15-29 days old).
    Results are sorted by days_unresponsive descending.
    """
    now = datetime.utcnow()
    today = now.date()
    cutoff_15d = now - timedelta(days=UNRESPONSIVE_FOLLOWUP_DAYS)
    cutoff_30d = now - timedelta(days=UNRESPONSIVE_TO_DEAD_DAYS)
    date_15 = today - timedelta(days=UNRESPONSIVE_FOLLOWUP_DAYS)
    date_30 = today - timedelta(days=UNRESPONSIVE_TO_DEAD_DAYS)

    result: list[UnresponsiveLeadInfo] = []
    seen: set[uuid.UUID] = set()

    # ── 1. Explicit: outcome_override == "unresponsive" ────────────────────────
    # Include if unresponsive_since is set and >= 15d old,
    # OR if unresponsive_since is missing (aggressive: we can't verify age so include it).
    explicit_rows = session.exec(
        select(LeadThread).where(
            LeadThread.outcome_override == "unresponsive",
            or_(
                and_(
                    LeadThread.unresponsive_since.isnot(None),
                    LeadThread.unresponsive_since <= cutoff_15d,
                ),
                LeadThread.unresponsive_since.is_(None),
            ),
        )
    ).all()

    for lt in explicit_rows:
        since = lt.unresponsive_since or lt.updated_at
        days = max(1, (now - since).days)
        result.append(UnresponsiveLeadInfo(thread_id=lt.thread_id, lead_thread=lt, days_unresponsive=days))
        seen.add(lt.thread_id)

    # ── 2. Derived: interviews with no status, 15-29 days old ─────────────────
    # An interview computes to "Unresponsed" when:
    #   status is NULL/empty AND date is past AND days_past < 30
    # We want those where days_past >= 15 (15+ days unresponsive, not yet dead).
    candidate_ivs = session.exec(
        select(Interview).where(
            or_(Interview.status.is_(None), Interview.status == ""),
            or_(
                # Has a date: 15–29 days ago
                and_(
                    Interview.interview_date.isnot(None),
                    Interview.interview_date <= date_15,
                    Interview.interview_date > date_30,
                ),
                # No date: use created_at, 15–29 days ago
                and_(
                    Interview.interview_date.is_(None),
                    Interview.created_at <= cutoff_15d,
                    Interview.created_at > cutoff_30d,
                ),
            ),
        )
    ).all()

    # Threads we haven't already caught via explicit check
    candidate_thread_ids = {iv.thread_id for iv in candidate_ivs} - seen
    if not candidate_thread_ids:
        result.sort(key=lambda x: x.days_unresponsive, reverse=True)
        return result

    # Load ALL interviews for those threads so we can find the true latest per thread
    all_ivs = session.exec(
        select(Interview).where(Interview.thread_id.in_(candidate_thread_ids))
    ).all()
    thread_iv_map: dict[uuid.UUID, list[Interview]] = {}
    for iv in all_ivs:
        thread_iv_map.setdefault(iv.thread_id, []).append(iv)

    # Load LeadThread rows (some threads may not have a row yet)
    lt_map: dict[uuid.UUID, Optional[LeadThread]] = {tid: None for tid in candidate_thread_ids}
    for lt in session.exec(
        select(LeadThread).where(LeadThread.thread_id.in_(candidate_thread_ids))
    ).all():
        lt_map[lt.thread_id] = lt

    for thread_id in candidate_thread_ids:
        if thread_id in seen:
            continue

        lt = lt_map.get(thread_id)

        # Skip if the thread has a terminal explicit override (including "unresponsive" which
        # would already be in the explicit results above)
        if lt:
            override = (lt.outcome_override or "").strip().lower()
            if override in _TERMINAL_OVERRIDES:
                continue

        ivs = thread_iv_map.get(thread_id)
        if not ivs:
            continue

        # True latest interview in this thread
        latest = max(ivs, key=lambda x: (x.interview_date or date.min, x.created_at))

        # Must have no explicit status (otherwise it's not "Unresponsed")
        if latest.status and latest.status.strip():
            continue

        if latest.interview_date:
            if latest.interview_date > today:
                continue                                           # still upcoming
            days_past = (today - latest.interview_date).days
            if days_past >= UNRESPONSIVE_TO_DEAD_DAYS:
                continue                                           # would compute as Dead
            if days_past < UNRESPONSIVE_FOLLOWUP_DAYS:
                continue                                           # not 15 days yet
            days_unresponsive = days_past
        else:
            days_past = (today - latest.created_at.date()).days
            if days_past >= UNRESPONSIVE_TO_DEAD_DAYS:
                continue
            if days_past < UNRESPONSIVE_FOLLOWUP_DAYS:
                continue
            days_unresponsive = days_past

        # Create a minimal LeadThread stand-in if no row exists yet
        lead_row = lt if lt is not None else LeadThread(thread_id=thread_id)
        result.append(UnresponsiveLeadInfo(
            thread_id=thread_id,
            lead_thread=lead_row,
            days_unresponsive=days_unresponsive,
        ))
        seen.add(thread_id)

    result.sort(key=lambda x: x.days_unresponsive, reverse=True)
    return result
