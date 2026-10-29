from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=72)
    role: Literal["student", "faculty"] = "student"
    faculty_code: str | None = None
    roll_no: str | None = Field(default=None, max_length=40)
    branch: str | None = Field(default=None, max_length=80)
    year: int | None = Field(default=None, ge=1, le=5)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: str
    roll_no: str | None = None
    branch: str | None = None
    year: int | None = None
    target_role: str | None = None
    profile: dict | None = None
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    roll_no: str | None = Field(default=None, max_length=40)
    branch: str | None = Field(default=None, max_length=80)
    year: int | None = Field(default=None, ge=1, le=5)
    target_role: str | None = Field(default=None, max_length=120)


class StudentInput(BaseModel):
    """Academic and skill data entered on the prediction form."""

    cgpa: float = Field(ge=0, le=10, description="Cumulative GPA on a 10-point scale")
    attendance: float = Field(ge=0, le=100, description="Attendance percentage")
    sem1: float = Field(ge=0, le=10, description="Semester 1 SGPA")
    sem2: float = Field(ge=0, le=10)
    sem3: float = Field(ge=0, le=10)
    sem4: float = Field(ge=0, le=10)
    aptitude: float = Field(ge=0, le=100, description="Aptitude test score (0-100)")
    coding: float = Field(ge=0, le=100)
    dsa: float = Field(ge=0, le=100)
    communication: float = Field(ge=0, le=100)
    internships: int = Field(ge=0, le=20)
    projects: int = Field(ge=0, le=50)
    certifications: int = Field(ge=0, le=50)
    backlogs: int = Field(default=0, ge=0, le=30)


class CampusInput(BaseModel):
    """Inputs for the real-data benchmark model (Jain University campus recruitment)."""

    ssc_p: float = Field(ge=0, le=100, description="Class 10 percentage")
    hsc_p: float = Field(ge=0, le=100, description="Class 12 percentage")
    degree_p: float = Field(ge=0, le=100, description="Undergraduate degree percentage")
    etest_p: float = Field(ge=0, le=100, description="Employability test percentage")
    mba_p: float = Field(ge=0, le=100, description="Post-graduation (MBA) percentage")
    workex: bool
    specialisation: Literal["Mkt&Fin", "Mkt&HR"]


class PredictionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_id: int
    inputs: dict
    performance_score: float
    performance_level: str
    placement_probability: float
    readiness_index: float
    risk_flag: str
    report: dict
    created_at: datetime


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)

    @field_validator("text")
    @classmethod
    def strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Note cannot be empty")
        return v


class NoteOut(BaseModel):
    id: int
    text: str
    author_name: str
    created_at: datetime
