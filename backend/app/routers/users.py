import json
import secrets
import string
import bcrypt
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.config import get_settings
from app.email_ses import try_send_welcome_email

router = APIRouter(
    prefix="/api/v1/users",
    tags=["Users"],
    dependencies=[Depends(get_current_user)],
)

# Roles that dept leads / bd-team-leads are not allowed to create or assign
_RESTRICTED_ROLES = {UserRole.SUPERADMIN, UserRole.MANAGER, UserRole.DEPT_LEAD, UserRole.BD_TEAM_LEAD}

# Roles that have dept-scoped user management authority
_DEPT_MANAGER_ROLES = (UserRole.DEPT_LEAD, UserRole.BD_TEAM_LEAD)


def _bd_in_btl_scope(lead: User, bd: User, is_multi: bool, btl_allowed: list[str] | None) -> bool:
    """Return True if bd falls within the BD_TEAM_LEAD's scope.

    Checks both department_id and allowed_dept_ids since BD users may have
    their scope stored in either field.
    """
    if is_multi and btl_allowed is None:
        return True  # lead has access to all departments
    if btl_allowed is not None:
        # Check direct department_id match
        if bd.department_id is not None and str(bd.department_id) in btl_allowed:
            return True
        # Also check allowed_dept_ids overlap (BD users may use this instead of department_id)
        if bd.allowed_dept_ids is not None:
            try:
                bd_depts = json.loads(bd.allowed_dept_ids)
                return any(str(d) in btl_allowed for d in bd_depts)
            except Exception:
                pass
        return False
    # single-dept (is_multi=False, btl_allowed=None)
    return bd.department_id == lead.department_id


def _btl_scope(user: User) -> tuple[bool, list[str] | None]:
    """Return (is_multi, allowed) for a BD_TEAM_LEAD.

    is_multi  – True when the lead has access to 2+ depts and may choose one.
    allowed   – None means unrestricted (all depts); a non-empty list means
                specific dept IDs the lead is allowed to operate in.
    """
    if user.role != UserRole.BD_TEAM_LEAD:
        return False, None
    if user.allowed_dept_ids is None:
        return False, None            # single-dept default behaviour
    ids: list[str] = json.loads(user.allowed_dept_ids)
    if len(ids) == 0:
        return True, None             # [] = all depts, unrestricted
    if len(ids) > 1:
        return True, ids              # explicit multi-dept list
    return False, ids                 # exactly one explicit dept


def generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _require_user_manage(current_user: User) -> None:
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.DEPT_LEAD, UserRole.BD_TEAM_LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins, dept leads, and BD team leads can manage users",
        )


@router.get("/", response_model=List[UserRead])
def list_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
    role: Optional[str] = Query(None),
    department_id: Optional[str] = Query(None),
):
    _require_user_manage(current_user)

    import uuid as _uuid

    if current_user.role == UserRole.BD_TEAM_LEAD:
        is_multi, btl_allowed = _btl_scope(current_user)
        all_users = session.exec(
            select(User).where(User.role.in_([UserRole.BD, UserRole.TEAM_MEMBER])).order_by(User.created_at.desc())
        ).all()
        if btl_allowed is not None:
            allowed_set = set(btl_allowed)

            def _in_scope(u: User) -> bool:
                if u.created_by == current_user.id:
                    return True
                if u.department_id is not None and str(u.department_id) in allowed_set:
                    return True
                if u.allowed_dept_ids is not None:
                    try:
                        return any(d in allowed_set for d in json.loads(u.allowed_dept_ids))
                    except Exception:
                        pass
                return False

            all_users = [u for u in all_users if _in_scope(u)]
        elif not is_multi:
            dept_id = current_user.department_id
            all_users = [u for u in all_users if (dept_id is not None and u.department_id == dept_id) or u.created_by == current_user.id]
        # is_multi and btl_allowed is None → unrestricted, keep all
        if role:
            all_users = [u for u in all_users if u.role == role]
        if department_id:
            dept_uuid = _uuid.UUID(department_id)
            all_users = [u for u in all_users if u.department_id == dept_uuid]
        return all_users

    query = select(User).order_by(User.created_at.desc())
    if current_user.role == UserRole.DEPT_LEAD:
        if current_user.department_id is None:
            return []
        query = query.where(User.department_id == current_user.department_id)

    if role:
        query = query.where(User.role == role)

    if department_id:
        query = query.where(User.department_id == _uuid.UUID(department_id))

    return session.exec(query).all()


