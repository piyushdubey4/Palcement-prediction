"""Train and evaluate the placement models.

Run from the backend folder:
    python -m app.ml.train

Two public datasets are used (both stored in backend/data/):

1. College Student Placement Factors Dataset (sahilislam007, Kaggle)
   10,000 rows x 10 columns. Primary model used by the web app.
   https://www.kaggle.com/datasets/sahilislam007/college-student-placement-factors-dataset

2. Campus Recruitment / Placement_Data_Full_Class (Ben Roshan D, Kaggle)
   215 real MBA students of Jain University, Bangalore (2020). Used as a
   real-world benchmark and for the salary estimate.
   https://www.kaggle.com/datasets/benroshan/factors-affecting-campus-placement

Pipeline (synopsis, Methodology steps 1-6):
  drop identifier -> Yes/No to 1/0 -> median fill -> stratified 80:20 split ->
  LR (with StandardScaler), Decision Tree, Random Forest, Gradient Boosting ->
  Accuracy, Precision, Recall, F1, ROC-AUC, 5-fold CV F1 -> best by F1
  (ties broken by 5-fold CV F1, then lower log-loss) ->
  joblib artefacts + metrics.json for the dashboard.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import (
    GradientBoostingClassifier,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    log_loss,
    mean_absolute_error,
    precision_score,
    r2_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split, KFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
SEED = 42

PRIMARY_CSV = DATA_DIR / "college_student_placement_dataset.csv"
CAMPUS_CSV = DATA_DIR / "campus_recruitment_jain.csv"

FEATURES = [
    "IQ",
    "Prev_Sem_Result",
    "CGPA",
    "Academic_Performance",
    "Internship_Experience",
    "Extra_Curricular_Score",
    "Communication_Skills",
    "Projects_Completed",
]

CAMPUS_FEATURES = ["ssc_p", "hsc_p", "degree_p", "etest_p", "mba_p", "workex", "specialisation_fin"]


def _yes_no(series: pd.Series) -> pd.Series:
    return series.map({"Yes": 1, "No": 0}).astype(int)


def load_primary() -> tuple[pd.DataFrame, pd.Series]:
    df = pd.read_csv(PRIMARY_CSV)
    df = df.drop(columns=["College_ID"])
    df["Internship_Experience"] = _yes_no(df["Internship_Experience"])
    df["Placement"] = _yes_no(df["Placement"])
    df = df.fillna(df.median(numeric_only=True))
    return df[FEATURES], df["Placement"]


def load_campus() -> pd.DataFrame:
    df = pd.read_csv(CAMPUS_CSV)
    df["workex"] = _yes_no(df["workex"])
    df["specialisation_fin"] = (df["specialisation"] == "Mkt&Fin").astype(int)
    df["placed"] = (df["status"] == "Placed").astype(int)
    return df


def candidate_models() -> dict:
    return {
        "Logistic Regression": Pipeline(
            [("scaler", StandardScaler()), ("clf", LogisticRegression(max_iter=1000, random_state=SEED))]
        ),
        "Decision Tree": DecisionTreeClassifier(max_depth=6, random_state=SEED),
        "Random Forest": RandomForestClassifier(n_estimators=200, random_state=SEED, n_jobs=-1),
        "Gradient Boosting": GradientBoostingClassifier(random_state=SEED),
    }


def evaluate(model, X_test, y_test) -> dict:
    proba = model.predict_proba(X_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    fpr, tpr, _ = roc_curve(y_test, proba)
    # Down-sample ROC points so metrics.json stays small.
    idx = np.unique(np.linspace(0, len(fpr) - 1, min(len(fpr), 60)).astype(int))
    return {
        "accuracy": accuracy_score(y_test, pred),
        "precision": precision_score(y_test, pred, zero_division=0),
        "recall": recall_score(y_test, pred, zero_division=0),
        "f1": f1_score(y_test, pred, zero_division=0),
        "roc_auc": roc_auc_score(y_test, proba),
        "log_loss": log_loss(y_test, np.clip(proba, 1e-6, 1 - 1e-6)),
        "brier": brier_score_loss(y_test, proba),
        "confusion_matrix": confusion_matrix(y_test, pred).tolist(),
        "roc": [{"fpr": round(float(fpr[i]), 4), "tpr": round(float(tpr[i]), 4)} for i in idx],
    }


def feature_importance(model, names) -> list[dict]:
    est = model.named_steps["clf"] if isinstance(model, Pipeline) else model
    if hasattr(est, "feature_importances_"):
        values = est.feature_importances_
    else:
        values = np.abs(est.coef_[0])
        values = values / values.sum()
    return sorted(
        ({"feature": n, "importance": round(float(v), 4)} for n, v in zip(names, values)),
        key=lambda d: d["importance"],
        reverse=True,
    )


def train_primary() -> dict:
    X, y = load_primary()
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

    results, fitted = [], {}
    baseline_proba = np.zeros(len(y_test))
    results.append({
        "model": "Baseline (always 'Not Placed')",
        "accuracy": accuracy_score(y_test, baseline_proba.astype(int)),
        "precision": 0.0, "recall": 0.0, "f1": 0.0, "roc_auc": 0.5,
        "cv_f1_mean": None, "cv_f1_std": None,
    })

    for name, model in candidate_models().items():
        model.fit(X_train, y_train)
        cv_scores = cross_val_score(model, X, y, cv=cv, scoring="f1", n_jobs=-1)
        metrics = evaluate(model, X_test, y_test)
        metrics.update({"model": name, "cv_f1_mean": cv_scores.mean(), "cv_f1_std": cv_scores.std()})
        metrics["feature_importance"] = feature_importance(model, FEATURES)
        results.append(metrics)
        fitted[name] = model
        print(f"{name:20s} acc={metrics['accuracy']:.4f} f1={metrics['f1']:.4f} "
              f"auc={metrics['roc_auc']:.4f} cvF1={cv_scores.mean():.3f}±{cv_scores.std():.3f}")

    trained = [r for r in results if r["model"] in fitted]
    best = sorted(trained, key=lambda r: (-round(r["f1"], 3), -round(r["cv_f1_mean"], 3), r["log_loss"]))[0]
    best_model = fitted[best["model"]]
    print(f"Selected: {best['model']}")

    # The scaler is kept inside the LR pipeline; for the tree models it is not needed.
    joblib.dump(best_model, ARTIFACT_DIR / "placement_model.pkl")
    joblib.dump(FEATURES, ARTIFACT_DIR / "feature_names.pkl")
    joblib.dump(X.median().to_dict(), ARTIFACT_DIR / "feature_medians.pkl")

    df = X.assign(Placement=y)
    rule = ((df.IQ > 110).astype(int) + (df.CGPA > 8.0).astype(int)
            + (df.Projects_Completed >= 2).astype(int) + (df.Communication_Skills >= 8).astype(int)) >= 3
    eda = {
        "rows": int(len(df)),
        "placed": int(y.sum()),
        "not_placed": int((1 - y).sum()),
        "train_rows": int(len(X_train)),
        "test_rows": int(len(X_test)),
        "means_by_class": {
            col: {"placed": round(float(df[df.Placement == 1][col].mean()), 3),
                  "not_placed": round(float(df[df.Placement == 0][col].mean()), 3)}
            for col in FEATURES
        },
        "correlation_with_target": {
            col: round(float(df[col].corr(df.Placement)), 4) for col in FEATURES
        },
        "label_rule_match": round(float((rule == (y == 1)).mean()), 4),
        "placement_rate_by_cgpa": [
            {"bucket": str(b), "rate": round(float(g.Placement.mean()), 4), "n": int(len(g))}
            for b, g in df.groupby(pd.cut(df.CGPA, bins=[4, 5, 6, 7, 8, 9, 11]), observed=True)
        ],
        "placement_rate_by_projects": [
            {"bucket": int(b), "rate": round(float(g.Placement.mean()), 4), "n": int(len(g))}
            for b, g in df.groupby("Projects_Completed")
        ],
    }
    return {
        "dataset": {
            "name": "College Student Placement Factors Dataset",
            "author": "sahilislam007",
            "url": "https://www.kaggle.com/datasets/sahilislam007/college-student-placement-factors-dataset",
            "features": FEATURES,
            "target": "Placement",
        },
        "selected_model": best["model"],
        "selection_rule": "highest F1 on the held-out test set; ties broken by 5-fold CV F1, then lowest log-loss",
        "results": results,
        "eda": eda,
    }


def train_campus() -> dict:
    """Real-world benchmark on the Jain University campus recruitment data."""
    df = load_campus()
    X, y = df[CAMPUS_FEATURES], df["placed"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=SEED)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)

    results, fitted = [], {}
    for name, model in candidate_models().items():
        model.fit(X_train, y_train)
        cv_scores = cross_val_score(model, X, y, cv=cv, scoring="f1")
        m = evaluate(model, X_test, y_test)
        m.update({"model": name, "cv_f1_mean": cv_scores.mean(), "cv_f1_std": cv_scores.std(),
                  "feature_importance": feature_importance(model, CAMPUS_FEATURES)})
        results.append(m)
        fitted[name] = model
        print(f"[campus] {name:20s} acc={m['accuracy']:.4f} f1={m['f1']:.4f} auc={m['roc_auc']:.4f} "
              f"cvF1={cv_scores.mean():.3f}")

    # Small dataset: choose by 5-fold CV F1, which is more stable than one 43-row test split.
    best = max(results, key=lambda r: r["cv_f1_mean"])
    joblib.dump(fitted[best["model"]], ARTIFACT_DIR / "campus_model.pkl")

    # Salary regression on placed students only (salary is empty for the rest).
    placed = df[df.placed == 1]
    Xs, ys = placed[CAMPUS_FEATURES], placed["salary"]
    reg = RandomForestRegressor(n_estimators=300, min_samples_leaf=3, random_state=SEED)
    kf = KFold(n_splits=5, shuffle=True, random_state=SEED)
    mae = -cross_val_score(reg, Xs, ys, cv=kf, scoring="neg_mean_absolute_error")
    r2 = cross_val_score(reg, Xs, ys, cv=kf, scoring="r2")
    baseline_mae = float(np.mean(np.abs(ys - ys.median())))
    # R^2 is below zero here: salary is not predictable from these columns, so the app
    # shows the salary range of similar placed students instead of a point estimate.
    print(f"[campus] salary RF: CV MAE={mae.mean():.0f} R2={r2.mean():.3f} (median baseline MAE={baseline_mae:.0f})")

    return {
        "dataset": {
            "name": "Campus Recruitment (Placement_Data_Full_Class)",
            "author": "Ben Roshan D, Jain University Bangalore",
            "url": "https://www.kaggle.com/datasets/benroshan/factors-affecting-campus-placement",
            "rows": int(len(df)),
            "placed": int(y.sum()),
            "not_placed": int((1 - y).sum()),
            "features": CAMPUS_FEATURES,
            "note": "Gender and school-board columns are deliberately not used as features.",
        },
        "selected_model": best["model"],
        "selection_rule": "highest 5-fold CV F1 (small dataset)",
        "results": results,
        "salary": {
            "model": "Random Forest Regressor",
            "rows": int(len(placed)),
            "cv_mae": float(mae.mean()),
            "cv_r2": float(r2.mean()),
            "median_baseline_mae": baseline_mae,
            "median_salary": float(ys.median()),
            "min_salary": float(ys.min()),
            "max_salary": float(ys.max()),
            "finding": "Cross-validated R^2 is below 0, so a point salary prediction is not reliable. "
                       "The app reports the salary range of the 15 most similar placed students instead.",
        },
    }


def _round(obj):
    if isinstance(obj, float):
        return round(obj, 4)
    if isinstance(obj, (np.floating,)):
        return round(float(obj), 4)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_round(v) for v in obj]
    return obj


def main() -> None:
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "random_seed": SEED,
        "primary": train_primary(),
        "campus": train_campus(),
    }
    (ARTIFACT_DIR / "metrics.json").write_text(json.dumps(_round(report), indent=2))
    print(f"Saved artefacts to {ARTIFACT_DIR}")


if __name__ == "__main__":
    main()
