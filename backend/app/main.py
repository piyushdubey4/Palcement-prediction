import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .database import Base, engine
from .ml import predictor
from .routers import auth, insights, predict, students

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="AI Student Performance & Placement Prediction API",
    version="1.0.0",
    description="JWT-secured API for performance scoring, ML placement prediction, skill-gap analysis "
                "and faculty dashboards.",
)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

Base.metadata.create_all(bind=engine)

for r in (auth.router, predict.router, students.router, insights.router):
    app.include_router(r)


@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "model_loaded": predictor.model_loaded()}
