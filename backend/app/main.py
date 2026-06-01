import asyncio
import logging
from starlette.status import HTTP_413_REQUEST_ENTITY_TOO_LARGE
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
from fastapi import Request, HTTPException
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

from app.config import get_settings
from app.database import create_db_and_tables
from app.reminder_worker import run_reminder_worker
from migrate import migrate

# Import all models so SQLModel registers them
from app.models import Department, Candidate, ResumeProfile, Company, BusinessDeveloper, Interview, InterviewReminderLog, ActivityLog, User, LeadThread, BusyDay, UnresponsiveFollowUpLog, NotificationRead, JobRole  # noqa: F401

from app.routers import (
    candidates,
    resume_profiles,
    companies,
    interviews,
    leads,
    dashboard,
    business_developers,
    auth,
    activities,
    users,
    backup,
    busy_days,
    chat,
    notifications,
)
from app.routers import departments
from app.routers import debug
from app.routers import job_roles

settings = get_settings()


def _configure_s3_cors(settings) -> None:
    """Apply CORS policy to the S3 bucket so browsers can PUT presigned URLs directly."""
    if not settings.AWS_S3_BUCKET_NAME:
        return
    key_id = settings.effective_aws_access_key_id
    secret = settings.effective_aws_secret_access_key
    if not key_id or not secret:
        return
    try:
        import boto3
        s3 = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            aws_access_key_id=key_id,
            aws_secret_access_key=secret,
        )
        origins = settings.cors_origins_list or ["*"]
        s3.put_bucket_cors(
            Bucket=settings.AWS_S3_BUCKET_NAME,
            CORSConfiguration={
                "CORSRules": [
                    {
                        "AllowedOrigins": origins,
                        "AllowedMethods": ["PUT", "GET", "HEAD"],
                        "AllowedHeaders": ["Content-Type", "Authorization"],
                        "MaxAgeSeconds": 3600,
                    }
                ]
            },
        )
        logging.getLogger(__name__).info(
            "S3 CORS configured for bucket %s (origins: %s)",
            settings.AWS_S3_BUCKET_NAME,
            origins,
        )
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "Could not configure S3 CORS (uploads will fall back to backend proxy): %s", exc
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables, configure S3 CORS. Shutdown: cleanup."""
    create_db_and_tables()
    migrate()
    _configure_s3_cors(settings)
    stop_event = asyncio.Event()
    worker_task = asyncio.create_task(run_reminder_worker(stop_event, settings))
    yield
    stop_event.set()
    await worker_task


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_upload_size: int = 0):
        super().__init__(app)
        self.max_upload_size = max_upload_size

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.max_upload_size:
                    raise HTTPException(
                        status_code=HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"Request body too large (limit {self.max_upload_size // (1024*1024)}MB)",
                    )
            except ValueError:
                # if content-length is not an integer; skip explicit check
                pass

        response = await call_next(request)
        return response


app = FastAPI(
    title=settings.APP_NAME,
    description="Interview analytics and tracking portal for RizViz",
    version="1.0.0",
    lifespan=lifespan,
)

# enforce max request body
app.add_middleware(RequestSizeLimitMiddleware,
                   max_upload_size=settings.MAX_UPLOAD_SIZE)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(departments.router)
app.include_router(candidates.router)
app.include_router(resume_profiles.router)
app.include_router(companies.router)
app.include_router(interviews.router)
app.include_router(leads.router)
app.include_router(business_developers.router)
app.include_router(activities.router)
app.include_router(dashboard.router)
app.include_router(users.router)
app.include_router(backup.router)
app.include_router(busy_days.router)
app.include_router(chat.router)
app.include_router(notifications.router)
app.include_router(debug.router)
app.include_router(job_roles.router)


@app.api_route("/", methods=["GET", "HEAD"], tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": "1.0.0",
    }
