"""Unauthenticated, read-only stakeholder snapshot (interviews / leads / candidate performance).

Gated only by a shared-secret token in the URL (settings.PUBLIC_STATS_TOKEN) — there is no
session/user auth on this router by design, since it backs the /public/stats/<token> page shared
with the CEO / stakeholders. Never return anything here that isn't safe for anyone holding the
link to see: aggregate counts only, no candidate/company/BD names, emails, salaries, or documents.
"""

import hmac
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlmodel import Session, func, select

from app.config import get_settings
from app.database import get_session
from app.lead_thread_utils import effective_lead_fields, load_lead_map
from app.models.candidate import Candidate
from app.models.department import Department
from app.models.interview import Interview
from app.status_utils import computed_status_for_interview_display

router = APIRouter(prefix="/api/v1/public", tags=["Public Stats"])


def _require_valid_token(token: str) -> None:
    configured = get_settings().PUBLIC_STATS_TOKEN
    # 404 (not 403) so an invalid/guessed token can't distinguish "wrong token" from
    # "endpoint disabled" — nothing here confirms the feature even exists.
    if not configured or not hmac.compare_digest(token, configured):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/stats/{token}")
def get_public_stats(
    token: str,
    response: Response,
    session: Session = Depends(get_session),
):
    _require_valid_token(token)
    response.headers["Cache-Control"] = "no-store"

    departments = session.exec(select(Department)).all()
    dept_name_by_id = {d.id: d.name for d in departments}

    interviews = session.exec(select(Interview)).all()

    status_counts = {
        "Upcoming": 0,
        "Unresponsed": 0,
        "Progressed": 0,
        "Rejected": 0,
        "Dead": 0,
        "Closed": 0,
        "Dropped": 0,
    }
    dept_totals: dict[uuid.UUID, dict[str, int]] = {}

    for i in interviews:
        cs = computed_status_for_interview_display(i.status, i.interview_date, i.created_at)
        label = cs.lower()
        if label == "upcoming":
            status_counts["Upcoming"] += 1
        elif label == "unresponsed":
            status_counts["Unresponsed"] += 1
        elif "converted" in label or "progressed" in label:
            status_counts["Progressed"] += 1
        elif "rejected" in label:
            status_counts["Rejected"] += 1
        elif label == "dead":
            status_counts["Dead"] += 1
        elif "closed" in label:
            status_counts["Closed"] += 1
        elif "dropped" in label:
            status_counts["Dropped"] += 1

        bucket = dept_totals.setdefault(i.department_id, {"total": 0, "dropped": 0})
        bucket["total"] += 1
        if "dropped" in label:
            bucket["dropped"] += 1

    total_interviews = len(interviews)
    dropped_interviews = status_counts["Dropped"]
    legit_interviews = total_interviews - dropped_interviews

    by_department = [
        {
            "name": dept_name_by_id.get(dept_id, "Unassigned"),
            "legit": counts["total"] - counts["dropped"],
            "total": counts["total"],
        }
        for dept_id, counts in dept_totals.items()
    ]
    by_department.sort(key=lambda d: d["total"], reverse=True)

    # ---- Leads (thread-level: one lead = one candidate-company pipeline) ----
    by_thread: dict[uuid.UUID, list[Interview]] = {}
    for i in interviews:
        if i.thread_id:
            by_thread.setdefault(i.thread_id, []).append(i)
    lead_map = load_lead_map(session, set(by_thread.keys()))

    leads_status_counts = {
        "active": 0,
        "in_pipeline": 0,
        "unresponsive": 0,
        "dropped": 0,
        "dead": 0,
        "rejected": 0,
        "closed": 0,
    }
    success_leads = 0
    failure_leads = 0
    dropped_leads = 0

    for thread_id, rows in by_thread.items():
        eff = effective_lead_fields(session, thread_id, lead_map.get(thread_id), rows=rows)
        outcome = (eff.get("lead_outcome") or "active").lower()
        if outcome in leads_status_counts:
            leads_status_counts[outcome] += 1
        if outcome == "dropped":
            dropped_leads += 1
        if eff.get("is_converted") or outcome == "closed":
            success_leads += 1
        elif outcome in ("rejected", "dead"):
            failure_leads += 1

    total_leads = len(by_thread)
    legit_leads = total_leads - dropped_leads
    conv_den = success_leads + failure_leads
    conversion_rate_percent = round((success_leads / conv_den) * 100) if conv_den else 0

    # ---- Candidate performance (aggregate only — no names) ----
    active_candidates = session.exec(
        select(func.count()).select_from(Candidate).where(Candidate.is_active == True)  # noqa: E712
    ).one()

    legit_den = legit_leads or 1
    closing_rate_percent = round((leads_status_counts["closed"] / legit_den) * 100)
    rejection_rate_percent = round((leads_status_counts["rejected"] / legit_den) * 100)
    unresponsive_rate_percent = round((leads_status_counts["unresponsive"] / legit_den) * 100)

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "interviews": {
            "legit": legit_interviews,
            "total": total_interviews,
            "dropped": dropped_interviews,
            "by_status": status_counts,
            "by_department": by_department,
        },
        "leads": {
            "legit": legit_leads,
            "total": total_leads,
            "dropped": dropped_leads,
            "conversion_rate_percent": conversion_rate_percent,
            "by_status": leads_status_counts,
        },
        "candidates": {
            "active_count": active_candidates,
            "closing_rate_percent": closing_rate_percent,
            "rejection_rate_percent": rejection_rate_percent,
            "unresponsive_rate_percent": unresponsive_rate_percent,
        },
    }
