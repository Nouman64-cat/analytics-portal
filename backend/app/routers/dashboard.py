from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.orm import joinedload
from app.deps import get_current_user
from sqlmodel import Session, select, func
from app.database import get_session
from app.models.interview import Interview
from app.models.company import Company
from app.models.candidate import Candidate
from app.models.user import User, UserRole
from app.status_utils import compute_status
from app.team_member_scope import candidate_id_for_team_member

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"], dependencies=[Depends(get_current_user)])


def _empty_team_member_dashboard():
    return {
        "total_interviews": 0,
        "total_companies": 0,
        "total_candidates": 0,
        "total_jobs_closed": 0,
        "interviews_by_status": {},
        "interviews_by_company": {},
        "interviews_by_candidate": {},
        "leads_frequency_weekly": {},
        "leads_frequency_monthly": {},
        "candidate_metrics": {},
        "recent_interviews": [],
    }


@router.get("/stats")
def get_dashboard_stats(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Get summary statistics for the dashboard. Team members only see their own interviews."""
    scope_candidate_id = None
    if current_user.role == UserRole.TEAM_MEMBER:
        scope_candidate_id = candidate_id_for_team_member(session, current_user)
        if scope_candidate_id is None:
            return _empty_team_member_dashboard()

    def iv_where(stmt):
        if scope_candidate_id:
            return stmt.where(Interview.candidate_id == scope_candidate_id)
        return stmt

    # Total interviews
    total_interviews = session.exec(
        iv_where(select(func.count(Interview.id)))
    ).one()

    # Total unique companies (from interviews in scope)
    if scope_candidate_id:
        total_companies = session.exec(
            select(func.count(func.distinct(Interview.company_id))).where(
                Interview.candidate_id == scope_candidate_id
            )
        ).one()
        total_candidates = 1
    else:
        total_companies = session.exec(select(func.count(Company.id))).one()
        total_candidates = session.exec(select(func.count(Candidate.id))).one()

    # Interviews by status with exact date intelligence
    all_status_query = iv_where(select(Interview.status, Interview.interview_date))
    all_statuses = session.exec(all_status_query).all()

    interviews_by_status_raw = {}
    for status, int_date in all_statuses:
        label = compute_status(status, int_date)
        interviews_by_status_raw[label] = interviews_by_status_raw.get(label, 0) + 1

    interviews_by_status = interviews_by_status_raw
    total_jobs_closed = interviews_by_status.get("Closed", 0)

    # Lead frequency (weekly / monthly) using interview date
    lead_dates = session.exec(iv_where(select(Interview.interview_date))).all()
    leads_frequency_weekly: dict[str, int] = {}
    leads_frequency_monthly: dict[str, int] = {}
    for d in lead_dates:
        if not d or not isinstance(d, date):
            continue
        iso_year, iso_week, _ = d.isocalendar()
        weekly_key = f"{iso_year}-W{iso_week:02d}"
        monthly_key = d.strftime("%Y-%m")
        leads_frequency_weekly[weekly_key] = leads_frequency_weekly.get(weekly_key, 0) + 1
        leads_frequency_monthly[monthly_key] = leads_frequency_monthly.get(monthly_key, 0) + 1

    # Interviews by company
    company_query = (
        select(Company.name, func.count(Interview.id))
        .join(Interview, Interview.company_id == Company.id)
        .group_by(Company.name)
        .order_by(func.count(Interview.id).desc())
    )
    if scope_candidate_id:
        company_query = company_query.where(Interview.candidate_id == scope_candidate_id)
    company_results = session.exec(company_query).all()
    interviews_by_company = {name: count for name, count in company_results}

    # Interviews by candidate
    candidate_query = (
        select(Candidate.name, func.count(Interview.id))
        .join(Interview, Interview.candidate_id == Candidate.id)
        .group_by(Candidate.name)
        .order_by(func.count(Interview.id).desc())
    )
    if scope_candidate_id:
        candidate_query = candidate_query.where(Interview.candidate_id == scope_candidate_id)
    candidate_results = session.exec(candidate_query).all()
    interviews_by_candidate = {name: count for name, count in candidate_results}

    # Candidates detailed metrics
    candidate_interviews_query = (
        select(Candidate.name, Interview.status)
        .join(Interview, Interview.candidate_id == Candidate.id)
    )
    if scope_candidate_id:
        candidate_interviews_query = candidate_interviews_query.where(
            Interview.candidate_id == scope_candidate_id
        )
    candidate_interviews = session.exec(candidate_interviews_query).all()

    candidate_metrics = {}
    for name, status in candidate_interviews:
        if name not in candidate_metrics:
            candidate_metrics[name] = {"total_resolved": 0, "converted": 0, "total": 0}

        candidate_metrics[name]["total"] += 1

        status_lower = (status or "").lower()
        if "converted" in status_lower or "closed" in status_lower:
            candidate_metrics[name]["converted"] += 1
            candidate_metrics[name]["total_resolved"] += 1
        elif "rejected" in status_lower or "dropped" in status_lower:
            candidate_metrics[name]["total_resolved"] += 1

    for name, stats in candidate_metrics.items():
        rate = (
            round((stats["converted"] / stats["total_resolved"]) * 100)
            if stats["total_resolved"] > 0
            else 0
        )
        stats["rate"] = rate

    # Recent interviews (last 7)
    recent_query = select(Interview).options(
        joinedload(Interview.company),
        joinedload(Interview.candidate),
        joinedload(Interview.resume_profile),
        joinedload(Interview.business_developer),
    )
    recent_query = iv_where(recent_query).order_by(Interview.interview_date.desc())  # type: ignore
    recent_query = recent_query.limit(7)
    recent_interviews = session.exec(recent_query).all()
    recent = [
        {
            "id": str(i.id),
            "company": i.company.name if i.company else None,
            "company_id": str(i.company_id) if i.company_id else None,
            "company_detail": i.company.detail if i.company else None,
            "candidate": i.candidate.name if i.candidate else None,
            "resume_profile_name": i.resume_profile.name if i.resume_profile else None,
            "resume_profile_id": str(i.resume_profile_id) if i.resume_profile_id else None,
            "linkedin_url": i.resume_profile.linkedin_url if i.resume_profile else None,
            "github_url": i.resume_profile.github_url if i.resume_profile else None,
            "portfolio_url": i.resume_profile.portfolio_url if i.resume_profile else None,
            "resume_url": i.resume_profile.resume_url if i.resume_profile else None,
            "role": i.role,
            "round": i.round,
            "date": str(i.interview_date) if i.interview_date else None,
            "status": i.status,
            "computed_status": compute_status(i.status, i.interview_date),
            "time_est": i.time_est.strftime("%H:%M") if i.time_est else None,
            "time_pkt": i.time_pkt.strftime("%H:%M") if i.time_pkt else None,
            "bd_name": i.business_developer.name if i.business_developer else None,
        }
        for i in recent_interviews
    ]

    return {
        "total_interviews": total_interviews,
        "total_companies": total_companies,
        "total_candidates": total_candidates,
        "total_jobs_closed": total_jobs_closed,
        "interviews_by_status": interviews_by_status,
        "interviews_by_company": interviews_by_company,
        "interviews_by_candidate": interviews_by_candidate,
        "leads_frequency_weekly": leads_frequency_weekly,
        "leads_frequency_monthly": leads_frequency_monthly,
        "candidate_metrics": candidate_metrics,
        "recent_interviews": recent,
    }
