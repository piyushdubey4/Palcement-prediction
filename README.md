# PlaceWise: AI-Based Student Performance & Placement Prediction System

Full-stack implementation of the B.Tech synopsis (Dept. of CSE, GL Bajaj Group of Institutions, Mathura).

| Layer | Stack |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS v4 (dark mode), react-router-dom, axios, Recharts, jsPDF, react-hot-toast |
| Backend | FastAPI + Uvicorn, Pydantic validation, JWT (python-jose, HS256, 24 h), passlib + bcrypt |
| Database | SQLite via SQLAlchemy ORM (`backend/student_db.sqlite3`); set `DATABASE_URL` for PostgreSQL |
| ML | pandas, NumPy, scikit-learn (LR, Decision Tree, Random Forest, Gradient Boosting), joblib |

## Quick start

Needs Python 3.11+ and Node 18+.

```bash
./start.sh            # macOS / Linux
./start.ps1           # Windows PowerShell
```

Or step by step:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m app.ml.train        # retrains models and writes app/ml/artifacts/ (already included)
python -m app.seed --demo     # default accounts + 8 sample "Demo Student" records
uvicorn app.main:app --reload --port 8000             # API docs: http://localhost:8000/docs

cd ../frontend
npm install
npm run dev                   # http://localhost:5173
```

Accounts created by the seed script:

| Role | Email | Password |
|---|---|---|
| Faculty | faculty@glbajaj.edu.in | faculty123 |
| Student | student@glbajaj.edu.in | student123 |
| Sample students | demo1 … demo8@glbajaj.edu.in | demo1234 |

New faculty accounts need the registration code in `FACULTY_SIGNUP_CODE` (default `GLBAJAJ-FACULTY`, see `backend/.env.example`).

Run the tests with `cd backend && python -m pytest -q`.

## Datasets (both public, stored in `backend/data/`)

1. **College Student Placement Factors Dataset** by sahilislam007, Kaggle:
   https://www.kaggle.com/datasets/sahilislam007/college-student-placement-factors-dataset
   It has 10,000 rows × 10 columns and no missing values. 1,659 students are placed and 8,341 are not. This is the main model.
2. **Campus Recruitment (Placement_Data_Full_Class)** by Ben Roshan D, Kaggle:
   https://www.kaggle.com/datasets/benroshan/factors-affecting-campus-placement
   It has 215 real MBA students from Jain University, Bangalore, of whom 148 are placed. It is used as a real-data benchmark and for the salary range.

## Methodology and formulas

**Pipeline** (`backend/app/ml/train.py`):
1. Drop `College_ID`, map Yes/No to 1/0 and fill missing values with the median.
2. Make a stratified 80:20 split (8,000 / 2,000) with seed 42.
3. Train four models: Logistic Regression (with StandardScaler), Decision Tree, Random Forest and Gradient Boosting.
4. Report Accuracy, Precision, Recall, F1, ROC-AUC and 5-fold stratified CV F1.
5. Select the best model by F1. Ties are broken by CV F1, then by lowest log-loss.
6. Save the model, feature names, medians and `metrics.json` with joblib.

**Performance level** (rule-based):
`Score = 0.40 × (CGPA × 10) + 0.30 × Attendance% + 0.30 × (mean semester SGPA × 10)`.
The levels are Excellent ≥ 80, Good ≥ 65, Average ≥ 50 and Poor below 50.

**Placement probability** (ML): the form values are mapped to dataset features and passed to `predict_proba`. A probability of 55% or more means "Likely to be placed". If the model fails to load, the readiness index is used as a fallback.

| Model feature | Form source |
|---|---|
| IQ | `100 + 15 × Φ⁻¹(aptitude / 100)`: the aptitude percentile placed on the IQ scale (mean 100, sd 15) |
| Prev_Sem_Result | mean of the 4 semester SGPAs |
| CGPA | CGPA |
| Academic_Performance | CGPA rounded half up, clipped to 1..10 |
| Internship_Experience | 1 if internships > 0 |
| Extra_Curricular_Score | min(10, 2 × certifications) |
| Communication_Skills | communication / 10, rounded half up |
| Projects_Completed | min(projects, 5) |

**Readiness index** (0–100): `0.20·aptitude + 0.15·coding + 0.15·DSA + 0.15·communication + 0.15·CGPA×10 + 0.10·min(projects,4)/4×100 + 0.05·internship×100 + 0.05·min(certs,5)/5×100`.

**Risk flag**: High when the probability is below 55% and the level is Poor, or there are at least 3 high-severity gaps, or at least 5 gaps in total. Medium when the probability is below 55% or there are at least 2 high-severity gaps. Low otherwise.

**Skill gaps**: one rule each for CGPA < 7, aptitude, coding, DSA or communication < 60, no internship, projects < 2, attendance < 75%, active backlogs and no certifications. Each rule adds a recommendation and a learning resource.

**Explainability**:
- *Hiring criteria*: shows which of the 4 learned thresholds the student meets.
- *Occlusion impact*: the change in probability when one feature is reset to the dataset median.
- *Counterfactual improvement plan*: scores a grid of aptitude, communication, projects and CGPA values in one batch and returns the lowest-effort changes that cross 55%.

## Results (test set, 2,000 records)

| Model | Accuracy | Precision | Recall | F1 | ROC-AUC | 5-fold CV F1 |
|---|---|---|---|---|---|---|
| Baseline ("Not Placed") | 83.40% | – | 0.000 | 0.000 | 0.500 | – |
| Logistic Regression | 90.35% | 0.777 | 0.587 | 0.669 | 0.945 | 0.670 ± 0.024 |
| Decision Tree | 100.0% | 1.000 | 1.000 | 1.000 | 1.000 | 0.999 ± 0.002 |
| Random Forest | 99.95% | 1.000 | 0.997 | 0.999 | 1.000 | 0.999 ± 0.001 |
| **Gradient Boosting (selected)** | 100.0% | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 ± 0.000 |

**Key finding:** in this dataset a student is labelled placed exactly when at least 3 of these 4 hold: IQ > 110, CGPA > 8.0, Projects ≥ 2 and Communication ≥ 8. The rule matches all 10,000 rows, so the data is synthetic. That explains the ≈100% scores, and it also explains why the probabilities are close to 0% or 100%.

**Real-data benchmark** (Jain University, 43-row test split):

| Model | Accuracy | F1 | ROC-AUC | 5-fold CV F1 |
|---|---|---|---|---|
| Logistic Regression | 86.05% | 0.903 | 0.959 | 0.905 |
| Decision Tree | 72.09% | 0.813 | 0.626 | 0.873 |
| **Random Forest (selected by CV F1)** | 83.72% | 0.892 | 0.939 | 0.916 |
| Gradient Boosting | 86.05% | 0.900 | 0.910 | 0.901 |

Salary regression with a Random Forest on the 148 placed students reached a cross-validated R² of −0.24, which is worse than always predicting the median. The app therefore shows the salary range of the 15 most similar placed students rather than a point estimate.

## Features

- **Student**:
  - Registration and login.
  - Prediction form, pre-filled with the last submission.
  - Full report with performance level, placement %, readiness meter, risk flag, radar chart, score breakdown, hiring criteria, improvement plan, skill gaps and resources.
  - PDF download.
  - Prediction history with a trend chart, per-entry PDF and delete.
  - Live what-if simulator (not saved).
  - Editable profile.
  - Mentor notes from faculty.
- **Faculty**:
  - Class stats and risk distribution.
  - Most common skill gaps.
  - Search and filter by risk.
  - Per-student report and history.
  - Mentor notes.
  - CSV export.
- **Model insights** page: metrics table, ROC curves, confusion matrix, feature importance, correlations, EDA charts and the real-data benchmark.
- **Real-data check** page: placement probability and a similar-student salary range from the Jain University model.
- Dark mode and a responsive layout.

## API

Interactive docs are at `/docs`. Main routes:

| Group | Routes |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET` and `PATCH /auth/me` |
| Predict | `POST /predict/performance`, `/predict/placement`, `/predict/full-report` (saved), `/predict/simulate`, `/predict/campus` |
| History | `GET /predict/history`, `GET /predict/history/{email}`, `DELETE /predict/history/{id}` |
| Faculty | `GET /students/all?risk=&q=`, `/students/stats`, `/students/export.csv`, `/students/{id}/data` |
| Notes | `GET` and `POST /students/{id}/notes`, `DELETE /students/{id}/notes/{note_id}` |
| Model | `GET /model/metrics`, `GET /health` |

## Database tables

| Table | Columns |
|---|---|
| `students` | id, name, email, hashed_password, role, roll_no, branch, year, target_role, profile (JSON), created_at |
| `prediction_history` | id, student_id → students, inputs (JSON), performance_score, performance_level, placement_probability, readiness_index, risk_flag, report (JSON), created_at |
| `mentor_notes` | id, student_id, author_id, text, created_at |

## References

1. A. Pathak et al., "A machine learning framework for predicting student placement outcomes," *ISI*, 30(7), 2025, doi:10.18280/isi.300704.
2. M. Kumar et al., "Predicting college students placements based on academic performance using ML approaches," *IJMECS*, 15(6), 2023, doi:10.5815/ijmecs.2023.06.01.
3. K. Eswara Rao et al., "Student placement performance analysis and prediction systems at HEIs in South India," *U.Porto J. Eng.*, 11(2), 2025.
4. K. Rai, P. Kumar, S. Sood, "Anticipating placement status of engineering students using ML," *IEEE ICIDCA*, 2023.
5. sahilislam007, "College Student Placement Factors Dataset," Kaggle.
6. Ben Roshan D, "Campus Recruitment," Kaggle.
