from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.activity_log import record_activity
from app.config import Settings
from app.database import engine
from app.email_ses import try_send_interview_reminder_email
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.interview_reminder_log import InterviewReminderLog
from app.models.lead_thread import LeadThread
from app.lead_thread_utils import effective_lead_fields, is_lead_terminal_outcome, load_lead_map
from app.status_utils import compute_status

logger = logging.getLogger(__name__)

UNRESPONSIVE_TO_DEAD_DAYS = 30


def _escalate_explicit_unresponsive_leads() -> None:
    """Lead explicitly set to Unresponsive → Dead after 30 days with no change."""
    cutoff = datetime.utcnow() - timedelta(days=UNRESPONSIVE_TO_DEAD_DAYS)
    with Session(engine) as session:
        rows = session.exec(
            select(LeadThread).where(
                LeadThread.outcome_override == "unresponsive",
                LeadThread.unresponsive_since.isnot(None),
                LeadThread.unresponsive_since <= cutoff,
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

        for interview in interviews:
            lt = lead_map.get(interview.thread_id)
            eff = effective_lead_fields(session, interview.thread_id, lt)
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

            candidate = session.get(Candidate, interview.candidate_id)
            company = session.get(Company, interview.company_id)
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


async def run_reminder_worker(stop_event: asyncio.Event, settings: Settings) -> None:
    """Background loop that sends due interview reminders every minute."""
    while not stop_event.is_set():
        try:
            _escalate_explicit_unresponsive_leads()
        except Exception:
            logger.exception("Unresponsive lead escalation failed")
        try:
            _process_due_reminders(settings)
        except Exception:
            logger.exception("Interview reminder worker failed")

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue

