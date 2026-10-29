import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import get_current_user, require_faculty
from ..database import get_db
from ..models import MentorNote, PredictionHistory, Student
from ..schemas import NoteIn, NoteOut, PredictionOut, UserOut

router = APIRouter(prefix="/students", tags=["students"])


def _latest_by_student(db: Session) -> dict[int, PredictionHistory]:
    latest = (
        select(PredictionHistory.student_id, func.max(PredictionHistory.id).label("pid"))
        .group_by(PredictionHistory.student_id).subquery()
    )
    rows = db.scalars(select(PredictionHistory).join(latest, PredictionHistory.id == latest.c.pid)).all()
    return {r.student_id: r for r in rows}


def _summary(s: Student, p: PredictionHistory | None) -> dict:
    return {
        "id": s.id, "name": s.name, "email": s.email, "roll_no": s.roll_no, "branch": s.branch, "year": s.year,
        "predictions": len(s.predictions),
        "latest": None if p is None else {
            "performance_score": p.performance_score, "performance_level": p.performance_level,
            "placement_probability": p.placement_probability, "readiness_index": p.readiness_index,
            "risk_flag": p.risk_flag, "skill_gaps": [g["gap"] for g in p.report.get("skill_gaps", [])],
            "created_at": p.created_at,
        },
    }


@router.get("/all")
def all_students(risk: str | None = Query(None, pattern="^(High|Medium|Low|None)$"),
                 q: str | None = None, _: Student = Depends(require_faculty), db: Session = Depends(get_db)):
    latest = _latest_by_student(db)
    stmt = select(Student).where(Student.role == "student").order_by(Student.name)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(func.lower(Student.name).like(like) | func.lower(Student.email).like(like)
                          | func.lower(func.coalesce(Student.roll_no, "")).like(like))
    out = [_summary(s, latest.get(s.id)) for s in db.scalars(stmt).all()]
    if risk == "None":
        out = [o for o in out if o["latest"] is None]
    elif risk:
        out = [o for o in out if o["latest"] and o["latest"]["risk_flag"] == risk]
    return out


@router.get("/stats")
def stats(_: Student = Depends(require_faculty), db: Session = Depends(get_db)):
    latest = list(_latest_by_student(db).values())
    total = db.scalar(select(func.count()).select_from(Student).where(Student.role == "student"))
    gaps: dict[str, int] = {}
    for p in latest:
        for g in p.report.get("skill_gaps", []):
            gaps[g["gap"]] = gaps.get(g["gap"], 0) + 1
    levels: dict[str, int] = {}
    for p in latest:
        levels[p.performance_level] = levels.get(p.performance_level, 0) + 1
    n = len(latest)
    return {
        "total_students": total,
        "assessed_students": n,
        "total_predictions": db.scalar(select(func.count()).select_from(PredictionHistory)),
        "likely_placed": sum(p.placement_probability >= 0.55 for p in latest),
        "avg_probability": round(sum(p.placement_probability for p in latest) / n, 4) if n else 0,
        "avg_performance": round(sum(p.performance_score for p in latest) / n, 2) if n else 0,
        "risk": {k: sum(p.risk_flag == k for p in latest) for k in ("High", "Medium", "Low")},
        "performance_levels": levels,
        "common_gaps": sorted(({"gap": k, "count": v} for k, v in gaps.items()), key=lambda d: -d["count"]),
    }


@router.get("/export.csv")
def export_csv(_: Student = Depends(require_faculty), db: Session = Depends(get_db)):
    latest = _latest_by_student(db)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "email", "roll_no", "branch", "year", "performance_score", "performance_level",
                "placement_probability", "readiness_index", "risk_flag", "skill_gaps", "assessed_at"])
    for s in db.scalars(select(Student).where(Student.role == "student").order_by(Student.name)).all():
        p = latest.get(s.id)
        w.writerow([s.name, s.email, s.roll_no or "", s.branch or "", s.year or ""] + (
            [p.performance_score, p.performance_level, p.placement_probability, p.readiness_index, p.risk_flag,
             "; ".join(g["gap"] for g in p.report.get("skill_gaps", [])), p.created_at.isoformat()]
            if p else ["", "", "", "", "", "", ""]))
    name = f"placement_report_{datetime.now():%Y%m%d}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/{student_id}/data")
def student_data(student_id: int, user: Student = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "faculty" and user.id != student_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    s = db.get(Student, student_id)
    if s is None or s.role != "student":
        raise HTTPException(status_code=404, detail="Student not found")
    return {
        "student": UserOut.model_validate(s),
        "history": [PredictionOut.model_validate(p) for p in s.predictions],
        "notes": [_note(n) for n in s.notes],
    }


def _note(n: MentorNote) -> NoteOut:
    return NoteOut(id=n.id, text=n.text, author_name=n.author.name, created_at=n.created_at)


@router.get("/{student_id}/notes", response_model=list[NoteOut])
def list_notes(student_id: int, user: Student = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "faculty" and user.id != student_id:
        raise HTTPException(status_code=403, detail="Not allowed")
    s = db.get(Student, student_id)
    if s is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return [_note(n) for n in s.notes]


@router.post("/{student_id}/notes", response_model=NoteOut, status_code=201)
def add_note(student_id: int, body: NoteIn, user: Student = Depends(require_faculty), db: Session = Depends(get_db)):
    s = db.get(Student, student_id)
    if s is None or s.role != "student":
        raise HTTPException(status_code=404, detail="Student not found")
    note = MentorNote(student_id=s.id, author_id=user.id, text=body.text)
    db.add(note)
    db.commit()
    db.refresh(note)
    return _note(note)


@router.delete("/{student_id}/notes/{note_id}", status_code=204)
def delete_note(student_id: int, note_id: int, user: Student = Depends(require_faculty),
                db: Session = Depends(get_db)):
    note = db.get(MentorNote, note_id)
    if note is None or note.student_id != student_id:
        raise HTTPException(status_code=404, detail="Note not found")
    db.delete(note)
    db.commit()
