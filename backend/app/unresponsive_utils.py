"""Shared logic for finding leads that are unresponsive for 15+ days.

Three categories are covered:
  1. Explicit lead override: lead_threads.outcome_override == "unresponsive"
  2. Stored "Unresponsed" string on the interview: interview.status == "Unresponsed"
     and the interview is the latest in its thread (this is the dominant case in prod).
  3. Derived NULL-status: latest interview has no status and its date is 15-29 days
     old (30+ days computes as Dead via compute_status, so those are excluded).
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

# Overrides that mean the lead is definitively closed — exclude from notifications.
# "unresponsive" is NOT here; explicit unresponsive leads are handled in category 1.
_TERMINAL_OVERRIDES = frozenset({"dropped", "dead", "rejected", "closed"})


@dataclass
class UnresponsiveLeadInfo:
    thread_id: uuid.UUID
    lead_thread: LeadThread
    days_unresponsive: int


def _latest_interview(ivs: list[Interview]) -> Interview:
    return max(ivs, key=lambda x: (x.interview_date or date.min, x.created_at))


def find_unresponsive_leads_needing_followup(session: Session) -> list[UnresponsiveLeadInfo]:
    """Return all leads currently showing as Unresponsive for 15+ days.

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

    # ── Category 1: explicit outcome_override == "unresponsive" ───────────────
    explicit_rows = session.exec(
        select(LeadThread).where(
            LeadThread.outcome_override == "unresponsive",
            or_(
                and_(
                    LeadThread.unresponsive_since.isnot(None),
                    LeadThread.unresponsive_since <= cutoff_15d,
                ),
                # No timestamp → include aggressively (we can't verify age)
                LeadThread.unresponsive_since.is_(None),
            ),
        )
    ).all()
    for lt in explicit_rows:
        since = lt.unresponsive_since or lt.updated_at
        days = max(1, (now - since).days)
        result.append(UnresponsiveLeadInfo(thread_id=lt.thread_id, lead_thread=lt, days_unresponsive=days))
        seen.add(lt.thread_id)

    # ── Category 2: interview.status == "Unresponsed" (stored string) ─────────
    # This is the dominant case: users explicitly set status="Unresponsed" on the
    # interview row. compute_status returns this string as-is regardless of age,
    # so these leads stay "Unresponsive" even past 30 days.
    unresponsed_ivs = session.exec(
        select(Interview).where(
            Interview.status == "Unresponsed",
            or_(
                and_(Interview.interview_date.isnot(None), Interview.interview_date <= date_15),
                and_(Interview.interview_date.is_(None), Interview.created_at <= cutoff_15d),
            ),
        )
    ).all()

    candidate_thread_ids_2 = {iv.thread_id for iv in unresponsed_ivs} - seen
    if candidate_thread_ids_2:
        all_ivs_2 = session.exec(
            select(Interview).where(Interview.thread_id.in_(candidate_thread_ids_2))
        ).all()
        thread_iv_map_2: dict[uuid.UUID, list[Interview]] = {}
        for iv in all_ivs_2:
            thread_iv_map_2.setdefault(iv.thread_id, []).append(iv)

        lt_map_2 = {
            lt.thread_id: lt
            for lt in session.exec(
                select(LeadThread).where(LeadThread.thread_id.in_(candidate_thread_ids_2))
            ).all()
        }

        for thread_id in candidate_thread_ids_2:
            if thread_id in seen:
                continue

            lt = lt_map_2.get(thread_id)
            if lt:
                override = (lt.outcome_override or "").strip().lower()
                if override in _TERMINAL_OVERRIDES:
                    continue

            ivs = thread_iv_map_2.get(thread_id)
            if not ivs:
                continue

            latest = _latest_interview(ivs)
            if latest.status != "Unresponsed":
                # A newer interview exists with a different status → not currently unresponsive
                continue

            if latest.interview_date:
                days_unresponsive = (today - latest.interview_date).days
            else:
                days_unresponsive = (today - latest.created_at.date()).days

            if days_unresponsive < UNRESPONSIVE_FOLLOWUP_DAYS:
                continue

            lead_row = lt if lt is not None else LeadThread(thread_id=thread_id)
            result.append(UnresponsiveLeadInfo(
                thread_id=thread_id,
                lead_thread=lead_row,
                days_unresponsive=days_unresponsive,
            ))
            seen.add(thread_id)

    # ── Category 3: derived NULL-status, 15-29 days old ───────────────────────
    # Interviews with no status where compute_status would return "Unresponsed"
    # (once past 30 days with no status, compute_status returns "Dead" instead).
    candidate_ivs_3 = session.exec(
        select(Interview).where(
            or_(Interview.status.is_(None), Interview.status == ""),
            or_(
                and_(
                    Interview.interview_date.isnot(None),
                    Interview.interview_date <= date_15,
                    Interview.interview_date > date_30,
                ),
                and_(
                    Interview.interview_date.is_(None),
                    Interview.created_at <= cutoff_15d,
                    Interview.created_at > cutoff_30d,
                ),
            ),
        )
    ).all()

    candidate_thread_ids_3 = {iv.thread_id for iv in candidate_ivs_3} - seen
    if candidate_thread_ids_3:
        all_ivs_3 = session.exec(
            select(Interview).where(Interview.thread_id.in_(candidate_thread_ids_3))
        ).all()
        thread_iv_map_3: dict[uuid.UUID, list[Interview]] = {}
        for iv in all_ivs_3:
            thread_iv_map_3.setdefault(iv.thread_id, []).append(iv)

        lt_map_3 = {
            lt.thread_id: lt
            for lt in session.exec(
                select(LeadThread).where(LeadThread.thread_id.in_(candidate_thread_ids_3))
            ).all()
        }

        for thread_id in candidate_thread_ids_3:
            if thread_id in seen:
                continue

            lt = lt_map_3.get(thread_id)
            if lt:
                override = (lt.outcome_override or "").strip().lower()
                if override in _TERMINAL_OVERRIDES:
                    continue

            ivs = thread_iv_map_3.get(thread_id)
            if not ivs:
                continue

            latest = _latest_interview(ivs)

            if latest.status and latest.status.strip():
                continue  # latest interview has an explicit status → not null-derived

            if latest.interview_date:
                if latest.interview_date > today:
                    continue  # upcoming
                days_past = (today - latest.interview_date).days
                if days_past >= UNRESPONSIVE_TO_DEAD_DAYS:
                    continue  # would compute as Dead
                if days_past < UNRESPONSIVE_FOLLOWUP_DAYS:
                    continue
                days_unresponsive = days_past
            else:
                days_past = (today - latest.created_at.date()).days
                if days_past >= UNRESPONSIVE_TO_DEAD_DAYS:
                    continue
                if days_past < UNRESPONSIVE_FOLLOWUP_DAYS:
                    continue
                days_unresponsive = days_past

            lead_row = lt if lt is not None else LeadThread(thread_id=thread_id)
            result.append(UnresponsiveLeadInfo(
                thread_id=thread_id,
                lead_thread=lead_row,
                days_unresponsive=days_unresponsive,
            ))
            seen.add(thread_id)

    result.sort(key=lambda x: x.days_unresponsive, reverse=True)
    return result
