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
        lead_outcome=eff["lead_outcome"],
        lead_status_label=eff["lead_status_label"],
        lead_source=eff["lead_source"],
        lead_notes=eff.get("lead_notes"),
    )


def _merge_leads_by_company(items: list[LeadListItem]) -> list[LeadListItem]:
    """
    One row per company: multiple legacy threads under the same company collapse to a single lead.
    Canonical thread = latest activity (last_interview_date); names list distinct candidates.
    """
    if len(items) <= 1:
        return items

    by_company: dict[uuid.UUID, list[LeadListItem]] = {}
    for it in items:
        by_company.setdefault(it.company_id, []).append(it)

    merged: list[LeadListItem] = []
    for company_id, group in by_company.items():
        if len(group) == 1:
            merged.append(group[0])
            continue

        def activity_key(x: LeadListItem) -> tuple:
            return (x.last_interview_date or date.min, x.thread_id)

        group_sorted = sorted(group, key=activity_key, reverse=True)
        canonical = group_sorted[0]
        earliest = min(
            group,
            key=lambda x: (
                x.first_interview_date or date.max,
                str(x.first_interview_id or ""),
            ),
        )
        total_count = sum(x.interview_count for x in group)

        names: list[str] = []
        seen: set[str] = set()
        for x in group:
            if x.candidate_name and x.candidate_name not in seen:
                seen.add(x.candidate_name)
                names.append(x.candidate_name)
        cand_name_display = ", ".join(names) if names else None

        cids = {x.candidate_id for x in group if x.candidate_id is not None}
        merged_cid = next(iter(cids)) if len(cids) == 1 else None

        first_dates = [x.first_interview_date for x in group if x.first_interview_date]
        last_dates = [x.last_interview_date for x in group if x.last_interview_date]

        merged.append(
            LeadListItem(
                thread_id=canonical.thread_id,
                company_id=company_id,
                company_name=canonical.company_name,
                candidate_id=merged_cid,
                candidate_name=cand_name_display,
                resume_profile_id=earliest.resume_profile_id,
                resume_profile_name=earliest.resume_profile_name,
                primary_bd_id=canonical.primary_bd_id,
                primary_bd_name=canonical.primary_bd_name,
                interview_count=total_count,
                first_interview_date=min(first_dates) if first_dates else None,
                last_interview_date=max(last_dates) if last_dates else None,
                first_interview_id=earliest.first_interview_id,
                last_interview_id=canonical.last_interview_id,
                primary_role=earliest.primary_role,
                salary_range=earliest.salary_range,
                last_round=canonical.last_round,
                lead_outcome=canonical.lead_outcome,
                lead_status_label=canonical.lead_status_label,
                lead_source=canonical.lead_source,
                lead_notes=canonical.lead_notes,
            )
        )

    merged.sort(
        key=lambda x: (x.last_interview_date or date.min, x.thread_id),
        reverse=True,
    )
    return merged


def _adjust_merged_leads_for_team_member(
    session: Session,
    current_user: User,
    items: list[LeadListItem],
    lead_map: dict[uuid.UUID, LeadThread],
) -> list[LeadListItem]:
    """
    After company-level merge, team members must PATCH the lead thread they own for that company
    (their latest interview row), not the canonical merged thread_id.
    """
    if current_user.role != UserRole.TEAM_MEMBER:
        return items
    cid = candidate_id_for_team_member(session, current_user)
    if cid is None:
        return items
    out: list[LeadListItem] = []
    for item in items:
        rows = session.exec(
            select(Interview).where(
                Interview.company_id == item.company_id,
                Interview.candidate_id == cid,
            )
        ).all()
        if not rows:
            out.append(item)
            continue
        latest = max(
            rows,
            key=lambda x: (x.interview_date or date.min, x.created_at or datetime.min),
        )
        tid = latest.thread_id
        lt = lead_map.get(tid)
        if lt is None:
            lt = session.get(LeadThread, tid)
        eff = effective_lead_fields(session, tid, lt)
        out.append(
            item.model_copy(
                update={
                    "thread_id": tid,
                    "lead_outcome": eff["lead_outcome"],
                    "lead_status_label": eff["lead_status_label"],
                    "lead_source": eff["lead_source"],
                    "lead_notes": eff.get("lead_notes"),
                }
            )
        )
    return out


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
    pipeline = terminal = other = active = 0
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
    One row per company (lead): all pipelines for the same company are merged into one list row.
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
    merged = _merge_leads_by_company(out)
    merged = _adjust_merged_leads_for_team_member(
        session, current_user, merged, lead_map
    )

    filtered = _filter_merged_leads(
        merged,
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

    existing = session.exec(
        select(Interview.id).where(Interview.company_id == company_id).limit(1)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A lead already exists for this company. Add interview rounds from the Interviews page.",
        )

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
    lt.updated_at = datetime.utcnow()
    session.add(lt)

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
