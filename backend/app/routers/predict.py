from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..ml import predictor
from ..models import PredictionHistory, Student
from ..schemas import CampusInput, PredictionOut, StudentInput

router = APIRouter(prefix="/predict", tags=["predict"])


def _features(body: StudentInput) -> predictor.StudentFeatures:
    return predictor.StudentFeatures(**body.model_dump())


@router.post("/performance")
def performance(body: StudentInput, _: Student = Depends(get_current_user)):
    score, level = predictor.performance(_features(body))
    return {"performance_score": score, "performance_level": level,
            "formula": "0.40 x CGPA x 10 + 0.30 x Attendance + 0.30 x Semester avg x 10"}


@router.post("/placement")
def placement(body: StudentInput, _: Student = Depends(get_current_user)):
    s = _features(body)
    prob, source = predictor.placement_probability(s)
    return {
        "placement_probability": round(prob, 4),
        "placement_status": "Likely to be placed" if prob >= predictor.PLACEMENT_THRESHOLD else "Needs improvement",
        "threshold": predictor.PLACEMENT_THRESHOLD,
        "prediction_source": source,
        "mapped_features": predictor.map_features(s),
    }


@router.post("/simulate")
def simulate(body: StudentInput, _: Student = Depends(get_current_user)):
    """What-if simulator: a full report that is not saved to history."""
    return predictor.full_report(_features(body))


@router.post("/full-report", response_model=PredictionOut, status_code=201)
def full_report(body: StudentInput, user: Student = Depends(get_current_user), db: Session = Depends(get_db)):
    report = predictor.full_report(_features(body))
    row = PredictionHistory(
        student_id=user.id,
        inputs=body.model_dump(),
        performance_score=report["performance_score"],
        performance_level=report["performance_level"],
        placement_probability=report["placement_probability"],
        readiness_index=report["readiness_index"],
        risk_flag=report["risk_flag"],
        report=report,
    )
    user.profile = body.model_dump()  # latest inputs pre-fill the form next time
    db.add(row)
    db.commit()
    return row


@router.get("/history", response_model=list[PredictionOut])
def my_history(limit: int = Query(50, ge=1, le=500), user: Student = Depends(get_current_user),
               db: Session = Depends(get_db)):
    return db.scalars(
        select(PredictionHistory).where(PredictionHistory.student_id == user.id)
        .order_by(PredictionHistory.created_at.desc()).limit(limit)
    ).all()


@router.get("/history/{email}", response_model=list[PredictionOut])
def history_by_email(email: str, user: Student = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role != "faculty" and user.email != email.lower():
        raise HTTPException(status_code=403, detail="You can only view your own history")
    target = db.scalar(select(Student).where(Student.email == email.lower()))
    if target is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return target.predictions


@router.delete("/history/{prediction_id}", status_code=204)
def delete_prediction(prediction_id: int, user: Student = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(PredictionHistory, prediction_id)
    if row is None or (row.student_id != user.id and user.role != "faculty"):
        raise HTTPException(status_code=404, detail="Prediction not found")
    db.delete(row)
    db.commit()


@router.post("/campus")
def campus(body: CampusInput, _: Student = Depends(get_current_user)):
    values = body.model_dump()
    values["workex"] = int(values["workex"])
    values["specialisation_fin"] = int(values.pop("specialisation") == "Mkt&Fin")
    return predictor.campus_predict(values)
