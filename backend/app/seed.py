"""Create the default accounts.

    python -m app.seed           # faculty + one student account
    python -m app.seed --demo    # also adds sample students (clearly named "Demo") for trying the faculty view
"""
import random
import sys

from sqlalchemy import select

from .auth import hash_password
from .database import Base, SessionLocal, engine
from .ml import predictor
from .models import PredictionHistory, Student

ACCOUNTS = [
    {"name": "Faculty Admin", "email": "faculty@glbajaj.edu.in", "password": "faculty123", "role": "faculty"},
    {"name": "Student Demo", "email": "student@glbajaj.edu.in", "password": "student123", "role": "student",
     "roll_no": "2405110000001", "branch": "CSE", "year": 3},
]


def _get_or_create(db, data: dict) -> Student:
    user = db.scalar(select(Student).where(Student.email == data["email"]))
    if user:
        return user
    data = dict(data)
    user = Student(hashed_password=hash_password(data.pop("password")), **data)
    db.add(user)
    db.flush()
    return user


def _sample_inputs(rng: random.Random) -> dict:
    cgpa = round(rng.uniform(5.8, 9.4), 2)
    return {
        "cgpa": cgpa, "attendance": round(rng.uniform(60, 98), 1),
        **{f"sem{i}": round(min(10, max(4, cgpa + rng.uniform(-0.6, 0.6))), 2) for i in range(1, 5)},
        "aptitude": rng.randint(40, 95), "coding": rng.randint(30, 95), "dsa": rng.randint(25, 95),
        "communication": rng.randint(40, 95), "internships": rng.choice([0, 0, 1, 1, 2]),
        "projects": rng.randint(0, 5), "certifications": rng.randint(0, 5), "backlogs": rng.choice([0, 0, 0, 1, 2]),
    }


def main(demo: bool) -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        for acc in ACCOUNTS:
            _get_or_create(db, acc)
        if demo:
            rng = random.Random(7)
            for i in range(1, 9):
                user = _get_or_create(db, {
                    "name": f"Demo Student {i}", "email": f"demo{i}@glbajaj.edu.in", "password": "demo1234",
                    "role": "student", "roll_no": f"24051100000{i + 10}", "branch": rng.choice(["CSE", "IT", "ECE"]),
                    "year": 3,
                })
                if not user.predictions:
                    inputs = _sample_inputs(rng)
                    report = predictor.full_report(predictor.StudentFeatures(**inputs))
                    user.profile = inputs
                    db.add(PredictionHistory(
                        student_id=user.id, inputs=inputs, report=report,
                        performance_score=report["performance_score"],
                        performance_level=report["performance_level"],
                        placement_probability=report["placement_probability"],
                        readiness_index=report["readiness_index"], risk_flag=report["risk_flag"],
                    ))
        db.commit()
    print("Seeded accounts:")
    for acc in ACCOUNTS:
        print(f"  {acc['role']:8s} {acc['email']} / {acc['password']}")
    if demo:
        print("  student  demo1..demo8@glbajaj.edu.in / demo1234 (sample data)")


if __name__ == "__main__":
    main("--demo" in sys.argv)
