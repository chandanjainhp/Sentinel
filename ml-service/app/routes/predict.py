from __future__ import annotations

from typing import Union

from fastapi import APIRouter, HTTPException, Request

from app.schemas.prediction import InsufficientData, PredictOk, PredictRequest
from app.services import scoring
from app.services.predictor import NotEnoughData, SUPPORTED_MACHINE_TYPES

router = APIRouter()


@router.post("/predict", response_model=Union[PredictOk, InsufficientData])
def predict(req: PredictRequest, request: Request):
    # 1. unknown machineType -> 400 (caller bug)
    if req.machineType not in SUPPORTED_MACHINE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown machineType '{req.machineType}'. Supported: {sorted(SUPPORTED_MACHINE_TYPES)}",
        )

    # 2. known type but no model loaded -> 503 (service problem, retry later)
    registry = request.app.state.registry
    predictor = registry.get(req.machineType)
    if predictor is None:
        reason = registry.errors.get(req.machineType, "no model file present")
        raise HTTPException(
            status_code=503,
            detail=f"Model for machineType '{req.machineType}' is not loaded ({reason}). "
                   "Train it with train/train_autoencoder.py and restart the service.",
        )

    # 3. required channels present in EVERY event -> 422
    try:
        matrix = scoring.build_matrix([e.values for e in req.window], predictor.meta.features)
    except scoring.MissingChannel as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    # 4. score (or report that there is not enough data yet)
    result = predictor.score(matrix)
    if isinstance(result, NotEnoughData):
        return InsufficientData(machineId=req.machineId, have=result.have, need=result.need)

    return PredictOk(
        machineId=req.machineId,
        modelVersion=predictor.meta.modelVersion,
        anomalyScore=result.anomaly_score,
        faultProbability=result.fault_probability,
        faultType=result.fault_type,
        suspectChannel=result.suspect_channel,
        confidence=result.confidence,
    )
