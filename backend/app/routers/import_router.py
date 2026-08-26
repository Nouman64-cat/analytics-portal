"""Async bulk-import feature for the Interviews page — upload an .xlsx, process it in the
background, poll for progress/results. See the import plan doc for the full design rationale
(column mapping, idempotency keys, skip-vs-auto-correct rules)."""

import io
import json
import logging
import os
import uuid
from datetime import date, datetime

import openpyxl
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from sqlmodel import Session, func, select

from app.config import get_settings
from app.database import get_session
from app.deps import get_current_user
from app.import_utils import (
    ParsedRow,
    SHEET_READERS,
    dedup_key,
    get_or_create_business_developer,
    get_or_create_candidate,
    get_or_create_company,
    get_or_create_resume_profile,
    load_business_developer_cache,
    load_candidate_cache,
    load_company_cache,
    load_resume_profile_cache,
)
from app.lead_thread_utils import ensure_lead_thread
from app.models.department import Department
from app.models.import_job import ImportJob
from app.models.interview import Interview
from app.models.user import User, UserRole
from app.schemas.import_job import ImportJobRead

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/interviews/import",
    tags=["Interviews Import"],
    dependencies=[Depends(get_current_user)],
)

# Bulk import can create/modify hundreds of records at once — restricted beyond normal write
# access to the two roles with org/department-wide oversight.
_IMPORT_ALLOWED_ROLES = {UserRole.SUPERADMIN, UserRole.DEPT_LEAD}


def _assert_import_access(user: User) -> None:
    if user.role not in _IMPORT_ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins and department leads can import interviews.",
        )


def _job_to_read(job: ImportJob) -> ImportJobRead:
    return ImportJobRead(
        id=job.id,
        status=job.status,
        filename=job.filename,
        total_rows=job.total_rows,
        processed_rows=job.processed_rows,
        imported_count=job.imported_count,
        updated_count=job.updated_count,
        skipped_count=job.skipped_count,
        error_count=job.error_count,
        results=json.loads(job.results) if job.results else [],
        summary=json.loads(job.summary) if job.summary else {},
        error_message=job.error_message,
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.post("/", response_model=ImportJobRead, status_code=status.HTTP_202_ACCEPTED)
def start_import(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    department_mapping: str = Form(...),
    session: Session = Depends(get_session),
    settings=Depends(get_settings),
    current_user: User = Depends(get_current_user),
):
    """Kick off a background import job and return immediately with its id for polling."""
    _assert_import_access(current_user)

    if not (file.filename or "").lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are accepted")

    try:
        file.file.seek(0, os.SEEK_END)
        upload_size = file.file.tell()
        file.file.seek(0)
    except Exception:
        upload_size = None
    if upload_size is not None and upload_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is too large (limit {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB)",
        )

    try:
        mapping = json.loads(department_mapping)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="department_mapping must be valid JSON")

    for sheet in SHEET_READERS:
        dept_id_raw = mapping.get(sheet)
        if not dept_id_raw:
            raise HTTPException(status_code=400, detail=f"A department must be selected for sheet '{sheet}'")
        try:
            dept_uuid = uuid.UUID(str(dept_id_raw))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid department id for sheet '{sheet}'")
        if not session.get(Department, dept_uuid):
            raise HTTPException(status_code=400, detail=f"Department not found for sheet '{sheet}'")

    running = session.exec(
        select(ImportJob).where(ImportJob.status.in_(["pending", "processing"])).limit(1)
    ).first()
    if running:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An import is already running. Wait for it to finish before starting another.",
        )

    # UploadFile's underlying temp file doesn't survive past this response — BackgroundTasks
    # runs after the response is sent — so the bytes must be read into memory now.
    raw_bytes = file.file.read()

    job = ImportJob(
        status="pending",
        filename=file.filename,
        department_mapping=json.dumps(mapping),
        created_by_user_id=current_user.id,
    )
    session.add(job)
    session.commit()
    session.refresh(job)

    background_tasks.add_task(_run_import_job, job.id, raw_bytes, mapping)
    return _job_to_read(job)


