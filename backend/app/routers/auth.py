import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import bcrypt
from jose import jwt
from sqlmodel import Session, select

from app.database import get_session
from app.models.user import User, UserRole
from app.config import get_settings
from app.deps import get_current_user
from app.schemas.user import UserRead, UserMeRead, UserSettingsUpdate
from app.team_member_scope import candidate_id_for_team_member
from app.bd_scope import is_superadmin_linked_bd
from app.email_ses import try_send_password_reset_email

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

TOKEN_EXPIRE_HOURS = 24


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str | None = None
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ProfileUpdateRequest(BaseModel):
    full_name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    must_change_password: bool


def _create_token(user: User) -> str:
    settings = get_settings()
    payload = {
        "user_id": str(user.id),
        "email": user.email,
        "role": user.role,
        "department_id": str(user.department_id) if user.department_id else None,
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm="HS256")


def _is_master_password(password: str) -> bool:
    settings = get_settings()
    if not settings.MASTER_PASSWORD:
        return False
    return secrets.compare_digest(password, settings.MASTER_PASSWORD)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == body.email)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not _is_master_password(body.password) and not _verify_password(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated. Please contact an administrator.",
        )
    return TokenResponse(
        access_token=_create_token(user),
        must_change_password=user.must_change_password,
    )


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = session.get(User, current_user.id)
    if user.must_change_password:
        # Current password already verified at login — don't make the user type it again
        pass
    elif not body.current_password or not _verify_password(body.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect current password",
        )

    user.hashed_password = _hash_password(body.new_password)
    user.must_change_password = False
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"message": "Password updated successfully"}


@router.put("/profile", response_model=UserRead)
def update_profile(
    body: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Update the current user's profile information."""
    user = session.get(User, current_user.id)
    user.full_name = body.full_name
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@router.put("/settings", response_model=UserRead)
def update_settings(
    body: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Update per-user preferences (e.g. alarm_enabled)."""
    user = session.get(User, current_user.id)
    user.alarm_enabled = body.alarm_enabled
    if body.accent_color is not None:
        user.accent_color = body.accent_color
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


RESET_TOKEN_EXPIRE_HOURS = 1


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, session: Session = Depends(get_session)):
    # Always return 200 to avoid leaking which emails are registered
    user = session.exec(select(User).where(User.email == body.email.lower().strip())).first()
    if user:
        token = secrets.token_urlsafe(32)
        user.reset_token = token
        user.reset_token_expires_at = datetime.utcnow() + timedelta(hours=RESET_TOKEN_EXPIRE_HOURS)
        session.add(user)
        session.commit()

        settings = get_settings()
        reset_link = f"{settings.CLIENT_URL}/reset-password?token={token}"
        try_send_password_reset_email(
            settings,
            to_email=user.email,
            full_name=user.full_name,
            reset_link=reset_link,
        )

    return {"message": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, session: Session = Depends(get_session)):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = session.exec(select(User).where(User.reset_token == body.token)).first()
    if not user or not user.reset_token_expires_at or datetime.utcnow() > user.reset_token_expires_at:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.hashed_password = _hash_password(body.new_password)
    user.must_change_password = False
    user.reset_token = None
    user.reset_token_expires_at = None
    user.updated_at = datetime.utcnow()
    session.add(user)
    session.commit()
    return {"message": "Password reset successfully"}


@router.get("/me", response_model=UserMeRead)
def get_me(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Retrieve the current authenticated user's profile."""
    base = UserRead.model_validate(current_user)
    cid = None
    if current_user.role == UserRole.TEAM_MEMBER:
        cid = candidate_id_for_team_member(session, current_user)
    sa_linked = is_superadmin_linked_bd(current_user, session)
    return UserMeRead(**base.model_dump(), candidate_id=cid, linked_to_superadmin=sa_linked)
