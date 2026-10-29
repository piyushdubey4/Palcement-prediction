from fastapi import APIRouter

from ..ml import predictor

router = APIRouter(prefix="/model", tags=["model"])


@router.get("/metrics")
def model_metrics():
    """Training report: dataset, per-model metrics, ROC curves, confusion matrices and EDA."""
    return {"model_loaded": predictor.model_loaded(), **predictor.metrics()}
