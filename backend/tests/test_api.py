import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.sqlite3"

from fastapi.testclient import TestClient  # noqa: E402

from app.config import FACULTY_SIGNUP_CODE  # noqa: E402
from app.main import app  # noqa: E402
from app.ml import predictor  # noqa: E402

client = TestClient(app)

GOOD = dict(cgpa=8.6, attendance=90, sem1=8.4, sem2=8.7, sem3=8.5, sem4=8.8, aptitude=85, coding=80, dsa=78,
            communication=82, internships=1, projects=3, certifications=2, backlogs=0)
WEAK = dict(cgpa=6.4, attendance=68, sem1=6.1, sem2=6.5, sem3=6.2, sem4=6.6, aptitude=45, coding=40, dsa=35,
            communication=50, internships=0, projects=0, certifications=0, backlogs=2)


def _register(email, role="student", **extra):
    r = client.post("/auth/register", json={"name": "Test User", "email": email, "password": "secret123",
                                            "role": role, **extra})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_health_and_metrics():
    assert client.get("/health").json() == {"status": "ok", "model_loaded": True}
    m = client.get("/model/metrics").json()
    assert m["primary"]["eda"]["rows"] == 10000
    assert m["primary"]["eda"]["label_rule_match"] == 1.0
    assert {r["model"] for r in m["primary"]["results"]} >= {"Logistic Regression", "Decision Tree",
                                                            "Random Forest", "Gradient Boosting"}


def test_formulas():
    s = predictor.StudentFeatures(**GOOD)
    score, level = predictor.performance(s)
    assert score == round(0.4 * 86 + 0.3 * 90 + 0.3 * 86.0, 2)
    assert level == "Excellent"
    assert predictor.aptitude_to_iq(50) == 100
    mapped = predictor.map_features(s)
    assert mapped["Internship_Experience"] == 1 and mapped["Communication_Skills"] == 8


def test_auth_flow_and_errors():
    h = _register("alice@example.com")
    assert client.get("/auth/me", headers=h).json()["role"] == "student"
    assert client.post("/auth/register", json={"name": "A", "email": "alice@example.com",
                                               "password": "secret123"}).status_code in (409, 422)
    assert client.post("/auth/login", json={"email": "alice@example.com", "password": "wrong"}).status_code == 401
    assert client.get("/auth/me").status_code == 401
    bad = client.post("/auth/register", json={"name": "Fake Fac", "email": "f@example.com", "password": "secret123",
                                              "role": "faculty", "faculty_code": "nope"})
    assert bad.status_code == 403


def test_prediction_persists_and_faculty_view():
    h = _register("bob@example.com", roll_no="R1")
    good = client.post("/predict/full-report", json=GOOD, headers=h).json()
    assert good["placement_probability"] >= 0.55 and good["risk_flag"] == "Low"
    weak = client.post("/predict/full-report", json=WEAK, headers=h).json()
    assert weak["placement_probability"] < 0.55 and weak["risk_flag"] == "High"
    assert weak["report"]["improvement_path"], "weak profile should get an improvement plan"
    gaps = {g["area"] for g in weak["report"]["skill_gaps"]}
    assert {"cgpa", "aptitude", "coding", "dsa", "attendance", "backlogs", "internship", "projects"} <= gaps

    hist = client.get("/predict/history", headers=h).json()
    assert [p["id"] for p in hist] == [weak["id"], good["id"]]
    assert client.get("/auth/me", headers=h).json()["profile"]["cgpa"] == WEAK["cgpa"]

    sim = client.post("/predict/simulate", json=GOOD, headers=h).json()
    assert "placement_probability" in sim
    assert len(client.get("/predict/history", headers=h).json()) == 2  # simulate does not save

    assert client.get("/students/all", headers=h).status_code == 403
    fh = _register("prof@example.com", role="faculty", faculty_code=FACULTY_SIGNUP_CODE)
    rows = client.get("/students/all", headers=fh).json()
    bob = next(r for r in rows if r["email"] == "bob@example.com")
    assert bob["latest"]["risk_flag"] == "High" and bob["predictions"] == 2
    assert client.get("/students/all?risk=High", headers=fh).json()
    stats = client.get("/students/stats", headers=fh).json()
    assert stats["risk"]["High"] >= 1

    note = client.post(f"/students/{bob['id']}/notes", json={"text": "Meet me on Monday"}, headers=fh)
    assert note.status_code == 201
    data = client.get(f"/students/{bob['id']}/data", headers=h).json()
    assert data["notes"][0]["text"] == "Meet me on Monday"

    csv = client.get("/students/export.csv", headers=fh)
    assert csv.status_code == 200 and "bob@example.com" in csv.text

    assert client.delete(f"/predict/history/{good['id']}", headers=h).status_code == 204
    assert len(client.get("/predict/history", headers=h).json()) == 1


def test_validation_and_campus():
    h = _register("carol@example.com")
    assert client.post("/predict/full-report", json={**GOOD, "cgpa": 11}, headers=h).status_code == 422
    r = client.post("/predict/campus", headers=h, json=dict(ssc_p=80, hsc_p=78, degree_p=75, etest_p=80, mba_p=68,
                                                           workex=True, specialisation="Mkt&Fin")).json()
    assert 0 <= r["placement_probability"] <= 1 and r["salary_range"]["median"] > 0


def test_half_up_rounding():
    s = predictor.StudentFeatures(**{**GOOD, "communication": 65, "cgpa": 7.5})
    mapped = predictor.map_features(s)
    assert mapped["Communication_Skills"] == 7 and mapped["Academic_Performance"] == 8
