import asyncio
from starlette.status import HTTP_413_REQUEST_ENTITY_TOO_LARGE
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi.responses import JSONResponse
from fastapi import Request, HTTPException
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_db_and_tables
from app.reminder_worker import run_reminder_worker

# Import all models so SQLModel registers them
from app.models import Candidate, ResumeProfile, Company, BusinessDeveloper, Interview, InterviewReminderLog, ActivityLog, User  # noqa: F401

from app.routers import candidates, resume_profiles, companies, interviews, dashboard, business_developers, auth, activities, users

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables. Shutdown: cleanup."""
    create_db_and_tables()
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
app.include_router(candidates.router)
app.include_router(resume_profiles.router)
app.include_router(companies.router)
app.include_router(interviews.router)
app.include_router(business_developers.router)
app.include_router(activities.router)
app.include_router(dashboard.router)
app.include_router(users.router)


@app.api_route("/", methods=["GET", "HEAD"], tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": "1.0.0",
    }
