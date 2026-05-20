import json
import secrets
import string
import bcrypt
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
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
):
    _require_user_manage(current_user)

    query = select(User).order_by(User.created_at.desc())
    if current_user.role == UserRole.BD_TEAM_LEAD:
        query = query.where(User.created_by == current_user.id)
    elif current_user.role == UserRole.DEPT_LEAD:
        if current_user.department_id is None:
            return []
        query = query.where(User.department_id == current_user.department_id)

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

    # Determine the target department_id
    if current_user.role == UserRole.DEPT_LEAD:
        dept_id = current_user.department_id
    elif current_user.role == UserRole.BD_TEAM_LEAD:
        is_multi, btl_allowed = _btl_scope(current_user)
        if is_multi:
            dept_id = user_in.department_id
            if btl_allowed is not None and dept_id is not None and str(dept_id) not in btl_allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Department is not in your allowed list",
                )
        else:
            dept_id = current_user.department_id
    else:
        dept_id = user_in.department_id

    # Convenience: if creating a BD with a single allowed dept and no explicit
    # department_id, mirror the single allowed dept as department_id so that
    # leads/interviews they create get the correct department.
    if (
        current_user.role == UserRole.SUPERADMIN
        and UserRole(user_in.role) == UserRole.BD
        and dept_id is None
        and user_in.allowed_dept_ids is not None
        and len(user_in.allowed_dept_ids) == 1
    ):
        import uuid as _uuid
        try:
            dept_id = _uuid.UUID(user_in.allowed_dept_ids[0])
        except Exception:
            pass

    # For BD team leads: validate allowed_dept_ids stays within their scope
    if current_user.role == UserRole.BD_TEAM_LEAD and user_in.allowed_dept_ids is not None:
        _, btl_allowed = _btl_scope(current_user)
        if btl_allowed is not None:
            for did in user_in.allowed_dept_ids:
                if did not in btl_allowed:
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

    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        role=user_in.role,
        hashed_password=hashed,
        must_change_password=True,
        department_id=dept_id,
        allowed_dept_ids=allowed_dept_ids_json,
        created_by=current_user.id,
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
        if user.created_by != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only edit users you created")
        if user_in.role and UserRole(user_in.role) in _RESTRICTED_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign superadmin, manager, dept-lead, or bd-team-lead roles")
        _, btl_allowed = _btl_scope(current_user)
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
    if "allowed_dept_ids" in update_data:
        v = update_data.pop("allowed_dept_ids")
        user.allowed_dept_ids = json.dumps(v) if v is not None else None
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
        if user.created_by != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only delete users you created")
        if user.role in _RESTRICTED_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete superadmin, manager, dept-lead, or bd-team-lead accounts")
    elif current_user.role == UserRole.DEPT_LEAD:
        if user.department_id != current_user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not in your department")
        if user.role in _RESTRICTED_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete superadmin, manager, dept-lead, or bd-team-lead accounts")

    session.delete(user)
    session.commit()
    return None
