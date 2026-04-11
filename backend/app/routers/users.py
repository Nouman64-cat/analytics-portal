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


def generate_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.get("/", response_model=List[UserRead])
def list_users(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """List all users (Superadmin only)."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can manage users",
        )
    
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    return users


@router.post("/", response_model=UserRead)
def create_user(
    user_in: UserCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Create a new user and send a welcome email (Superadmin only)."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can manage users",
        )

    # Check if user already exists
    existing = session.exec(select(User).where(User.email == user_in.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    # Generate password and hash it
    temp_password = generate_password()
    hashed = bcrypt.hashpw(temp_password.encode(), bcrypt.gensalt()).decode()

    # Create user
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        role=user_in.role,
        hashed_password=hashed,
        must_change_password=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # Send welcome email
    settings = get_settings()
    email_sent = try_send_welcome_email(
        settings,
        to_email=user.email,
        full_name=user.full_name,
        password=temp_password,
    )

    if not email_sent:
        # We don't fail the user creation if email fails, but we should log it
        # In a real app, you might want a more robust way to handle this
        pass

    return user


@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: str,
    user_in: UserUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """Update a user's details (Superadmin only)."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can manage users",
        )

    import uuid
    user = session.get(User, uuid.UUID(user_id))
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check for email uniqueness if email is being updated
    if user_in.email and user_in.email != user.email:
        existing = session.exec(select(User).where(User.email == user_in.email)).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )

    # Update fields
    update_data = user_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    session.add(user)
    session.commit()
    session.refresh(user)
    return user
