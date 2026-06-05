from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.deps import get_current_user, require_broadcast_access
from app.models.broadcast_modal import BroadcastModal
from app.models.user import User, UserRole

router = APIRouter(
    prefix="/api/v1/broadcast-modals",
    tags=["Broadcast Modals"],
)

_EXCLUDED_ROLES = {UserRole.MANAGER}


class BroadcastModalRead(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    is_published: bool
    theme: str
    title_size: str
    modal_size: str
    icon: str
    text_align: str
    show_glow: bool
    animation: str
    image_url: Optional[str]
    image_fit: str
    effect: str
    badge_label: str
    close_button_label: str
    created_by_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime]

    class Config:
        from_attributes = True


class BroadcastModalCreate(BaseModel):
    title: str
    body: str = ""
    theme: str = "indigo"
    title_size: str = "md"
    modal_size: str = "md"
    icon: str = "Megaphone"
    text_align: str = "left"
    show_glow: bool = False
    animation: str = "zoom"
    image_url: Optional[str] = None
    image_fit: str = "contain"
    effect: str = "none"
    badge_label: str = "Announcement"
    close_button_label: str = "Got it"


class BroadcastModalUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    theme: Optional[str] = None
    title_size: Optional[str] = None
    modal_size: Optional[str] = None
    icon: Optional[str] = None
    text_align: Optional[str] = None
    show_glow: Optional[bool] = None
    animation: Optional[str] = None
    image_url: Optional[str] = None
    image_fit: Optional[str] = None
    effect: Optional[str] = None
    badge_label: Optional[str] = None
    close_button_label: Optional[str] = None


def _to_read(m: BroadcastModal) -> BroadcastModalRead:
    return BroadcastModalRead(
        id=m.id,
        title=m.title,
        body=m.body,
        is_published=m.is_published,
        theme=m.theme,
        title_size=m.title_size,
        modal_size=m.modal_size,
        icon=m.icon,
        text_align=m.text_align,
        show_glow=m.show_glow,
        animation=m.animation,
        image_url=m.image_url,
        image_fit=m.image_fit,
        effect=m.effect,
        badge_label=m.badge_label,
        close_button_label=m.close_button_label,
        created_by_id=m.created_by_id,
        created_at=m.created_at,
        updated_at=m.updated_at,
        published_at=m.published_at,
    )


@router.get("/active", response_model=Optional[BroadcastModalRead])
def get_active_modal(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
) -> Optional[BroadcastModalRead]:
    """Return the currently published modal for non-manager users."""
    if current_user.role in _EXCLUDED_ROLES:
        return None
    modal = session.exec(
        select(BroadcastModal).where(BroadcastModal.is_published == True)  # noqa: E712
    ).first()
    if not modal:
        return None
    return _to_read(modal)


@router.get("", response_model=list[BroadcastModalRead])
def list_modals(
    session: Session = Depends(get_session),
    current_user: User = Depends(require_broadcast_access),
) -> list[BroadcastModalRead]:
    """List all broadcast modals (superadmin only)."""
    modals = session.exec(
        select(BroadcastModal).order_by(BroadcastModal.created_at.desc())
    ).all()
    return [_to_read(m) for m in modals]


@router.post("", response_model=BroadcastModalRead, status_code=status.HTTP_201_CREATED)
def create_modal(
    payload: BroadcastModalCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_broadcast_access),
) -> BroadcastModalRead:
    """Create a new broadcast modal (superadmin only)."""
    modal = BroadcastModal(
        title=payload.title,
        body=payload.body,
        theme=payload.theme,
        title_size=payload.title_size,
        modal_size=payload.modal_size,
        icon=payload.icon,
        text_align=payload.text_align,
        show_glow=payload.show_glow,
        animation=payload.animation,
        image_url=payload.image_url,
        image_fit=payload.image_fit,
        effect=payload.effect,
        badge_label=payload.badge_label,
        close_button_label=payload.close_button_label,
        created_by_id=current_user.id,
    )
    session.add(modal)
    session.commit()
    session.refresh(modal)
    return _to_read(modal)


@router.put("/{modal_id}", response_model=BroadcastModalRead)
def update_modal(
    modal_id: uuid.UUID,
    payload: BroadcastModalUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_broadcast_access),
) -> BroadcastModalRead:
    """Update title/body of a modal (superadmin only)."""
    modal = session.get(BroadcastModal, modal_id)
    if not modal:
        raise HTTPException(status_code=404, detail="Broadcast modal not found")
    if payload.title is not None:
        modal.title = payload.title
    if payload.body is not None:
        modal.body = payload.body
    if payload.theme is not None:
        modal.theme = payload.theme
    if payload.title_size is not None:
        modal.title_size = payload.title_size
    if payload.modal_size is not None:
        modal.modal_size = payload.modal_size
    if payload.icon is not None:
        modal.icon = payload.icon
    if payload.text_align is not None:
        modal.text_align = payload.text_align
    if payload.show_glow is not None:
        modal.show_glow = payload.show_glow
    if payload.animation is not None:
        modal.animation = payload.animation
    if payload.image_url is not None:
        modal.image_url = payload.image_url
    if payload.image_fit is not None:
        modal.image_fit = payload.image_fit
    if payload.effect is not None:
        modal.effect = payload.effect
    if payload.badge_label is not None:
        modal.badge_label = payload.badge_label
    if payload.close_button_label is not None:
        modal.close_button_label = payload.close_button_label
    modal.updated_at = datetime.utcnow()
    session.add(modal)
    session.commit()
    session.refresh(modal)
    return _to_read(modal)


@router.post("/{modal_id}/publish", response_model=BroadcastModalRead)
def publish_modal(
    modal_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_broadcast_access),
) -> BroadcastModalRead:
    """Publish a modal, unpublishing any currently active one (superadmin only)."""
    modal = session.get(BroadcastModal, modal_id)
    if not modal:
        raise HTTPException(status_code=404, detail="Broadcast modal not found")

    # Unpublish all others
    others = session.exec(
        select(BroadcastModal).where(
            BroadcastModal.is_published == True,  # noqa: E712
            BroadcastModal.id != modal_id,
        )
    ).all()
    for other in others:
        other.is_published = False
        other.updated_at = datetime.utcnow()
        session.add(other)

    modal.is_published = True
    modal.published_at = datetime.utcnow()
    modal.updated_at = datetime.utcnow()
    session.add(modal)
    session.commit()
    session.refresh(modal)
    return _to_read(modal)


@router.post("/{modal_id}/unpublish", response_model=BroadcastModalRead)
def unpublish_modal(
    modal_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_broadcast_access),
) -> BroadcastModalRead:
    """Unpublish/deactivate a modal (superadmin only)."""
    modal = session.get(BroadcastModal, modal_id)
    if not modal:
        raise HTTPException(status_code=404, detail="Broadcast modal not found")
    modal.is_published = False
    modal.updated_at = datetime.utcnow()
    session.add(modal)
    session.commit()
    session.refresh(modal)
    return _to_read(modal)


@router.delete("/{modal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_modal(
    modal_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(require_broadcast_access),
) -> None:
    """Delete a broadcast modal (superadmin only)."""
    modal = session.get(BroadcastModal, modal_id)
    if not modal:
        raise HTTPException(status_code=404, detail="Broadcast modal not found")
    session.delete(modal)
    session.commit()