@router.get("/{job_id}", response_model=ImportJobRead)
def get_import_status(
    job_id: uuid.UUID,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    _assert_import_access(current_user)
    job = session.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return _job_to_read(job)


# ─── Background worker ──────────────────────────────────────────────────────


def _run_import_job(job_id: uuid.UUID, raw_bytes: bytes, department_mapping: dict) -> None:
    """BackgroundTasks entrypoint — runs after the response is sent, so it opens its own DB
    session (the request-scoped one is gone by then), same pattern as
    `_highlight_interview_document_in_background` in routers/interviews.py."""
    from app.database import engine

    with Session(engine) as session:
        job = session.get(ImportJob, job_id)
        if not job:
            return
        job.status = "processing"
        job.updated_at = datetime.utcnow()
        session.add(job)
        session.commit()
        try:
            _do_import(session, job, raw_bytes, department_mapping)
            job.status = "completed"
        except Exception:
            logger.exception("Import job %s failed", job_id)
            job.status = "failed"
            job.error_message = (
                "Import failed unexpectedly — see server logs. Rows already committed remain imported."
            )
        finally:
            job.completed_at = datetime.utcnow()
            job.updated_at = datetime.utcnow()
            session.add(job)
            session.commit()


def _do_import(session: Session, job: ImportJob, raw_bytes: bytes, department_mapping: dict) -> None:
    wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
    dept_ids = {sheet: uuid.UUID(str(department_mapping[sheet])) for sheet in SHEET_READERS}

    # Up-front counting pass so the progress bar's denominator is accurate from the first poll.
    total = 0
    for sheet_name, reader in SHEET_READERS.items():
        total += sum(1 for _ in reader(wb[sheet_name]))
    job.total_rows = total
    session.add(job)
    session.commit()

    caches = {
        "company": load_company_cache(session),
        "candidate": load_candidate_cache(session),
        "profile": load_resume_profile_cache(session),
        "bd": load_business_developer_cache(session),
    }
    initial_counts = {k: len(v) for k, v in caches.items()}
    pair_thread_map: dict[tuple, uuid.UUID] = {}
    pair_latest: dict[tuple, ParsedRow] = {}
    job_results: list[dict] = []

    for sheet_name, reader in SHEET_READERS.items():
        dept_id = dept_ids[sheet_name]
        seen_keys: set = set()
        for row in reader(wb[sheet_name]):
            try:
                _import_one_row(session, job, row, dept_id, caches, pair_thread_map, pair_latest, seen_keys, job_results)
                session.commit()
            except Exception:
                session.rollback()
                logger.exception(
                    "Import job %s: unexpected error on %s row %s", job.id, row.sheet, row.excel_row
                )
                job.error_count += 1
                job_results.append(
                    {"sheet": row.sheet, "row": row.excel_row, "level": "error", "reason": "unexpected error — see server logs"}
                )

            job.processed_rows += 1
            session.add(job)
            session.commit()

    # Finalization: set each (company, candidate) pipeline's lead outcome from the row with the
    # latest interview_date. Never touches an override that isn't "dead"/"converted" in the
    # sheet — a stale "Active" snapshot must not silently undo a human's later dropped/rejected
    # override made in the live app.
    for pair_key, row in pair_latest.items():
        thread_id = pair_thread_map[pair_key]
        lead = ensure_lead_thread(session, thread_id)
        status_l = (row.status_raw or "").strip().lower()
        if status_l == "dead":
            lead.outcome_override = "dead"
        elif status_l == "converted":
            lead.is_converted_override = True
        lead.updated_at = datetime.utcnow()
        session.add(lead)
    session.commit()

    capped = job_results[:500]
    if len(job_results) > 500:
        capped.append(
            {"sheet": "*", "row": 0, "level": "info", "reason": f"{len(job_results) - 500} more entries — see server logs"}
        )
    job.results = json.dumps(capped)
    job.summary = json.dumps(
        {
            "companies_created": len(caches["company"]) - initial_counts["company"],
            "candidates_created": len(caches["candidate"]) - initial_counts["candidate"],
            "resume_profiles_created": len(caches["profile"]) - initial_counts["profile"],
            "business_developers_created": len(caches["bd"]) - initial_counts["bd"],
        }
    )
    session.add(job)
    session.commit()


def _import_one_row(
    session: Session,
    job: ImportJob,
    row: ParsedRow,
    dept_id: uuid.UUID,
    caches: dict,
    pair_thread_map: dict[tuple, uuid.UUID],
    pair_latest: dict[tuple, ParsedRow],
    seen_keys: set,
    job_results: list[dict],
) -> None:
    def _skip(reason: str) -> None:
        job.skipped_count += 1
        job_results.append({"sheet": row.sheet, "row": row.excel_row, "level": "skipped", "reason": reason})
        logger.warning("Import job %s: skipped %s row %s — %s", job.id, row.sheet, row.excel_row, reason)

    if not row.company_name:
        return _skip("missing company name")
    if not row.candidate_name:
        return _skip("missing candidate name")
    if row.interview_date is None:
        return _skip(row.date_error or "missing date")

    key = dedup_key(row)
    if key in seen_keys:
        return _skip("duplicate of an earlier row in this file")
    seen_keys.add(key)

    company = get_or_create_company(session, caches["company"], row.company_name)
    candidate = get_or_create_candidate(session, caches["candidate"], row.candidate_name, dept_id)
    profile = get_or_create_resume_profile(session, caches["profile"], row.candidate_name, dept_id)
    bd = get_or_create_business_developer(session, caches["bd"], row.bd_name) if row.bd_name else None

    # Pipeline key: (company, candidate) — NOT company alone, since the REST endpoint's
    # "one lead per company" guard is a UI-level rule that doesn't hold for bulk data (the same
    # company legitimately appears for multiple different candidates).
    pair_key = (company.id, candidate.id)
    thread_id = pair_thread_map.get(pair_key)
    if thread_id is None:
        existing_tid = session.exec(
            select(Interview.thread_id)
            .where(Interview.company_id == company.id, Interview.candidate_id == candidate.id)
            .limit(1)
        ).first()
        thread_id = existing_tid or uuid.uuid4()
        pair_thread_map[pair_key] = thread_id

    role_val = row.position or "Unspecified Role"
    round_key = row.round_label.strip().lower()

    existing = session.exec(
        select(Interview).where(
            Interview.thread_id == thread_id,
            func.lower(Interview.round) == round_key,
            Interview.interview_date == row.interview_date,
            func.lower(Interview.role) == role_val.strip().lower(),
        )
    ).first()

    if existing:
        changed = False
        if not existing.interviewer and row.interviewer:
            existing.interviewer = row.interviewer
            changed = True
        if existing.time_est is None and row.time_est is not None:
            existing.time_est = row.time_est
            changed = True
        if not existing.feedback and row.dev_feedback:
            existing.feedback = row.dev_feedback
            changed = True
        if not existing.recruiter_feedback and row.client_feedback:
            existing.recruiter_feedback = row.client_feedback
            changed = True
        if not existing.bd_id and bd:
            existing.bd_id = bd.id
            changed = True
        if changed:
            existing.updated_at = datetime.utcnow()
            session.add(existing)
        job.updated_count += 1
    else:
        interview = Interview(
            thread_id=thread_id,
            company_id=company.id,
            candidate_id=candidate.id,
            resume_profile_id=profile.id,
            role=role_val,
            round=row.round_label,
            interview_date=row.interview_date,
            time_est=row.time_est,
            interviewer=row.interviewer,
            feedback=row.dev_feedback,
            recruiter_feedback=row.client_feedback,
            bd_id=bd.id if bd else None,
            department_id=dept_id,
            created_by_user_id=job.created_by_user_id,
        )
        session.add(interview)
        ensure_lead_thread(session, thread_id)
        job.imported_count += 1

    prev = pair_latest.get(pair_key)
    if prev is None or (row.interview_date or date.min) >= (prev.interview_date or date.min):
        pair_latest[pair_key] = row
