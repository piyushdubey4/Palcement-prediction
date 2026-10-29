from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Student(Base):
    """A user account. Students also carry their latest academic and skill profile."""

    __tablename__ = "students"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="student")
    roll_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    branch: Mapped[str | None] = mapped_column(String(80), nullable=True)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_role: Mapped[str | None] = mapped_column(String(120), nullable=True)
    profile: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    predictions: Mapped[list["PredictionHistory"]] = relationship(
        back_populates="student", cascade="all, delete-orphan", order_by="PredictionHistory.created_at.desc()"
    )
    notes: Mapped[list["MentorNote"]] = relationship(
        back_populates="student", cascade="all, delete-orphan",
        foreign_keys="MentorNote.student_id", order_by="MentorNote.created_at.desc()",
    )


class PredictionHistory(Base):
    __tablename__ = "prediction_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    inputs: Mapped[dict] = mapped_column(JSON)
    performance_score: Mapped[float] = mapped_column(Float)
    performance_level: Mapped[str] = mapped_column(String(20))
    placement_probability: Mapped[float] = mapped_column(Float)
    readiness_index: Mapped[float] = mapped_column(Float)
    risk_flag: Mapped[str] = mapped_column(String(10))
    report: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    student: Mapped[Student] = relationship(back_populates="predictions")


class MentorNote(Base):
    __tablename__ = "mentor_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("students.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    student: Mapped[Student] = relationship(back_populates="notes", foreign_keys=[student_id])
    author: Mapped[Student] = relationship(foreign_keys=[author_id])
