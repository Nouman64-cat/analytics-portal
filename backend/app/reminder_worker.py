from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlmodel import Session, select, or_, and_

from app.activity_log import record_activity
from app.config import Settings
from app.database import engine
from app.email_ses import try_send_interview_reminder_email, make_presigned_doc_url
from app.models.business_developer import BusinessDeveloper
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.resume_profile import ResumeProfile
from app.models.interview_reminder_log import InterviewReminderLog
from app.models.lead_thread import LeadThread
from app.models.unresponsive_followup_log import UnresponsiveFollowUpLog
from app.models.user import User, UserRole
from app.lead_thread_utils import effective_lead_fields, is_lead_terminal_outcome, load_lead_map
from app.status_utils import compute_status
from app.unresponsive_utils import (
    UNRESPONSIVE_FOLLOWUP_DAYS,
    UNRESPONSIVE_TO_DEAD_DAYS,
    find_unresponsive_leads_needing_followup,
)

logger = logging.getLogger(__name__)


def _escalate_explicit_unresponsive_leads() -> None:
    """Lead explicitly set to Unresponsive → Dead after 30 days with no change.

    Uses unresponsive_since when available; falls back to updated_at for rows
    that were set to unresponsive via a path that didn't stamp the field (e.g.
    the chat router before the fix).
    """
    cutoff = datetime.utcnow() - timedelta(days=UNRESPONSIVE_TO_DEAD_DAYS)
    with Session(engine) as session:
        rows = session.exec(
            select(LeadThread).where(
                LeadThread.outcome_override == "unresponsive",
                or_(
                    and_(
                        LeadThread.unresponsive_since.isnot(None),
                        LeadThread.unresponsive_since <= cutoff,
                    ),
                    and_(
                        LeadThread.unresponsive_since.is_(None),
                        LeadThread.updated_at <= cutoff,
                    ),
                ),
            )
        ).all()
        for row in rows:
            row.outcome_override = "dead"
            row.unresponsive_since = None
            row.closed_at = datetime.utcnow()
            row.updated_at = datetime.utcnow()
            session.add(row)
            record_activity(
                session,
                actor=None,
                action="lead_unresponsive_escalated_dead",
                entity_type="lead_thread",
                entity_id=row.thread_id,
                message="Lead was Unresponsive for 30+ days; marked Dead automatically.",
            )
        if rows:
            session.commit()
            logger.info(
                "Escalated %s lead(s) from explicit Unresponsive to Dead (30+ days)",
                len(rows),
            )


def _pkt_to_utc(interview: Interview) -> datetime | None:
    if not interview.interview_date or not interview.time_pkt:
        return None
    pkt_dt = datetime.combine(interview.interview_date, interview.time_pkt)
    # PKT is UTC+5
    return pkt_dt - timedelta(hours=5)


