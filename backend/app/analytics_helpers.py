"""Analytics helper queries for the SUPERADMIN chat analyst persona."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime
from typing import Optional

from sqlmodel import Session, select

from app.models.business_developer import BusinessDeveloper
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.lead_thread import LeadThread

ROUND_ORDER = ["Lead", "Phone Screen", "Technical", "Onsite", "Final Round", "Offer"]
ROUND_RANK = {r: i for i, r in enumerate(ROUND_ORDER)}
_TERMINAL_OUTCOMES = {"closed", "dead", "rejected", "dropped"}


def _outcome_of(lt: Optional[LeadThread]) -> str:
    if not lt:
        return "active"
    v = (lt.outcome_override or "").strip().lower()
    return v if v else "active"


def get_pipeline_funnel(session: Session) -> dict:
    """Funnel: threads that reached each stage, conversion rates, outcome breakdown."""
    all_interviews = session.exec(select(Interview)).all()

    thread_rounds: dict[uuid.UUID, list[str]] = defaultdict(list)
    for iv in all_interviews:
        thread_rounds[iv.thread_id].append(iv.round)

    # Highest stage each thread reached
    thread_max_rank: dict[uuid.UUID, int] = {}
    for tid, rounds in thread_rounds.items():
        thread_max_rank[tid] = max((ROUND_RANK.get(r, 0) for r in rounds), default=0)

    # Count threads that reached at least each stage
    stage_counts = {r: 0 for r in ROUND_ORDER}
    for rank in thread_max_rank.values():
        for stage in ROUND_ORDER:
            if ROUND_RANK[stage] <= rank:
                stage_counts[stage] += 1

    funnel = []
    for i, stage in enumerate(ROUND_ORDER):
        count = stage_counts[stage]
        prev = stage_counts[ROUND_ORDER[i - 1]] if i > 0 else count
        funnel.append({
            "stage": stage,
            "threads_reached": count,
            "conversion_from_prev_percent": round(count / prev * 100, 1) if prev > 0 and i > 0 else None,
        })

    outcome_counts: dict[str, int] = defaultdict(int)
    for tid in thread_max_rank:
        lt = session.get(LeadThread, tid)
        outcome_counts[_outcome_of(lt)] += 1

    total = len(thread_max_rank)
    closed = outcome_counts.get("closed", 0)
    return {
        "total_threads": total,
        "overall_close_rate_percent": round(closed / total * 100, 1) if total else 0.0,
        "funnel": funnel,
        "outcome_breakdown": dict(outcome_counts),
    }


def get_candidate_performance(session: Session, candidate_id: Optional[str] = None) -> list[dict]:
    """Per-candidate pipeline metrics: leads, close rate, where they stall."""
    stmt = select(Interview)
    if candidate_id:
        try:
            stmt = stmt.where(Interview.candidate_id == uuid.UUID(candidate_id))
        except ValueError:
            return [{"error": "Invalid candidate_id UUID"}]

    all_interviews = session.exec(stmt).all()

    # candidate_id → thread_id → [Interview]
    by_cand: dict[uuid.UUID, dict[uuid.UUID, list[Interview]]] = defaultdict(lambda: defaultdict(list))
    for iv in all_interviews:
        if iv.candidate_id:
            by_cand[iv.candidate_id][iv.thread_id].append(iv)

    cand_names: dict[uuid.UUID, str] = {}
    for cid in by_cand:
        c = session.get(Candidate, cid)
        if c:
            cand_names[cid] = c.name

    results = []
    for cid, threads in by_cand.items():
        total_leads = len(threads)
        closed = dead = active = 0
        elimination: dict[str, int] = defaultdict(int)
        stuck: dict[str, int] = defaultdict(int)

        for tid, ivs in threads.items():
            lt = session.get(LeadThread, tid)
            outcome = _outcome_of(lt)
            latest = max(ivs, key=lambda x: x.created_at)

            if outcome == "closed":
                closed += 1
            elif outcome in {"dead", "rejected", "dropped"}:
                dead += 1
                elimination[latest.round] += 1
            else:
                active += 1
                stuck[latest.round] += 1

        results.append({
            "candidate_name": cand_names.get(cid, "Unknown"),
            "candidate_id": str(cid),
            "total_leads": total_leads,
            "closed_won": closed,
            "close_rate_percent": round(closed / total_leads * 100, 1) if total_leads else 0.0,
            "dead_or_rejected": dead,
            "active_leads": active,
            "top_elimination_round": max(elimination, key=elimination.get) if elimination else None,
            "elimination_by_round": dict(elimination),
            "active_leads_by_round": dict(stuck),
        })

    results.sort(key=lambda x: x["total_leads"], reverse=True)
    return results


def get_round_status_snapshot(session: Session) -> dict:
    """Active lead count per round stage, with stale (>7 days) flag."""
    all_interviews = session.exec(select(Interview)).all()

    thread_ivs: dict[uuid.UUID, list[Interview]] = defaultdict(list)
    for iv in all_interviews:
        thread_ivs[iv.thread_id].append(iv)

    active_per_round: dict[str, int] = defaultdict(int)
    stale_per_round: dict[str, int] = defaultdict(int)
    today = date.today()

    for tid, ivs in thread_ivs.items():
        lt = session.get(LeadThread, tid)
        if _outcome_of(lt) in _TERMINAL_OUTCOMES:
            continue
        latest = max(ivs, key=lambda x: x.created_at)
        active_per_round[latest.round] += 1
        if (today - latest.created_at.date()).days > 7:
            stale_per_round[latest.round] += 1

    by_round = []
    for stage in ROUND_ORDER:
        if active_per_round.get(stage, 0) > 0:
            by_round.append({
                "round": stage,
                "active_leads": active_per_round[stage],
                "stale_no_update_7d": stale_per_round.get(stage, 0),
            })
    for rnd, cnt in active_per_round.items():
        if rnd not in ROUND_RANK and cnt > 0:
            by_round.append({
                "round": rnd,
                "active_leads": cnt,
                "stale_no_update_7d": stale_per_round.get(rnd, 0),
            })

    return {
        "total_active_leads": sum(active_per_round.values()),
        "by_round": by_round,
    }


def get_lead_outcome_stats(
    session: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    bd_id: Optional[str] = None,
) -> dict:
    """Outcome distribution with optional date/BD filters and monthly trend."""
    stmt = select(Interview).where(Interview.round == "Lead")

    if bd_id:
        try:
            stmt = stmt.where(Interview.bd_id == uuid.UUID(bd_id))
        except ValueError:
            pass
    if date_from:
        try:
            stmt = stmt.where(Interview.created_at >= datetime.fromisoformat(date_from))
        except ValueError:
            pass
    if date_to:
        try:
            stmt = stmt.where(Interview.created_at <= datetime.fromisoformat(date_to))
        except ValueError:
            pass

    leads = session.exec(stmt).all()
    outcome_counts: dict[str, int] = defaultdict(int)
    monthly: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for iv in leads:
        lt = session.get(LeadThread, iv.thread_id)
        outcome = _outcome_of(lt)
        outcome_counts[outcome] += 1
        monthly[iv.created_at.strftime("%Y-%m")][outcome] += 1

    total = len(leads)
    closed = outcome_counts.get("closed", 0)
    return {
        "total_leads": total,
        "close_rate_percent": round(closed / total * 100, 1) if total else 0.0,
        "outcome_breakdown": dict(outcome_counts),
        "monthly_trend": {k: dict(v) for k, v in sorted(monthly.items())},
    }


def get_bd_performance(session: Session) -> list[dict]:
    """Per-BD metrics: leads assigned, close rate, dead rate, active pipeline."""
    all_bds = session.exec(select(BusinessDeveloper)).all()
    bd_names = {bd.id: bd.name for bd in all_bds}

    leads = session.exec(select(Interview).where(Interview.round == "Lead")).all()

    stats: dict[uuid.UUID, dict] = {}
    for iv in leads:
        if not iv.bd_id:
            continue
        if iv.bd_id not in stats:
            stats[iv.bd_id] = {k: 0 for k in ("total", "closed", "dead", "rejected", "dropped", "unresponsive", "active")}
        s = stats[iv.bd_id]
        s["total"] += 1
        outcome = _outcome_of(session.get(LeadThread, iv.thread_id))
        s[outcome] = s.get(outcome, 0) + 1

    results = []
    for bd_id, s in stats.items():
        total = s["total"]
        closed = s.get("closed", 0)
        dead_total = s.get("dead", 0) + s.get("rejected", 0) + s.get("dropped", 0)
        results.append({
            "bd_name": bd_names.get(bd_id, "Unknown"),
            "bd_id": str(bd_id),
            "total_leads": total,
            "closed_won": closed,
            "close_rate_percent": round(closed / total * 100, 1) if total else 0.0,
            "dead_rate_percent": round(dead_total / total * 100, 1) if total else 0.0,
            "active_pipeline": s.get("active", 0) + s.get("unresponsive", 0),
            "outcome_breakdown": {k: v for k, v in s.items() if k != "total"},
        })

    results.sort(key=lambda x: x["total_leads"], reverse=True)
    return results


def get_weekly_interview_summary(
    session: Session,
    date_from: date,
    date_to: date,
) -> dict:
    """Weekly summary of leads and interview rounds grouped by candidate.

    Returns one entry per candidate containing all lead threads that had any
    activity (created_at) in [date_from, date_to], plus overall outcome counts.
    """
    from datetime import datetime as _dt

    date_from_dt = _dt.combine(date_from, _dt.min.time())
    date_to_dt = _dt.combine(date_to, _dt.max.time())

    stmt = (
        select(Interview)
        .where(Interview.created_at >= date_from_dt)
        .where(Interview.created_at <= date_to_dt)
        .order_by(Interview.created_at)
    )
    all_interviews = session.exec(stmt).all()

    # Group by thread_id → collect all rounds
    thread_rounds: dict[uuid.UUID, list[Interview]] = defaultdict(list)
    for iv in all_interviews:
        thread_rounds[iv.thread_id].append(iv)

    # Resolve outcome label for a thread
    def _outcome_label(tid: uuid.UUID) -> str:
        lt = session.get(LeadThread, tid)
        o = _outcome_of(lt)
        if o == "closed":
            return "Converted"
        if o in {"rejected", "dead", "dropped"}:
            return "Rejected"
        if o == "unresponsive":
            return "Unresponsive"
        return "Active"

    # Group by candidate
    cand_threads: dict[uuid.UUID | None, list[uuid.UUID]] = defaultdict(list)
    for tid, ivs in thread_rounds.items():
        # Use the candidate_id from the Lead row if available, else first round
        lead_row = next((iv for iv in ivs if iv.round == "Lead"), ivs[0])
        cand_threads[lead_row.candidate_id].append(tid)

    # Resolve candidate names
    cand_names: dict[uuid.UUID | None, str] = {}
    for cid in cand_threads:
        if cid:
            c = session.get(Candidate, cid)
            cand_names[cid] = c.name if c else "Unknown"
        else:
            cand_names[None] = "Unassigned"

    # Build per-candidate rows
    by_candidate = []
    outcome_totals: dict[str, int] = defaultdict(int)
    total_leads = 0
    total_rounds = 0

    for cid, tids in cand_threads.items():
        candidate_entry: dict = {
            "candidate": cand_names.get(cid, "Unknown"),
            "leads": len(tids),
            "interviews": [],
        }
        for tid in tids:
            ivs = thread_rounds[tid]
            outcome = _outcome_label(tid)
            outcome_totals[outcome] += 1
            total_leads += 1

            lead_iv = next((iv for iv in ivs if iv.round == "Lead"), ivs[0])
            company = session.get(Company, lead_iv.company_id)
            company_name = company.name if company else "Unknown"

            # Collect non-Lead rounds (actual interview rounds)
            interview_rounds = [iv for iv in ivs if iv.round != "Lead"]
            total_rounds += len(interview_rounds)

            if interview_rounds:
                for iv in interview_rounds:
                    candidate_entry["interviews"].append({
                        "company": company_name,
                        "role": iv.role,
                        "round": iv.round,
                        "date": str(iv.interview_date) if iv.interview_date else None,
                        "status": iv.status,
                        "outcome": outcome,
                    })
            else:
                # Lead only — no interview round yet
                candidate_entry["interviews"].append({
                    "company": company_name,
                    "role": lead_iv.role,
                    "round": "Lead",
                    "date": str(lead_iv.interview_date) if lead_iv.interview_date else None,
                    "status": lead_iv.status,
                    "outcome": outcome,
                })

        by_candidate.append(candidate_entry)

    # Sort by candidate name
    by_candidate.sort(key=lambda x: x["candidate"])

    return {
        "period": f"{date_from.isoformat()} to {date_to.isoformat()}",
        "total_leads": total_leads,
        "total_interview_rounds": total_rounds,
        "by_candidate": by_candidate,
        "outcome_summary": {
            "converted": outcome_totals.get("Converted", 0),
            "rejected": outcome_totals.get("Rejected", 0),
            "unresponsive": outcome_totals.get("Unresponsive", 0),
            "active": outcome_totals.get("Active", 0),
        },
    }


def get_interview_notes(
    session: Session,
    candidate_id: Optional[str] = None,
    company_id: Optional[str] = None,
    round_filter: Optional[str] = None,
    limit: int = 50,
) -> list[dict]:
    """Collect notes + feedback entries for pattern analysis."""
    stmt = select(Interview)
    if candidate_id:
        try:
            stmt = stmt.where(Interview.candidate_id == uuid.UUID(candidate_id))
        except ValueError:
            pass
    if company_id:
        try:
            stmt = stmt.where(Interview.company_id == uuid.UUID(company_id))
        except ValueError:
            pass
    if round_filter:
        stmt = stmt.where(Interview.round.ilike(f"%{round_filter}%"))

    interviews = session.exec(stmt.order_by(Interview.created_at.desc()).limit(limit)).all()

    results = []
    for iv in interviews:
        company = session.get(Company, iv.company_id)
        candidate = session.get(Candidate, iv.candidate_id) if iv.candidate_id else None
        lt = session.get(LeadThread, iv.thread_id)

        entry: dict = {
            "company": company.name if company else "Unknown",
            "candidate": candidate.name if candidate else "Unknown",
            "round": iv.round,
            "status": iv.status,
            "outcome": _outcome_of(lt),
            "date": str(iv.interview_date) if iv.interview_date else None,
        }
        if iv.feedback:
            entry["feedback"] = iv.feedback
        if iv.recruiter_feedback:
            entry["recruiter_feedback"] = iv.recruiter_feedback
        if lt and lt.notes:
            entry["thread_notes"] = lt.notes
        if lt and lt.bd_notes:
            entry["bd_notes"] = lt.bd_notes

        if len(entry) > 5:  # has at least one notes field beyond the base keys
            results.append(entry)

    return results
