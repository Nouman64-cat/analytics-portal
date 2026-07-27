"""Shared non-team-member visibility scoping for Interview queries.

Used by both the Interviews router and the Leads router (a lead is one pipeline
thread of Interview rows), so BD/BD_TEAM_LEAD sibling-leak prevention and dept_lead
scoping stay in one place instead of two independently-drifting copies.

TEAM_MEMBER scoping is intentionally NOT included here: the two routers apply
different semantics for team members (Interviews: only rows for their own
candidate_id; Leads: also pulls in whole threads where they're the entertaining
candidate on any round) and must keep handling that themselves.
"""
import uuid
from typing import Optional

from sqlmodel import Session, select, or_, and_, func

from app.models.user import User, UserRole
from app.models.business_developer import BusinessDeveloper
from app.models.interview import Interview
from app.dept_scope import apply_dept_filter
from app.bd_scope import get_bd_entity_scope, other_bd_user_ids_select, is_superadmin_linked_bd


def apply_interview_non_team_scope(
    session: Session,
    current_user: User,
    query,
    department_id: Optional[uuid.UUID],
):
    """Restrict an Interview select() to what a non-team-member user may see.

    Only call this when current_user.role != UserRole.TEAM_MEMBER.
    """
    if current_user.role == UserRole.BD and is_superadmin_linked_bd(current_user, session):
        # Superadmin-linked BD: full cross-dept read access, no entity scope restriction
        return apply_dept_filter(query, Interview, current_user, department_id, session)

    if current_user.role in (UserRole.BD_TEAM_LEAD, UserRole.BD):
        scope = get_bd_entity_scope(current_user, session)

        if current_user.role == UserRole.BD:
            # Regular BD: only see interviews they personally created, OR interviews
            # attributed to their BD entity that were NOT created by another BD user
            # who also links to that same entity (prevents cross-member leakage).
            # This handles the case where a superadmin creates an interview and sets
            # bd_id to this BD's entity — that row should still be visible to the BD.
            conds: list = [Interview.created_by_user_id == current_user.id]
            if scope:  # bd_entity_id is linked
                # Subquery: every OTHER BD-type user (keyed on role, not on the
                # bd_entity_id column, so siblings resolved via fallback are caught).
                other_bd_user_ids = other_bd_user_ids_select(current_user)
                # Include bd_id matches only if NOT created by another BD user
                # (i.e. only rows an admin attributed to this BD's entity).
                conds.append(
                    and_(
                        Interview.bd_id.in_(scope),
                        Interview.created_by_user_id.not_in(other_bd_user_ids),
                    )
                )

        else:  # BD_TEAM_LEAD
            conds = [Interview.created_by_user_id == current_user.id]

            if scope is None:
                # Backward compat: bd_entity_id not linked — match by email/name to BD entity only
                bd = session.exec(
                    select(BusinessDeveloper).where(func.lower(
                        BusinessDeveloper.email) == current_user.email.lower())
                ).first()
                if not bd:
                    bd = session.exec(
                        select(BusinessDeveloper).where(
                            or_(
                                func.lower(
                                    BusinessDeveloper.name) == current_user.full_name.lower(),
                                func.lower(current_user.full_name).contains(
                                    func.lower(BusinessDeveloper.name)),
                                func.lower(BusinessDeveloper.name).contains(
                                    func.lower(current_user.full_name))
                            )
                        )
                    ).first()
                if bd:
                    conds.append(Interview.bd_id == bd.id)
            else:
                # BD_TEAM_LEAD scope = own entity + all team member entities
                conds.append(Interview.bd_id.in_(scope))

            # Always include interviews created by direct team members.
            team_user_ids_query = select(User.id).where(
                User.team_lead_user_id == current_user.id)
            conds.append(Interview.created_by_user_id.in_(
                team_user_ids_query))

        # NOTE: BD / BD_TEAM_LEAD visibility is strictly ownership/hierarchy based.
        # We intentionally do NOT OR-in department-wide rows here: a regular BD must
        # see only what they created (plus admin-attributed entity rows), and a team
        # lead only their own + direct team members'. Pulling in the whole department
        # leaked sibling BDs' leads/interviews to each other.
        if department_id:
            query = query.where(Interview.department_id == department_id)

        return query.where(or_(*conds))

    return apply_dept_filter(query, Interview, current_user, department_id)