@router.post("/", response_model=UserRead)
def create_user(
    user_in: UserCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_user_manage(current_user)

    if current_user.role in _DEPT_MANAGER_ROLES:
        if UserRole(user_in.role) in _RESTRICTED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Dept leads and BD team leads can only create team-member or bd accounts",
            )

    existing = session.exec(select(User).where(User.email == user_in.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    # ── Determine dept_id; compute BTL scope vars for later use ─────────────
    import uuid as _uuid
    btl_is_multi: bool = False
    btl_allowed_ids: list[str] | None = None

    if current_user.role == UserRole.DEPT_LEAD:
        dept_id = current_user.department_id
    elif current_user.role == UserRole.BD_TEAM_LEAD:
        btl_is_multi, btl_allowed_ids = _btl_scope(current_user)
        if btl_is_multi:
            dept_id = user_in.department_id
            if btl_allowed_ids is not None and dept_id is not None and str(dept_id) not in btl_allowed_ids:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Department is not in your allowed list",
                )
        else:
            # Single-dept BTL: prefer department_id, fall back to allowed_dept_ids[0]
            dept_id = current_user.department_id
            if dept_id is None and btl_allowed_ids:
                try:
                    dept_id = _uuid.UUID(btl_allowed_ids[0])
                except Exception:
                    pass
    else:
        dept_id = user_in.department_id

    # For BD users created by a single-dept BTL that didn't send allowed_dept_ids
    # (the form hides the selector when isMultiDeptBdLead=false), auto-scope them
    # to the BTL's own department(s) so they don't inherit unrestricted access.
    if (
        UserRole(user_in.role) == UserRole.BD
        and current_user.role == UserRole.BD_TEAM_LEAD
        and not btl_is_multi
        and btl_allowed_ids is not None
        and user_in.allowed_dept_ids is None
    ):
        user_in.allowed_dept_ids = btl_allowed_ids

    # Convenience: mirror first allowed dept as department_id
    if (
        UserRole(user_in.role) == UserRole.BD
        and dept_id is None
        and user_in.allowed_dept_ids is not None
        and len(user_in.allowed_dept_ids) >= 1
        and current_user.role in (UserRole.SUPERADMIN, UserRole.BD_TEAM_LEAD)
    ):
        try:
            dept_id = _uuid.UUID(user_in.allowed_dept_ids[0])
        except Exception:
            pass

    # For BD team leads: validate allowed_dept_ids stays within their scope
    if current_user.role == UserRole.BD_TEAM_LEAD and user_in.allowed_dept_ids is not None:
        if btl_allowed_ids is not None:
            for did in user_in.allowed_dept_ids:
                if did not in btl_allowed_ids:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Cannot grant access to departments outside your scope",
                    )

    temp_password = generate_password()
    hashed = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode()

    allowed_dept_ids_json = (
        json.dumps(user_in.allowed_dept_ids)
        if user_in.allowed_dept_ids is not None
        else None
    )

    # Validate bd_entity_id and team_lead_user_id if provided
    if user_in.bd_entity_id is not None:
        from app.models.business_developer import BusinessDeveloper
        if not session.get(BusinessDeveloper, user_in.bd_entity_id):
            raise HTTPException(status_code=404, detail="Business developer entity not found")

    if user_in.team_lead_user_id is not None:
        lead_user = session.get(User, user_in.team_lead_user_id)
        if not lead_user or lead_user.role not in (UserRole.BD_TEAM_LEAD, UserRole.SUPERADMIN):
            raise HTTPException(status_code=400, detail="team_lead_user_id must reference a BD Team Lead or Superadmin user")

    # When a BD Team Lead creates a BD user without specifying a team lead, auto-assign themselves.
    if (
        UserRole(user_in.role) == UserRole.BD
        and current_user.role == UserRole.BD_TEAM_LEAD
        and user_in.team_lead_user_id is None
    ):
        user_in.team_lead_user_id = current_user.id

    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        role=user_in.role,
        hashed_password=hashed,
        must_change_password=True,
        department_id=dept_id,
        allowed_dept_ids=allowed_dept_ids_json,
        created_by=current_user.id,
        bd_entity_id=user_in.bd_entity_id,
        team_lead_user_id=user_in.team_lead_user_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    settings = get_settings()
    try_send_welcome_email(
        settings,
        to_email=user.email,
        full_name=user.full_name,
        password=temp_password,
    )

    return user


