import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select
from sqlalchemy import or_

from app.deps import get_current_user, assert_write_access
from app.database import get_session
from app.activity_log import record_activity
from app.dept_scope import get_user_allowed_depts
from app.models.engagement import Engagement
from app.models.company import Company
from app.models.candidate import Candidate
from app.models.resume_profile import ResumeProfile
from app.models.business_developer import BusinessDeveloper
from app.models.department import Department
from app.models.user import User
from app.schemas.engagement import (
    EngagementCreate,
    EngagementRead,
    EngagementReadWithDetails,
    EngagementUpdate,
)

router = APIRouter(prefix="/api/v1/engagements", tags=["Engagements"], dependencies=[Depends(get_current_user)])


def _build_engagement_read_with_details(eng: Engagement, session: Session) -> EngagementReadWithDetails:
    """Helper to load names of associated entities for an Engagement."""
    organizer_email = None
    organizer_name = None
    if eng.organizer_id:
        user = session.get(User, eng.organizer_id)
        if user:
            organizer_email = user.email
            organizer_name = getattr(user, "full_name", None) or user.username

    company_name = None
    if eng.company_id:
        comp = session.get(Company, eng.company_id)
        if comp:
            company_name = comp.name

    candidate_name = None
    if eng.candidate_id:
        cand = session.get(Candidate, eng.candidate_id)
        if cand:
            candidate_name = cand.name

    resume_profile_name = None
    if eng.resume_profile_id:
        prof = session.get(ResumeProfile, eng.resume_profile_id)
        if prof:
            resume_profile_name = prof.name

    bd_name = None
    if eng.bd_id:
        bd = session.get(BusinessDeveloper, eng.bd_id)
        if bd:
            bd_name = bd.name

    department_name = None
    if eng.department_id:
        dept = session.get(Department, eng.department_id)
        if dept:
            department_name = dept.name

    return EngagementReadWithDetails(
        id=eng.id,
        title=eng.title,
        description=eng.description,
        start_time=eng.start_time,
        end_time=eng.end_time,
        is_all_day=eng.is_all_day,
        location=eng.location,
        meeting_link=eng.meeting_link,
        recurrence_rule=eng.recurrence_rule,
        status=eng.status or "scheduled",
        show_as=eng.show_as or "busy",
        reminder_minutes=eng.reminder_minutes,
        organizer_id=eng.organizer_id,
        department_id=eng.department_id,
        company_id=eng.company_id,
        candidate_id=eng.candidate_id,
        resume_profile_id=eng.resume_profile_id,
        bd_id=eng.bd_id,
        created_at=eng.created_at,
        updated_at=eng.updated_at,
        organizer_email=organizer_email,
        organizer_name=organizer_name,
        company_name=company_name,
        candidate_name=candidate_name,
        resume_profile_name=resume_profile_name,
        bd_name=bd_name,
        department_name=department_name,
    )


