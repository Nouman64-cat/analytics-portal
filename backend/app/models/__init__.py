# app/models/__init__.py
from app.models.candidate import Candidate
from app.models.resume_profile import ResumeProfile
from app.models.company import Company
from app.models.business_developer import BusinessDeveloper
from app.models.interview import Interview

__all__ = ["Candidate", "ResumeProfile", "Company", "BusinessDeveloper", "Interview"]
