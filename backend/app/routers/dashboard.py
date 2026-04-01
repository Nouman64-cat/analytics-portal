from fastapi import APIRouter, Depends
from app.deps import get_current_user
from sqlmodel import Session, select, func, col
from app.database import get_session
from app.models.interview import Interview
from app.models.company import Company
from app.models.candidate import Candidate
from app.status_utils import compute_status

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"], dependencies=[Depends(get_current_user)])


@router.get("/stats")
def get_dashboard_stats(session: Session = Depends(get_session)):
    """Get summary statistics for the dashboard."""

    # Total interviews
    total_interviews = session.exec(select(func.count(Interview.id))).one()

    # Total unique companies
    total_companies = session.exec(select(func.count(Company.id))).one()

    # Total candidates
    total_candidates = session.exec(select(func.count(Candidate.id))).one()

    # Interviews by status with exact date intelligence
    all_status_query = select(Interview.status, Interview.interview_date)
    all_statuses = session.exec(all_status_query).all()
    
    interviews_by_status_raw = {}
    for status, int_date in all_statuses:
        label = compute_status(status, int_date)
        interviews_by_status_raw[label] = interviews_by_status_raw.get(label, 0) + 1

    interviews_by_status = interviews_by_status_raw

    # Interviews by company
    company_query = (
        select(Company.name, func.count(Interview.id))
        .join(Interview, Interview.company_id == Company.id)
        .group_by(Company.name)
        .order_by(func.count(Interview.id).desc())
    )
    company_results = session.exec(company_query).all()
    interviews_by_company = {name: count for name, count in company_results}

    # Interviews by candidate
    candidate_query = (
        select(Candidate.name, func.count(Interview.id))
        .join(Interview, Interview.candidate_id == Candidate.id)
        .group_by(Candidate.name)
        .order_by(func.count(Interview.id).desc())
    )
    candidate_results = session.exec(candidate_query).all()
    interviews_by_candidate = {name: count for name, count in candidate_results}

    # Candidates detailed metrics
    candidate_interviews_query = (
        select(Candidate.name, Interview.status)
        .join(Interview, Interview.candidate_id == Candidate.id)
    )
    candidate_interviews = session.exec(candidate_interviews_query).all()
    
    candidate_metrics = {}
    for name, status in candidate_interviews:
        if name not in candidate_metrics:
            candidate_metrics[name] = {"total_resolved": 0, "converted": 0, "total": 0}
        
        candidate_metrics[name]["total"] += 1
        
        status_lower = (status or "").lower()
        if "converted" in status_lower:
            candidate_metrics[name]["converted"] += 1
            candidate_metrics[name]["total_resolved"] += 1
        elif "rejected" in status_lower or "dropped" in status_lower or "closed" in status_lower:
            candidate_metrics[name]["total_resolved"] += 1

    for name, stats in candidate_metrics.items():
        # Exclude Unresponsed from the conversion rate calculation
        rate = round((stats["converted"] / stats["total_resolved"]) * 100) if stats["total_resolved"] > 0 else 0
        stats["rate"] = rate

    # Recent interviews (last 7)
    recent_query = (
        select(Interview)
        .order_by(Interview.interview_date.desc())  # type: ignore
        .limit(7)
    )
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
        "interviews_by_status": interviews_by_status,
        "interviews_by_company": interviews_by_company,
        "interviews_by_candidate": interviews_by_candidate,
        "candidate_metrics": candidate_metrics,
        "recent_interviews": recent,
    }
