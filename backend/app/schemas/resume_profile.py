import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Optional


class ResumeProfileCreate(BaseModel):
    name: str
    is_active: bool = True
    department_id: Optional[uuid.UUID] = None
    bd_id: Optional[uuid.UUID] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_url: Optional[str] = None
    location: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None
    ssn_last4: Optional[str] = None
    nearby_locations: Optional[str] = None
    visa_status: Optional[str] = None
    moved_to_us_year: Optional[int] = None
    greencard_or_citizenship_year: Optional[int] = None
    education_degree: Optional[str] = None
    education_start_year: Optional[int] = None
    education_end_year: Optional[int] = None


class ResumeProfileUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    department_id: Optional[uuid.UUID] = None
    bd_id: Optional[uuid.UUID] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_url: Optional[str] = None
    location: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None
    ssn_last4: Optional[str] = None
    nearby_locations: Optional[str] = None
    visa_status: Optional[str] = None
    moved_to_us_year: Optional[int] = None
    greencard_or_citizenship_year: Optional[int] = None
    education_degree: Optional[str] = None
    education_start_year: Optional[int] = None
    education_end_year: Optional[int] = None


class ResumeProfileRead(BaseModel):
    id: uuid.UUID
    name: str
    is_active: bool
    department_id: Optional[uuid.UUID] = None
    department_name: Optional[str] = None
    bd_id: Optional[uuid.UUID] = None
    bd_name: Optional[str] = None
    linkedin_url: Optional[str] = None
    github_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    resume_url: Optional[str] = None
    location: Optional[str] = None
    dob: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    zip_code: Optional[str] = None
    ssn_last4: Optional[str] = None
    nearby_locations: Optional[str] = None
    visa_status: Optional[str] = None
    moved_to_us_year: Optional[int] = None
    greencard_or_citizenship_year: Optional[int] = None
    education_degree: Optional[str] = None
    education_start_year: Optional[int] = None
    education_end_year: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