def _process_due_reminders(settings: Settings) -> None:
    now_utc = datetime.utcnow().replace(second=0, microsecond=0)
    # Wider lookback prevents missing reminders during brief restarts/delays.
    lookback = now_utc - timedelta(minutes=90)

    with Session(engine) as session:
        interviews = session.exec(
            select(Interview).where(
                Interview.interview_date.is_not(None),
                Interview.time_pkt.is_not(None),
            )
        ).all()

        lead_map = load_lead_map(session, {i.thread_id for i in interviews if i.thread_id})

        # Pre-load all thread rows in bulk to avoid N+1 queries in effective_lead_fields
        all_thread_ids = {i.thread_id for i in interviews if i.thread_id}
        all_thread_rows: dict = {}
        if all_thread_ids:
            for iv in session.exec(select(Interview).where(Interview.thread_id.in_(all_thread_ids))).all():
                all_thread_rows.setdefault(iv.thread_id, []).append(iv)

        # Pre-load all candidates, companies, BDs, and profiles referenced by these interviews
        candidate_ids = {i.candidate_id for i in interviews if i.candidate_id}
        company_ids = {i.company_id for i in interviews if i.company_id}
        bd_ids = {i.bd_id for i in interviews if i.bd_id}
        profile_ids = {i.resume_profile_id for i in interviews if i.resume_profile_id}
        candidate_map: dict = {}
        company_map: dict = {}
        bd_map: dict = {}
        profile_map: dict = {}
        if candidate_ids:
            for c in session.exec(select(Candidate).where(Candidate.id.in_(candidate_ids))).all():
                candidate_map[c.id] = c
        if company_ids:
            for c in session.exec(select(Company).where(Company.id.in_(company_ids))).all():
                company_map[c.id] = c
        if bd_ids:
            for b in session.exec(select(BusinessDeveloper).where(BusinessDeveloper.id.in_(bd_ids))).all():
                bd_map[b.id] = b
        if profile_ids:
            for p in session.exec(select(ResumeProfile).where(ResumeProfile.id.in_(profile_ids))).all():
                profile_map[p.id] = p

        for interview in interviews:
            lt = lead_map.get(interview.thread_id)
            eff = effective_lead_fields(session, interview.thread_id, lt, rows=all_thread_rows.get(interview.thread_id))
            if is_lead_terminal_outcome(eff["lead_outcome"]):
                continue

            if interview.candidate_id is None:
                continue

            status = compute_status(interview.status, interview.interview_date, interview.created_at).lower()
            # Skip clearly resolved/non-reminder statuses only.
            if any(x in status for x in ("converted", "rejected", "dropped", "closed", "dead")):
                continue

            interview_at_utc = _pkt_to_utc(interview)
            if not interview_at_utc:
                continue

            candidate = candidate_map.get(interview.candidate_id)
            company = company_map.get(interview.company_id)
            if not candidate:
                continue

            for reminder_type, minutes in (("t_minus_60", 60), ("t_minus_30", 30)):
                scheduled_for_utc = interview_at_utc - timedelta(minutes=minutes)
                if not (lookback <= scheduled_for_utc <= now_utc):
                    continue

                existing = session.exec(
                    select(InterviewReminderLog).where(
                        InterviewReminderLog.interview_id == interview.id,
                        InterviewReminderLog.reminder_type == reminder_type,
                        InterviewReminderLog.scheduled_for_utc == scheduled_for_utc,
                    )
                ).first()
                if existing:
                    continue

                bd = bd_map.get(interview.bd_id) if interview.bd_id else None
                profile = profile_map.get(interview.resume_profile_id) if interview.resume_profile_id else None
                sent = try_send_interview_reminder_email(
                    settings,
                    to_email=candidate.email,
                    candidate_name=candidate.name,
                    company_name=company.name if company else "",
                    role=interview.role,
                    round_name=interview.round,
                    interview_date=interview.interview_date,
                    time_est=interview.time_est,
                    time_pkt=interview.time_pkt,
                    interviewer=interview.interviewer,
                    interview_link=interview.interview_link,
                    is_phone_call=interview.is_phone_call,
                    reminder_minutes=minutes,
                    salary_range=interview.salary_range or None,
                    interview_doc_url=make_presigned_doc_url(settings, interview.interview_doc_url),
                    bd_name=bd.name if bd else None,
                    resume_profile_name=profile.name if profile else None,
                )
                if sent:
                    logger.info(
                        "Interview reminder sent: interview_id=%s type=%s scheduled_for_utc=%s now_utc=%s",
                        interview.id,
                        reminder_type,
                        scheduled_for_utc.isoformat(),
                        now_utc.isoformat(),
                    )
                    session.add(
                        InterviewReminderLog(
                            interview_id=interview.id,
                            reminder_type=reminder_type,
                            scheduled_for_utc=scheduled_for_utc,
                        )
                    )
                else:
                    logger.warning(
                        "Interview reminder skipped/failed send: interview_id=%s type=%s candidate_email=%s",
                        interview.id,
                        reminder_type,
                        candidate.email if candidate else None,
                    )

        session.commit()


def _notify_unresponsive_followup(settings: Settings) -> None:
    """Mark leads that have been Unresponsive for 15+ days in the follow-up log
    so they appear as in-app notifications. No emails are sent.
    """
    with Session(engine) as session:
        qualifying_leads = find_unresponsive_leads_needing_followup(session)
        if not qualifying_leads:
            return

        # Skip leads already logged
        all_thread_ids = [info.thread_id for info in qualifying_leads]
        already_notified = {
            log.thread_id
            for log in session.exec(
                select(UnresponsiveFollowUpLog).where(
                    UnresponsiveFollowUpLog.thread_id.in_(all_thread_ids)
                )
            ).all()
        }
        qualifying = [info for info in qualifying_leads if info.thread_id not in already_notified]
        if not qualifying:
            return

        for info in qualifying:
            session.add(UnresponsiveFollowUpLog(thread_id=info.thread_id))
            logger.info(
                "Unresponsive follow-up logged for in-app notification: thread_id=%s days=%s",
                info.thread_id,
                info.days_unresponsive,
            )

        session.commit()
        logger.info("Logged in-app unresponsive notifications for %s lead(s)", len(qualifying))


async def run_reminder_worker(stop_event: asyncio.Event, settings: Settings) -> None:
    """Background loop that sends due interview reminders every minute."""
    while not stop_event.is_set():
        try:
            _escalate_explicit_unresponsive_leads()
        except Exception:
            logger.exception("Unresponsive lead escalation failed")
        try:
            _notify_unresponsive_followup(settings)
        except Exception:
            logger.exception("Unresponsive follow-up notification failed")
        try:
            _process_due_reminders(settings)
        except Exception:
            logger.exception("Interview reminder worker failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue

