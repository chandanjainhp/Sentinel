"""Pydantic request/response models for the public API (see CONTRACT.md)."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

MAX_EVENTS = 500  # hard cap to bound work; the recommended window is 60

FiniteFloat = Annotated[float, Field(allow_inf_nan=False)]


class Event(BaseModel):
    timestamp: datetime
    values: Dict[str, FiniteFloat]


class PredictRequest(BaseModel):
    machineId: str = Field(min_length=1, max_length=128)
    machineType: str = Field(min_length=1, max_length=64)
    window: List[Event] = Field(max_length=MAX_EVENTS)


class Methods(BaseModel):
    anomalyScore: Literal["lstm_autoencoder_reconstruction_error"] = "lstm_autoencoder_reconstruction_error"
    faultProbability: Literal["recent_exceedance_ratio"] = "recent_exceedance_ratio"
    faultType: Literal["top_error_channel"] = "top_error_channel"
    rul: Literal["not_available"] = "not_available"


class PredictOk(BaseModel):
    machineId: str
    status: Literal["ok"] = "ok"
    model: Literal["lstm_autoencoder"] = "lstm_autoencoder"
    modelVersion: str
    anomalyScore: float = Field(ge=0.0, le=1.0)
    faultProbability: float = Field(ge=0.0, le=1.0)
    faultType: str  # "none" or "<channel>_anomaly"
    suspectChannel: Optional[str] = None
    rulValue: None = None   # ALWAYS null in this version: "not available", never 0
    rulUnit: None = None
    confidence: float = Field(ge=0.0, le=1.0)
    methods: Methods = Methods()


class InsufficientData(BaseModel):
    machineId: str
    status: Literal["insufficient_data"] = "insufficient_data"
    have: int
    need: int


class ModelInfo(BaseModel):
    machineType: str
    model: str
    modelVersion: str
    features: List[str]
    seq_len: int
    threshold: float
    trainedAt: str
    dataSource: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    models: List[Dict[str, str]]
    notLoaded: Dict[str, str]