@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    user_in: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_user_manage(current_user)

    import uuid
    user = session.get(User, uuid.UUID(user_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role == UserRole.BD_TEAM_LEAD:
        if user.role not in (UserRole.BD, UserRole.TEAM_MEMBER):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit BD or team member accounts")
        is_multi, btl_allowed = _btl_scope(current_user)
        in_scope = user.created_by == current_user.id or _bd_in_btl_scope(current_user, user, is_multi, btl_allowed)
        if not in_scope:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This user is not in your department scope")
        if user_in.role and UserRole(user_in.role) in _RESTRICTED_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign superadmin, manager, dept-lead, or bd-team-lead roles")
        if btl_allowed is not None:
            if user_in.department_id is not None and str(user_in.department_id) not in btl_allowed:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                    detail="Department is not in your allowed list")
            if user_in.allowed_dept_ids is not None:
                for did in user_in.allowed_dept_ids:
                    if did not in btl_allowed:
                        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                                            detail="Cannot grant access to departments outside your scope")
    elif current_user.role == UserRole.DEPT_LEAD:
        if user.department_id != current_user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not in your department")
        if user_in.role and UserRole(user_in.role) in _RESTRICTED_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign superadmin, manager, dept-lead, or bd-team-lead roles")
        if user_in.department_id is not None and user_in.department_id != current_user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot move users to a different department")

    if user_in.email and user_in.email != user.email:
        existing = session.exec(select(User).where(User.email == user_in.email)).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )

    update_data = user_in.model_dump(exclude_unset=True)

    # Validate bd_entity_id / team_lead_user_id if being updated
    if "bd_entity_id" in update_data and update_data["bd_entity_id"] is not None:
        from app.models.business_developer import BusinessDeveloper
        if not session.get(BusinessDeveloper, update_data["bd_entity_id"]):
            raise HTTPException(status_code=404, detail="Business developer entity not found")
    if "team_lead_user_id" in update_data and update_data["team_lead_user_id"] is not None:
        lead_user = session.get(User, update_data["team_lead_user_id"])
        if not lead_user or lead_user.role not in (UserRole.BD_TEAM_LEAD, UserRole.SUPERADMIN):
            raise HTTPException(status_code=400, detail="team_lead_user_id must reference a BD Team Lead or Superadmin user")

    if "allowed_dept_ids" in update_data:
        v = update_data.pop("allowed_dept_ids")
        user.allowed_dept_ids = json.dumps(v) if v is not None else None
        # Sync department_id from first allowed dept for BD users without one
        if user.role == UserRole.BD and user.department_id is None and v:
            import uuid as _sync_uuid
            try:
                user.department_id = _sync_uuid.UUID(v[0])
            except Exception:
                pass
    for field, value in update_data.items():
        setattr(user, field, value)

    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_user_manage(current_user)

    import uuid
    uid = uuid.UUID(user_id)

    if uid == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account",
        )

    user = session.get(User, uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role == UserRole.BD_TEAM_LEAD:
        if user.role not in (UserRole.BD, UserRole.TEAM_MEMBER):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete BD or team member accounts")
        is_multi, btl_allowed = _btl_scope(current_user)
        in_scope = user.created_by == current_user.id or _bd_in_btl_scope(current_user, user, is_multi, btl_allowed)
        if not in_scope:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This user is not in your department scope")
    elif current_user.role == UserRole.DEPT_LEAD:
        if user.department_id != current_user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not in your department")
        if user.role in _RESTRICTED_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete superadmin, manager, dept-lead, or bd-team-lead accounts")

    session.delete(user)
    session.commit()
    return None
