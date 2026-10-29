"""Hybrid intelligence layer: ML placement probability + transparent rules.

Formulas (from the project synopsis, Methodology A-C):

  Performance score  = 0.40 x (CGPA x 10) + 0.30 x Attendance% + 0.30 x (Semester avg SGPA x 10)
  Performance level  = Excellent >= 80 > Good >= 65 > Average >= 50 > Poor
  Placement          = model.predict_proba(mapped features); >= 55% means "Likely to be placed"
  Risk flag          = rule-based, combines probability, performance level and skill gaps

Form -> dataset feature mapping:

  IQ                     = 100 + 15 x z(aptitude percentile)  (aptitude read as a population
                           percentile and placed on the IQ scale, mean 100 / sd 15)
  Prev_Sem_Result        = mean of the 4 semester SGPAs
  CGPA                   = CGPA
  Academic_Performance   = round half up (CGPA), clipped to 1..10
  Internship_Experience  = 1 if internships > 0 else 0
  Extra_Curricular_Score = min(10, 2 x certifications)
  Communication_Skills   = round half up (communication / 10)
  Projects_Completed     = min(projects, 5)
"""
from __future__ import annotations

import json
import logging
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from statistics import NormalDist

import joblib
import numpy as np
import pandas as pd

from .train import ARTIFACT_DIR, CAMPUS_CSV, CAMPUS_FEATURES, FEATURES

log = logging.getLogger(__name__)

PLACEMENT_THRESHOLD = 0.55
_NORMAL = NormalDist()


@dataclass
class StudentFeatures:
    cgpa: float
    attendance: float
    sem1: float
    sem2: float
    sem3: float
    sem4: float
    aptitude: float
    coding: float
    dsa: float
    communication: float
    internships: int
    projects: int
    certifications: int
    backlogs: int = 0

    @property
    def sem_avg(self) -> float:
        return (self.sem1 + self.sem2 + self.sem3 + self.sem4) / 4


# ---------------------------------------------------------------- artefacts
@lru_cache
def _artifacts():
    try:
        model = joblib.load(ARTIFACT_DIR / "placement_model.pkl")
        names = joblib.load(ARTIFACT_DIR / "feature_names.pkl")
        medians = joblib.load(ARTIFACT_DIR / "feature_medians.pkl")
        return model, names, medians
    except Exception as exc:  # missing or incompatible pickle -> rule-based fallback
        log.warning("Placement model not loaded (%s); using rule-based fallback", exc)
        return None, FEATURES, None


@lru_cache
def metrics() -> dict:
    path = ARTIFACT_DIR / "metrics.json"
    return json.loads(path.read_text()) if path.exists() else {}


def model_loaded() -> bool:
    return _artifacts()[0] is not None


# ---------------------------------------------------------------- mapping
def aptitude_to_iq(aptitude: float) -> float:
    pct = min(max(aptitude, 1.0), 99.0) / 100
    return round(min(max(100 + 15 * _NORMAL.inv_cdf(pct), 70), 160), 1)


def map_features(s: StudentFeatures) -> dict:
    return {
        "IQ": aptitude_to_iq(s.aptitude),
        "Prev_Sem_Result": round(s.sem_avg, 2),
        "CGPA": s.cgpa,
        "Academic_Performance": int(min(max(math.floor(s.cgpa + 0.5), 1), 10)),
        "Internship_Experience": 1 if s.internships > 0 else 0,
        "Extra_Curricular_Score": int(min(10, 2 * s.certifications)),
        "Communication_Skills": int(min(max(math.floor(s.communication / 10 + 0.5), 0), 10)),
        "Projects_Completed": int(min(s.projects, 5)),
    }


# ---------------------------------------------------------------- scores
def performance(s: StudentFeatures) -> tuple[float, str]:
    score = 0.40 * (s.cgpa * 10) + 0.30 * s.attendance + 0.30 * (s.sem_avg * 10)
    score = round(score, 2)
    if score >= 80:
        level = "Excellent"
    elif score >= 65:
        level = "Good"
    elif score >= 50:
        level = "Average"
    else:
        level = "Poor"
    return score, level


def readiness_index(s: StudentFeatures) -> float:
    """Weighted 0-100 readiness score (rule-based, smooth, used for the meter and fallback)."""
    score = (
        0.20 * s.aptitude
        + 0.15 * s.coding
        + 0.15 * s.dsa
        + 0.15 * s.communication
        + 0.15 * s.cgpa * 10
        + 0.10 * min(s.projects, 4) / 4 * 100
        + 0.05 * (100 if s.internships > 0 else 0)
        + 0.05 * min(s.certifications, 5) / 5 * 100
    )
    return round(score, 2)


def _proba_rows(rows: list[dict]) -> np.ndarray:
    model, names, _ = _artifacts()
    frame = pd.DataFrame(rows)[names]
    return model.predict_proba(frame)[:, 1]


