"""Permission and thread-lookup helpers for internal team messaging.

Plain functions (not FastAPI Depends chains) since the "other party" or thread being
checked is a path/body parameter resolved inside the route body — same style as the
ad-hoc scope helpers already used in app/routers/users.py.
"""

import uuid

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.models.department import Department
from app.models.message import MessageThread, MessageThreadKind, MessageThreadParticipant
from app.models.user import User, UserRole


def dept_scope(user: User) -> set[str]:
    """A user's department scope as a set of UUID strings."""
    return set(user.get_department_ids_list())


def can_dm(user_a: User, user_b: User) -> bool:
    """Two users can DM each other iff they share at least one department.
    Pairwise only — a multi-department user does not bridge two otherwise-unconnected
    single-department users. Superadmin bypasses this entirely."""
    if user_a.role == UserRole.SUPERADMIN or user_b.role == UserRole.SUPERADMIN:
        return True
    return bool(dept_scope(user_a) & dept_scope(user_b))


def can_form_group(members: list[User]) -> bool:
    """A group can form iff every non-superadmin member shares at least one
    department in common with every other non-superadmin member."""
    non_super = [m for m in members if m.role != UserRole.SUPERADMIN]
    if len(non_super) <= 1:
        return True
    common = dept_scope(non_super[0])
    for m in non_super[1:]:
        common &= dept_scope(m)
        if not common:
            return False
    return True


def can_access_channel(user: User, department_id: uuid.UUID) -> bool:
    if user.role == UserRole.SUPERADMIN:
        return True
    return str(department_id) in dept_scope(user)


def user_department_scope_ids(user: User, session: Session) -> list[uuid.UUID]:
    """Department ids a user can see channels for. Superadmin sees every active department."""
    if user.role == UserRole.SUPERADMIN:
        depts = session.exec(select(Department).where(Department.is_active == True)).all()  # noqa: E712
        return [d.id for d in depts]
    ids = []
    for s in user.get_department_ids_list():
        try:
            ids.append(uuid.UUID(s))
        except ValueError:
            continue
    return ids


def get_or_create_dm_thread(session: Session, user_a_id: uuid.UUID, user_b_id: uuid.UUID) -> MessageThread:
    """Find the existing 1:1 thread between these two users, or create it."""
    a_thread_ids = {
        p.thread_id
        for p in session.exec(
            select(MessageThreadParticipant).where(MessageThreadParticipant.user_id == user_a_id)
        ).all()
    }
    b_thread_ids = {
        p.thread_id
        for p in session.exec(
            select(MessageThreadParticipant).where(MessageThreadParticipant.user_id == user_b_id)
        ).all()
    }
    for tid in a_thread_ids & b_thread_ids:
        thread = session.get(MessageThread, tid)
        if thread and thread.kind == MessageThreadKind.DM:
            return thread

    thread = MessageThread(kind=MessageThreadKind.DM, created_by=user_a_id)
    session.add(thread)
    session.flush()
    session.add(MessageThreadParticipant(thread_id=thread.id, user_id=user_a_id))
    session.add(MessageThreadParticipant(thread_id=thread.id, user_id=user_b_id))
    session.commit()
    session.refresh(thread)
    return thread


def get_or_create_channel_thread(session: Session, department_id: uuid.UUID) -> MessageThread:
    """Find the department's channel thread, or create it (one per department)."""
    existing = session.exec(
        select(MessageThread).where(
            MessageThread.kind == MessageThreadKind.CHANNEL,
            MessageThread.department_id == department_id,
        )
    ).first()
    if existing:
        return existing

    thread = MessageThread(kind=MessageThreadKind.CHANNEL, department_id=department_id)
    session.add(thread)
    try:
        session.commit()
    except IntegrityError:
        # Lost a race with another request creating the same channel — reuse theirs.
        session.rollback()
        existing = session.exec(
            select(MessageThread).where(
                MessageThread.kind == MessageThreadKind.CHANNEL,
                MessageThread.department_id == department_id,
            )
        ).first()
        if existing:
            return existing
        raise
    session.refresh(thread)
    return thread
