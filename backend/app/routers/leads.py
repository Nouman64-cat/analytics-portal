"""List pipeline threads as Leads (parent of interview rounds)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import joinedload
from sqlmodel import Session, or_, select

from app.activity_log import record_activity
from app.database import get_session
from app.deps import get_current_user
from app.lead_thread_utils import effective_lead_fields, ensure_lead_thread, load_lead_map
from app.models.business_developer import BusinessDeveloper
from app.models.candidate import Candidate
from app.models.company import Company
from app.models.interview import Interview
from app.models.resume_profile import ResumeProfile
from app.models.lead_thread import LeadThread
from app.models.user import User, UserRole
from app.models.interview_reminder_log import InterviewReminderLog
from app.schemas.lead import LeadCreate, LeadListItem, LeadListPage, LeadListStats, LeadUpdate
from app.team_member_scope import (
    apply_team_member_interview_list_filter,
    candidate_id_for_team_member,
    team_member_can_access_thread,
)

router = APIRouter(prefix="/api/v1/leads", tags=["Leads"], dependencies=[Depends(get_current_user)])


def _require_lead_write_role(current_user: User) -> None:
    """Create/update/delete leads: superadmin and team member only. BD and manager are read-only."""
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.TEAM_MEMBER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmin and team members can create, edit, or delete leads.",
        )


def _ordered_thread_rows(rows: list[Interview]) -> list[Interview]:
    return sorted(
        rows,
        key=lambda x: (x.interview_date or date.min, x.created_at),
    )


def _primary_bd(rows: list[Interview]) -> tuple[uuid.UUID | None, str | None]:
    for r in _ordered_thread_rows(rows):
        if r.bd_id:
            name = r.business_developer.name if r.business_developer else None
            return r.bd_id, name
    return None, None


def _primary_candidate(rows: list[Interview]) -> tuple[uuid.UUID | None, str | None]:
    """First round in the thread that has a candidate (interviews choose the candidate, not the lead form)."""
    ordered = _ordered_thread_rows(rows)
    for r in ordered:
        if r.candidate_id is not None:
            name = r.candidate.name if r.candidate else None
            return r.candidate_id, name
    first = ordered[0]
    cid = first.candidate_id
    name = first.candidate.name if first.candidate else None
    return cid, name


def _list_candidate_display(
    session: Session,
    lead_row: LeadThread | None,
    rows: list[Interview],
) -> tuple[uuid.UUID | None, str | None]:
    """Prefer thread entertaining candidate; else first round with a candidate."""
    if lead_row and lead_row.entertaining_candidate_id:
        c = session.get(Candidate, lead_row.entertaining_candidate_id)
        if c:
            return c.id, c.name
    return _primary_candidate(rows)


def _build_lead_list_item(
    session: Session,
    thread_id: uuid.UUID,
    rows: list[Interview],
    lead_map: dict,
) -> LeadListItem | None:
    if not rows:
        return None
    ordered = _ordered_thread_rows(rows)
    first = ordered[0]
    pbd_id, pbd_name = _primary_bd(rows)
    lt = lead_map.get(thread_id)
    cand_id, cand_name = _list_candidate_display(session, lt, rows)
    eff = effective_lead_fields(session, thread_id, lt)

    dates = [x.interview_date for x in ordered if x.interview_date]
    first_d = min(dates) if dates else None
    last_d = max(dates) if dates else None

    last_iv = ordered[-1]
    return LeadListItem(
        thread_id=thread_id,
        company_id=first.company_id,
        company_name=first.company.name if first.company else None,
        candidate_id=cand_id,
        candidate_name=cand_name,
        resume_profile_id=first.resume_profile_id,
        resume_profile_name=first.resume_profile.name if first.resume_profile else None,
        primary_bd_id=pbd_id,
        primary_bd_name=pbd_name,
        interview_count=len(rows),
        first_interview_date=first_d,
        last_interview_date=last_d,
        first_interview_id=first.id,
        last_interview_id=last_iv.id,
        primary_role=first.role,
        salary_range=first.salary_range,
        last_round=last_iv.round,
        is_converted=eff.get("is_converted", False),
        is_converted_override=lt.is_converted_override if lt else None,
        lead_outcome=eff["lead_outcome"],
        lead_status_label=eff["lead_status_label"],
        lead_source=eff["lead_source"],
        lead_notes=eff.get("lead_notes"),
    )






def _lead_bucket(outcome: str) -> str:
    o = (outcome or "").lower()
    if o in ("active", "in_pipeline"):
        return "pipeline"
    if o in ("unresponsive", "dead", "dropped", "rejected", "closed"):
        return "terminal"
    return "other"


def _filter_merged_leads(
    items: list[LeadListItem],
    search: Optional[str],
    status: Literal["all", "open", "terminal"],
    bd_id: Optional[uuid.UUID],
    resume_profile_id: Optional[uuid.UUID],
    candidate_id: Optional[uuid.UUID],
    outcome: Optional[str],
    lead_source: Literal["all", "explicit", "derived"],
) -> list[LeadListItem]:
    rows = list(items)
    if search and search.strip():
        q = search.strip().lower()
        rows = [
            l
            for l in rows
            if (
                q in (l.company_name or "").lower()
                or q in (l.candidate_name or "").lower()
                or q in (l.primary_bd_name or "").lower()
                or q in l.lead_status_label.lower()
            )
        ]
    if status == "open":
        rows = [l for l in rows if _lead_bucket(l.lead_outcome) == "pipeline"]
    elif status == "terminal":
        rows = [l for l in rows if _lead_bucket(l.lead_outcome) == "terminal"]
    if bd_id is not None:
        rows = [l for l in rows if l.primary_bd_id == bd_id]
    if resume_profile_id is not None:
        rows = [l for l in rows if l.resume_profile_id == resume_profile_id]
    if candidate_id is not None:
        rows = [l for l in rows if l.candidate_id == candidate_id]
    if outcome and outcome.strip():
        o = outcome.strip().lower()
        rows = [l for l in rows if (l.lead_outcome or "").lower() == o]
    if lead_source == "explicit":
        rows = [l for l in rows if l.lead_source == "explicit"]
    elif lead_source == "derived":
        rows = [l for l in rows if l.lead_source == "derived"]
    return rows


def _sort_merged_leads(
    items: list[LeadListItem],
    sort: Literal[
        "last_activity_desc",
        "last_activity_asc",
        "company_asc",
        "company_desc",
    ],
) -> list[LeadListItem]:
    rows = list(items)
    if sort == "last_activity_desc":
        rows.sort(
            key=lambda x: (x.last_interview_date or date.min, x.thread_id),
            reverse=True,
        )
    elif sort == "last_activity_asc":
        rows.sort(key=lambda x: (x.last_interview_date or date.max, x.thread_id))
    elif sort == "company_asc":
        rows.sort(
            key=lambda x: ((x.company_name or "").lower(), str(x.thread_id)),
        )
    elif sort == "company_desc":
        rows.sort(
            key=lambda x: ((x.company_name or "").lower(), str(x.thread_id)),
            reverse=True,
        )
    return rows


def _compute_lead_stats(items: list[LeadListItem]) -> LeadListStats:
    pipeline = terminal = other = active = converted = 0
    rejected = dropped = closed = dead = 0
    for l in items:
        b = _lead_bucket(l.lead_outcome)
        if b == "pipeline":
            pipeline += 1
        elif b == "terminal":
            terminal += 1
        else:
            other += 1
        o = (l.lead_outcome or "").lower()
        if o == "active":
            active += 1
        
        if l.is_converted:
            converted += 1

        if o == "rejected":
            rejected += 1
        elif o == "dropped":
            dropped += 1
        elif o == "closed":
            closed += 1
        elif o == "dead":
            dead += 1
    return LeadListStats(
        total_leads=len(items),
        in_pipeline=pipeline,
        active=active,
        converted=converted,
        terminal=terminal,
        other=other,
        rejected=rejected,
        dropped=dropped,
        closed=closed,
        dead=dead,
    )


def _load_thread_interviews(session: Session, thread_id: uuid.UUID) -> list[Interview]:
    return session.exec(
        select(Interview)
        .where(Interview.thread_id == thread_id)
        .options(
            joinedload(Interview.company),
            joinedload(Interview.candidate),
            joinedload(Interview.resume_profile),
            joinedload(Interview.business_developer),
        )
    ).all()


@router.get("/", response_model=LeadListPage)
def list_leads(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=500)] = 10,
    search: Annotated[Optional[str], Query()] = None,
    status: Annotated[Literal["all", "open", "terminal"], Query()] = "all",
    bd_id: Annotated[Optional[uuid.UUID], Query()] = None,
    resume_profile_id: Annotated[Optional[uuid.UUID], Query()] = None,
    candidate_id: Annotated[Optional[uuid.UUID], Query()] = None,
    outcome: Annotated[Optional[str], Query()] = None,
    lead_source: Annotated[Literal["all", "explicit", "derived"], Query()] = "all",
    sort: Annotated[
        Literal[
            "last_activity_desc",
            "last_activity_asc",
            "company_asc",
            "company_desc",
        ],
        Query(),
    ] = "last_activity_desc",
):
    """
    One row per pipeline thread (lead): distinct opportunities for the same company are shown separately.
    Uses the same visibility rules as GET /interviews.

    Paginated (default 10 per page). Query params filter the merged list; `stats` reflects the full
    filtered set (not only the current page).
    """
    if current_user.role == UserRole.TEAM_MEMBER:
        cid = candidate_id_for_team_member(session, current_user)
        if cid is None:
            empty = LeadListStats(
                total_leads=0,
                in_pipeline=0,
                active=0,
                terminal=0,
                other=0,
                rejected=0,
                dropped=0,
                closed=0,
                dead=0,
            )
            return LeadListPage(
                items=[],
                total=0,
                page=page,
                page_size=page_size,
                stats=empty,
            )

    base_query = (
        select(Interview)
        .options(
            joinedload(Interview.company),
            joinedload(Interview.candidate),
            joinedload(Interview.resume_profile),
            joinedload(Interview.business_developer),
        )
        .order_by(Interview.interview_date.desc())  # type: ignore
    )

    if current_user.role == UserRole.TEAM_MEMBER:
        cid = candidate_id_for_team_member(session, current_user)
        # Threads visible to this team member:
        #  1. Interview rows directly assigned to their candidate
        #  2. Threads where the LeadThread.entertaining_candidate_id == their candidate
        #     (covers leads created via the lead form before interview rows carried candidate_id)
        threads_via_lt = session.exec(
            select(LeadThread.thread_id).where(
                LeadThread.entertaining_candidate_id == cid
            )
        ).all()
        query = base_query.where(
            or_(
                Interview.candidate_id == cid,
                Interview.thread_id.in_(threads_via_lt),
            )
        )
    else:
        query = apply_team_member_interview_list_filter(session, current_user, base_query)

    interviews = session.exec(query).all()

    by_thread: dict[uuid.UUID, list[Interview]] = {}
    for i in interviews:
        by_thread.setdefault(i.thread_id, []).append(i)

    tids = set(by_thread.keys())
    lead_map = load_lead_map(session, tids)

    out: list[LeadListItem] = []
    for tid, rows in by_thread.items():
        item = _build_lead_list_item(session, tid, rows, lead_map)
        if item:
            out.append(item)

    out.sort(
        key=lambda x: (x.last_interview_date or date.min, x.thread_id),
        reverse=True,
    )

    filtered = _filter_merged_leads(
        out,
        search,
        status,
        bd_id,
        resume_profile_id,
        candidate_id,
        outcome,
        lead_source,
    )
    filtered = _sort_merged_leads(filtered, sort)
    stats = _compute_lead_stats(filtered)
    total = len(filtered)
    start = (page - 1) * page_size
    page_items = filtered[start : start + page_size]

    return LeadListPage(
        items=page_items,
        total=total,
        page=page,
        page_size=page_size,
        stats=stats,
    )


@router.post("/", response_model=LeadListItem, status_code=status.HTTP_201_CREATED)
def create_lead(
    data: LeadCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """
    Open a new pipeline thread: creates a LeadThread row and an initial interview round labeled `Lead`
    (add further rounds from the Interviews page).
    """
    _require_lead_write_role(current_user)

    company_id = data.company_id
    resume_profile_id = data.resume_profile_id
    role = data.role.strip()
    bd_id = data.bd_id

    if not session.get(Company, company_id):
        raise HTTPException(status_code=404, detail="Company not found")


    if not session.get(ResumeProfile, resume_profile_id):
        raise HTTPException(status_code=404, detail="Resume profile not found")
    if bd_id and not session.get(BusinessDeveloper, bd_id):
        raise HTTPException(status_code=404, detail="Business developer not found")

    if data.candidate_id and not session.get(Candidate, data.candidate_id):
        raise HTTPException(status_code=404, detail="Candidate not found")

    thread_id = uuid.uuid4()
    lt = ensure_lead_thread(session, thread_id)
    if data.candidate_id:
        lt.entertaining_candidate_id = data.candidate_id
    if data.notes and data.notes.strip():
        lt.notes = data.notes.strip()
    lt.updated_at = datetime.utcnow()
    session.add(lt)

    sr = (data.salary_range or "").strip() or None
    interview = Interview(
        thread_id=thread_id,
        parent_interview_id=None,
        company_id=company_id,
        # Carry the candidate on the interview row so team-member scoping
        # (filtered by Interview.candidate_id) can see their own lead.
        candidate_id=data.candidate_id,
        resume_profile_id=resume_profile_id,
        role=role,
        round="Lead",
        salary_range=sr,
        bd_id=bd_id,
        interview_date=data.arrived_on,
    )
    session.add(interview)
    session.commit()
    session.refresh(interview)

    rows = _load_thread_interviews(session, thread_id)
    lead_map = load_lead_map(session, {thread_id})
    item = _build_lead_list_item(session, thread_id, rows, lead_map)
    if not item:
        raise HTTPException(status_code=500, detail="Failed to build lead response")

    record_activity(
        session,
        actor=current_user,
        action="create_lead",
        entity_type="lead_thread",
        entity_id=thread_id,
        message=f"Created lead '{role}' at company {company_id}",
    )
    session.commit()
    return item


def _require_lead_read(
    session: Session,
    current_user: User,
    thread_id: uuid.UUID,
) -> list[Interview]:
    rows = _load_thread_interviews(session, thread_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Lead not found")
    if current_user.role == UserRole.TEAM_MEMBER:
        if not team_member_can_access_thread(session, current_user, thread_id):
            raise HTTPException(status_code=404, detail="Lead not found")
    return rows


def _delete_interviews_in_thread(session: Session, thread_id: uuid.UUID) -> None:
    rows = list(
        session.exec(select(Interview).where(Interview.thread_id == thread_id)).all()
    )
    ids = {r.id for r in rows}
    while rows:
        referenced = {
            r.parent_interview_id
            for r in rows
            if r.parent_interview_id and r.parent_interview_id in ids
        }
        leaves = [r for r in rows if r.id not in referenced]
        if not leaves:
            raise RuntimeError("Interview chain has a cycle; cannot delete thread")
        for r in leaves:
            for log in session.exec(
                select(InterviewReminderLog).where(
                    InterviewReminderLog.interview_id == r.id
                )
            ).all():
                session.delete(log)
            session.delete(r)
        rows = [r for r in rows if r not in leaves]


@router.get("/{thread_id}", response_model=LeadListItem)
def get_lead(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    rows = _require_lead_read(session, current_user, thread_id)
    lead_map = load_lead_map(session, {thread_id})
    item = _build_lead_list_item(session, thread_id, rows, lead_map)
    if not item:
        raise HTTPException(status_code=404, detail="Lead not found")
    return item


@router.patch("/{thread_id}", response_model=LeadListItem)
def update_lead(
    thread_id: uuid.UUID,
    data: LeadUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_lead_write_role(current_user)
    rows = _load_thread_interviews(session, thread_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Lead not found")
    first = _ordered_thread_rows(rows)[0]
    patch = data.model_dump(exclude_unset=True)

    lt = ensure_lead_thread(session, thread_id)
    if "notes" in patch:
        n = patch["notes"]
        lt.notes = (n.strip() if isinstance(n, str) else None) or None
    if "candidate_id" in patch:
        cid = patch["candidate_id"]
        if cid is not None and not session.get(Candidate, cid):
            raise HTTPException(status_code=404, detail="Candidate not found")
        lt.entertaining_candidate_id = cid
    if "is_converted_override" in patch:
        lt.is_converted_override = patch["is_converted_override"]
    lt.updated_at = datetime.utcnow()
    session.add(lt)

    if "arrived_on" in patch:
        first.interview_date = patch["arrived_on"]
    if "resume_profile_id" in patch:

        rid = patch["resume_profile_id"]
        if rid is not None:
            if not session.get(ResumeProfile, rid):
                raise HTTPException(status_code=404, detail="Resume profile not found")
            first.resume_profile_id = rid
    if "role" in patch and patch["role"]:
        first.role = patch["role"].strip()
    if "salary_range" in patch:
        sr = patch["salary_range"]
        first.salary_range = (sr.strip() if isinstance(sr, str) else None) or None
    if "bd_id" in patch:
        bd = patch["bd_id"]
        if bd is not None and not session.get(BusinessDeveloper, bd):
            raise HTTPException(status_code=404, detail="Business developer not found")
        first.bd_id = bd
    first.updated_at = datetime.utcnow()
    session.add(first)
    session.commit()

    rows = _load_thread_interviews(session, thread_id)
    lead_map = load_lead_map(session, {thread_id})
    item = _build_lead_list_item(session, thread_id, rows, lead_map)
    if not item:
        raise HTTPException(status_code=500, detail="Failed to build lead response")
    record_activity(
        session,
        actor=current_user,
        action="update_lead",
        entity_type="lead_thread",
        entity_id=thread_id,
        message=f"Updated lead thread {thread_id}",
    )
    session.commit()
    return item


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    thread_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_lead_write_role(current_user)
    rows = _load_thread_interviews(session, thread_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Lead not found")
    co = session.get(Company, rows[0].company_id)
    company_label = co.name if co else "company"
    _delete_interviews_in_thread(session, thread_id)
    lt = session.get(LeadThread, thread_id)
    if lt:
        session.delete(lt)
    record_activity(
        session,
        actor=current_user,
        action="delete_lead",
        entity_type="lead_thread",
        entity_id=thread_id,
        message=f"Deleted lead thread at {company_label}",
    )
    session.commit()
    return None