def placement_probability(s: StudentFeatures) -> tuple[float, str]:
    if model_loaded():
        return float(_proba_rows([map_features(s)])[0]), "ml"
    return readiness_index(s) / 100, "rule-based fallback"


def hiring_criteria(mapped: dict) -> list[dict]:
    """The four thresholds that fully explain the training labels (verified in train.py)."""
    return [
        {"criterion": "Aptitude (IQ scale) > 110", "value": mapped["IQ"], "met": mapped["IQ"] > 110,
         "form_hint": "aptitude score above about 75"},
        {"criterion": "CGPA > 8.0", "value": mapped["CGPA"], "met": mapped["CGPA"] > 8.0,
         "form_hint": "CGPA above 8.0"},
        {"criterion": "Projects >= 2", "value": mapped["Projects_Completed"],
         "met": mapped["Projects_Completed"] >= 2, "form_hint": "at least 2 projects"},
        {"criterion": "Communication >= 8/10", "value": mapped["Communication_Skills"],
         "met": mapped["Communication_Skills"] >= 8, "form_hint": "communication score 75 or more"},
    ]


def feature_contributions(s: StudentFeatures) -> list[dict]:
    """Occlusion explanation: change in probability when one feature is reset to the dataset median."""
    model, names, medians = _artifacts()
    if model is None:
        return []
    base = map_features(s)
    rows = [base]
    for n in names:
        r = dict(base)
        r[n] = medians[n]
        rows.append(r)
    probs = _proba_rows(rows)
    out = [
        {"feature": n, "value": base[n], "median": medians[n], "impact": round(float(probs[0] - probs[i + 1]), 4)}
        for i, n in enumerate(names)
    ]
    return sorted(out, key=lambda d: abs(d["impact"]), reverse=True)


# Actionable levers for the counterfactual search: field -> (step, max, effort per unit, label)
_LEVERS = {
    "aptitude": (5, 100, 1 / 25, "aptitude score"),
    "communication": (5, 100, 1 / 25, "communication score"),
    "projects": (1, 5, 1 / 2, "projects"),
    "cgpa": (0.1, 10, 1 / 0.5, "CGPA"),
}


def improvement_path(s: StudentFeatures, max_plans: int = 3) -> list[dict]:
    """Counterfactual plans: the lowest-effort changes that lift the probability over the threshold.

    Every combination of lever values on a grid is scored in one batch by the model,
    feasible combinations are ranked by effort = sum(delta x effort-per-unit), and the
    cheapest plan for each distinct set of levers is returned.
    """
    if not model_loaded() or placement_probability(s)[0] >= PLACEMENT_THRESHOLD:
        return []

    axes = {}
    for field, (step, limit, _, _) in _LEVERS.items():
        start = getattr(s, field)
        count = int(np.floor((limit - start) / step + 1e-9))
        axes[field] = np.round(start + step * np.arange(0, count + 1), 2)
    grid = np.array(np.meshgrid(*axes.values(), indexing="ij")).reshape(len(axes), -1).T
    combos = pd.DataFrame(grid, columns=list(axes))

    base = map_features(s)
    rows = pd.DataFrame([base] * len(combos))
    rows["IQ"] = [aptitude_to_iq(a) for a in combos.aptitude]
    rows["Communication_Skills"] = np.clip(np.floor(combos.communication / 10 + 0.5), 0, 10).astype(int)
    rows["Projects_Completed"] = np.minimum(combos.projects, 5).astype(int)
    rows["CGPA"] = combos.cgpa
    rows["Academic_Performance"] = np.clip(np.floor(combos.cgpa + 0.5), 1, 10).astype(int)
    probs = _proba_rows(rows.to_dict("records"))

    effort = sum((combos[f] - getattr(s, f)) * _LEVERS[f][2] for f in _LEVERS)
    feasible = combos.assign(p=probs, effort=effort)[probs >= PLACEMENT_THRESHOLD].sort_values("effort")

    plans, seen = [], set()
    for _, r in feasible.iterrows():
        changed = tuple(f for f in _LEVERS if r[f] != getattr(s, f))
        if changed in seen or any(set(prev) < set(changed) for prev in seen):
            continue
        seen.add(changed)
        plans.append({
            "changes": [{"field": f, "label": _LEVERS[f][3], "from": getattr(s, f), "to": float(r[f])}
                        for f in changed],
            "new_probability": round(float(r.p), 4),
            "effort": round(float(r.effort), 2),
        })
        if len(plans) == max_plans:
            break
    return plans