@router.get("/", response_model=list[EngagementReadWithDetails])
def list_engagements(
    start_date: Optional[datetime] = Query(None, description="Start range to filter events"),
    end_date: Optional[datetime] = Query(None, description="End range to filter events"),
    department_id: Optional[uuid.UUID] = Query(None),
    candidate_id: Optional[uuid.UUID] = Query(None),
    company_id: Optional[uuid.UUID] = Query(None),
    organizer_id: Optional[uuid.UUID] = Query(None),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List and query engagements with filtering."""
    query = select(Engagement).order_by(Engagement.start_time)

    # Scoped access limits
    allowed = get_user_allowed_depts(current_user, session)
    if allowed is not None:
        if not allowed:
            return []
        # Filter by allowed departments
        query = query.where(
            or_(
                Engagement.department_id == None,  # global events
                Engagement.department_id.in_(allowed)
            )
        )

    # Normalize dates to naive UTC if timezone aware
    if start_date and start_date.tzinfo is not None:
        start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)
    if end_date and end_date.tzinfo is not None:
        end_date = end_date.astimezone(timezone.utc).replace(tzinfo=None)

    # Apply search filters using overlapping interval logic:
    # Event overlaps [start_date, end_date] if start_time <= end_date AND end_time >= start_date.
    if start_date:
        query = query.where(Engagement.end_time >= start_date)
    if end_date:
        query = query.where(Engagement.start_time <= end_date)
    if department_id:
        query = query.where(Engagement.department_id == department_id)
    if candidate_id:
        query = query.where(Engagement.candidate_id == candidate_id)
    if company_id:
        query = query.where(Engagement.company_id == company_id)
    if organizer_id:
        query = query.where(Engagement.organizer_id == organizer_id)

    engagements = session.exec(query).all()
    return [_build_engagement_read_with_details(eng, session) for eng in engagements]


@router.get("/{id}", response_model=EngagementReadWithDetails)
def get_engagement(
    id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Retrieve details for a single engagement."""
    eng = session.get(Engagement, id)
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    # Access check
    allowed = get_user_allowed_depts(current_user, session)
    if allowed is not None and eng.department_id and eng.department_id not in allowed:
        raise HTTPException(status_code=403, detail="Access denied to this engagement's department")

    return _build_engagement_read_with_details(eng, session)


@router.post("/", response_model=EngagementRead, status_code=status.HTTP_201_CREATED)
def create_engagement(
    data: EngagementCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new calendar engagement."""
    # Write permission check
    assert_write_access(current_user)

    # Allowed departments check
    allowed = get_user_allowed_depts(current_user, session)
    if allowed is not None:
        if data.department_id and data.department_id not in allowed:
            raise HTTPException(status_code=403, detail="Cannot assign event to unauthorized department")

    # Set up fields
    engagement = Engagement(
        **data.model_dump(),
        organizer_id=current_user.id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    session.add(engagement)
    session.commit()
    session.refresh(engagement)

    record_activity(
        session=session,
        actor=current_user,
        action="CREATE",
        entity_type="engagement",
        entity_id=engagement.id,
        message=f"Created calendar engagement: {engagement.title}",
    )

    return engagement


@router.put("/{id}", response_model=EngagementRead)
def update_engagement(
    id: uuid.UUID,
    data: EngagementUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update details of an existing engagement."""
    assert_write_access(current_user)

    eng = session.get(Engagement, id)
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    # Scoped user access check
    allowed = get_user_allowed_depts(current_user, session)
    if allowed is not None:
        if eng.department_id and eng.department_id not in allowed:
            raise HTTPException(status_code=403, detail="Cannot edit event belonging to other department")
        if data.department_id and data.department_id not in allowed:
            raise HTTPException(status_code=403, detail="Cannot move event to unauthorized department")

    # Update attributes
    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(eng, key, val)

    eng.updated_at = datetime.utcnow()

    session.add(eng)
    session.commit()
    session.refresh(eng)

    record_activity(
        session=session,
        actor=current_user,
        action="UPDATE",
        entity_type="engagement",
        entity_id=eng.id,
        message=f"Updated calendar engagement: {eng.title}",
    )

    return eng


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_engagement(
    id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Remove a calendar engagement."""
    assert_write_access(current_user)

    eng = session.get(Engagement, id)
    if not eng:
        raise HTTPException(status_code=404, detail="Engagement not found")

    # Scoped check
    allowed = get_user_allowed_depts(current_user, session)
    if allowed is not None and eng.department_id and eng.department_id not in allowed:
        raise HTTPException(status_code=403, detail="Cannot delete event belonging to other department")

    title = eng.title
    session.delete(eng)
    session.commit()

    record_activity(
        session=session,
        actor=current_user,
        action="DELETE",
        entity_type="engagement",
        entity_id=id,
        message=f"Deleted calendar engagement: {title}",
    )
