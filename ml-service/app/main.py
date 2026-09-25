"""Sentinel ML service. Stateless: models are loaded once at startup."""
from __future__ import annotations

import logging
import math
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.routes import predict
from app.schemas.prediction import HealthResponse, ModelInfo
from app.services.predictor import ModelRegistry
from app.vendor_path import ROOT

logging.basicConfig(level=os.environ.get("ML_LOG_LEVEL", "INFO"))


def create_app(models_dir: Optional[Path] = None) -> FastAPI:
    directory = Path(models_dir or os.environ.get("ML_MODELS_DIR", ROOT / "models"))

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.registry = ModelRegistry.load_all(directory)
        yield

    app = FastAPI(title="Sentinel ML service", version="1.0.0", lifespan=lifespan)
    app.include_router(predict.router)

    @app.exception_handler(RequestValidationError)
    async def json_safe_validation_handler(request: Request, exc: RequestValidationError):
        """422 with a JSON-legal body even when the invalid input is NaN/Infinity.

        The default handler embeds the offending value verbatim in the error
        body; json.dumps then rejects non-finite floats and the client gets an
        unhandled 500 instead of the contract's 422.
        """

        def json_safe(value):
            if value is None or isinstance(value, (str, int, bool)):
                return value
            if isinstance(value, float):
                return value if math.isfinite(value) else str(value)
            if isinstance(value, (list, dict)):
                return value  # pydantic only puts primitives here; kept for safety
            # bytes / other objects (e.g. a raw non-JSON body): stringify,
            # truncated, so the error body stays small and JSON-legal.
            text = str(value)
            return text[:200] + ("…" if len(text) > 200 else "")

        return JSONResponse(
            status_code=422,
            content={"detail": [{**err, "input": json_safe(err.get("input"))} for err in exc.errors()]},
        )

    @app.get("/health", response_model=HealthResponse)
    def health(request: Request):
        reg: ModelRegistry = request.app.state.registry
        return HealthResponse(
            status="ok" if not reg.errors else "degraded",
            models=[
                {"machineType": mt, "model": p.meta.modelName, "modelVersion": p.meta.modelVersion,
                 "dataSource": p.meta.dataSource}
                for mt, p in reg.loaded.items()
            ],
            notLoaded=reg.errors,
        )

    @app.get("/models", response_model=List[ModelInfo])
    def models(request: Request):
        reg: ModelRegistry = request.app.state.registry
        return [
            ModelInfo(machineType=mt, model=p.meta.modelName, modelVersion=p.meta.modelVersion,
                      features=p.meta.features, seq_len=p.meta.seq_len, threshold=p.meta.threshold,
                      trainedAt=p.meta.trainedAt, dataSource=p.meta.dataSource)
            for mt, p in reg.loaded.items()
        ]

    return app


app = create_app()