# ---------------------------------------------------------------- skill gaps
_GAP_RULES = [
    ("cgpa", lambda s: s.cgpa < 7, "CGPA below 7.0", "high",
     "Many recruiters use a 7.0 CGPA cut-off. Target the remaining semesters, clear any backlogs first and use NPTEL courses for weak subjects.",
     "https://nptel.ac.in"),
    ("aptitude", lambda s: s.aptitude < 60, "Aptitude below 60", "high",
     "Practise quantitative aptitude, logical reasoning and verbal ability daily (30-45 min) and take a timed mock test every week.",
     "https://www.indiabix.com"),
    ("coding", lambda s: s.coding < 60, "Coding below 60", "high",
     "Solve 2-3 problems a day in one language (C++, Java or Python), starting with easy problems on arrays and strings.",
     "https://leetcode.com/problemset/"),
    ("dsa", lambda s: s.dsa < 60, "DSA below 60", "high",
     "Follow a structured DSA sheet: arrays, linked lists, stacks, trees, graphs, DP. Revise time and space complexity.",
     "https://www.geeksforgeeks.org/dsa/dsa-tutorial-learn-data-structures-and-algorithms/"),
    ("communication", lambda s: s.communication < 60, "Communication below 60", "medium",
     "Join group discussions, record mock interviews and practise the STAR method for HR answers.",
     "https://www.toastmasters.org"),
    ("internship", lambda s: s.internships == 0, "No internship", "medium",
     "Apply for summer or virtual internships; even a 4-8 week internship adds real project experience to your resume.",
     "https://internship.aicte-india.org"),
    ("projects", lambda s: s.projects < 2, "Fewer than 2 projects", "medium",
     "Build two end-to-end projects (for example a full-stack web app and an ML model) and publish them on GitHub with a README.",
     "https://github.com"),
    ("attendance", lambda s: s.attendance < 75, "Attendance below 75%", "high",
     "AKTU requires 75% attendance to sit end-semester exams. Attend every remaining class and meet your mentor.",
     "https://aktu.ac.in"),
    ("backlogs", lambda s: s.backlogs > 0, "Active backlogs", "high",
     "Most companies require zero active backlogs at the time of the drive. Clear them in the next carry-over exam.",
     "https://aktu.ac.in"),
    ("certifications", lambda s: s.certifications == 0, "No certifications", "low",
     "Add one industry certification relevant to your target role (cloud, data, or a programming language).",
     "https://www.coursera.org"),
]


def skill_gaps(s: StudentFeatures) -> list[dict]:
    return [
        {"area": key, "gap": title, "severity": sev, "recommendation": rec, "resource": url}
        for key, test, title, sev, rec, url in _GAP_RULES
        if test(s)
    ]


def risk_flag(probability: float, level: str, gaps: list[dict]) -> str:
    high_gaps = sum(g["severity"] == "high" for g in gaps)
    if probability < PLACEMENT_THRESHOLD and (level == "Poor" or high_gaps >= 3 or len(gaps) >= 5):
        return "High"
    if probability < PLACEMENT_THRESHOLD or high_gaps >= 2:
        return "Medium"
    return "Low"


def full_report(s: StudentFeatures) -> dict:
    perf_score, level = performance(s)
    prob, source = placement_probability(s)
    gaps = skill_gaps(s)
    mapped = map_features(s)
    return {
        "performance_score": perf_score,
        "performance_level": level,
        "placement_probability": round(prob, 4),
        "placement_status": "Likely to be placed" if prob >= PLACEMENT_THRESHOLD else "Needs improvement",
        "prediction_source": source,
        "model_name": metrics().get("primary", {}).get("selected_model") if source == "ml" else None,
        "readiness_index": readiness_index(s),
        "risk_flag": risk_flag(prob, level, gaps),
        "skill_gaps": gaps,
        "mapped_features": mapped,
        "hiring_criteria": hiring_criteria(mapped),
        "contributions": feature_contributions(s),
        "improvement_path": improvement_path(s),
    }


# ---------------------------------------------------------------- campus benchmark
@lru_cache
def _campus():
    model = joblib.load(ARTIFACT_DIR / "campus_model.pkl")
    df = pd.read_csv(CAMPUS_CSV)
    df["workex"] = (df["workex"] == "Yes").astype(int)
    df["specialisation_fin"] = (df["specialisation"] == "Mkt&Fin").astype(int)
    placed = df[df.status == "Placed"].reset_index(drop=True)
    X = placed[CAMPUS_FEATURES].astype(float)
    mu, sd = X.mean(), X.std().replace(0, 1)
    return model, placed, (X - mu) / sd, mu, sd


def campus_predict(values: dict, k: int = 15) -> dict:
    model, placed, Z, mu, sd = _campus()
    row = pd.DataFrame([values])[CAMPUS_FEATURES].astype(float)
    prob = float(model.predict_proba(row)[:, 1][0])
    z = ((row.iloc[0] - mu) / sd).to_numpy()
    dist = np.sqrt(((Z.to_numpy() - z) ** 2).sum(axis=1))
    nearest = placed.iloc[np.argsort(dist)[:k]]
    sal = nearest["salary"]
    return {
        "placement_probability": round(prob, 4),
        "placement_status": "Likely to be placed" if prob >= PLACEMENT_THRESHOLD else "Needs improvement",
        "model_name": metrics().get("campus", {}).get("selected_model"),
        "similar_students": int(k),
        "salary_range": {
            "p25": float(sal.quantile(0.25)),
            "median": float(sal.median()),
            "p75": float(sal.quantile(0.75)),
        },
    }
