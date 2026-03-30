from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.database import create_db_and_tables

# Import all models so SQLModel registers them
from app.models import Candidate, ResumeProfile, Company, BusinessDeveloper, Interview, User  # noqa: F401

from app.routers import candidates, resume_profiles, companies, interviews, dashboard, business_developers, auth

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create tables. Shutdown: cleanup."""
    create_db_and_tables()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Interview analytics and tracking portal for RizViz",
    version="1.0.0",
    lifespan=lifespan,
)

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
app.include_router(dashboard.router)


@app.api_route("/", methods=["GET", "HEAD"], tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "version": "1.0.0",
    }
