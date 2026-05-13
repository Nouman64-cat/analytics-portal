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

# Roles that dept leads are not allowed to create or assign
_RESTRICTED_ROLES = {UserRole.SUPERADMIN, UserRole.MANAGER, UserRole.DEPT_LEAD}


def generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _require_user_manage(current_user: User) -> None:
    if current_user.role not in (UserRole.SUPERADMIN, UserRole.DEPT_LEAD):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins and dept leads can manage users",
        )


@router.get("/", response_model=List[UserRead])
def list_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _require_user_manage(current_user)

    query = select(User).order_by(User.created_at.desc())
    if current_user.role == UserRole.DEPT_LEAD:
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

    if current_user.role == UserRole.DEPT_LEAD:
        if UserRole(user_in.role) in _RESTRICTED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Dept leads can only create team-member or bd accounts",
            )

    existing = session.exec(select(User).where(User.email == user_in.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    # Dept lead: always assign to their own department
    dept_id = current_user.department_id if current_user.role == UserRole.DEPT_LEAD else user_in.department_id

    temp_password = generate_password()
    hashed = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode()

    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        role=user_in.role,
        hashed_password=hashed,
        must_change_password=True,
        department_id=dept_id,
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

    if current_user.role == UserRole.DEPT_LEAD:
        if user.department_id != current_user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not in your department")
        if user_in.role and UserRole(user_in.role) in _RESTRICTED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Dept leads cannot assign superadmin, manager, or dept-lead roles",
            )
        # Prevent moving user out of the dept lead's department
        if user_in.department_id is not None and user_in.department_id != current_user.department_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot move users to a different department",
            )

    if user_in.email and user_in.email != user.email:
        existing = session.exec(select(User).where(User.email == user_in.email)).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )

    update_data = user_in.dict(exclude_unset=True)
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

    if current_user.role == UserRole.DEPT_LEAD:
        if user.department_id != current_user.department_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not in your department")
        if user.role in _RESTRICTED_ROLES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete superadmin, manager, or dept-lead accounts",
            )

    session.delete(user)
    session.commit()
    return None
