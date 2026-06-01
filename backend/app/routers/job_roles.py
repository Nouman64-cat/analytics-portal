import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select
from app.database import get_session
from app.deps import get_current_user, assert_write_access
from app.models.job_role import JobRole
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/job-roles",
    tags=["Job Roles"],
    dependencies=[Depends(get_current_user)],
)


class JobRoleRead(BaseModel):
    id: str
    name: str


class JobRoleCreate(BaseModel):
    name: str


@router.get("/", response_model=list[JobRoleRead])
def list_job_roles(session: Session = Depends(get_session)):
    roles = session.exec(select(JobRole).order_by(JobRole.name)).all()
    return [JobRoleRead(id=str(r.id), name=r.name) for r in roles]


@router.post("/", response_model=JobRoleRead)
def create_job_role(
    body: JobRoleCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    assert_write_access(current_user)
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    existing = session.exec(
        select(JobRole).where(JobRole.name == name)
    ).first()
    if existing:
        return JobRoleRead(id=str(existing.id), name=existing.name)
    role = JobRole(name=name)
    session.add(role)
    session.commit()
    session.refresh(role)
    return JobRoleRead(id=str(role.id), name=role.name)
