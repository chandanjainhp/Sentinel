"""Sidecar metadata (`<name>.meta.json`). Torch-free.

Upstream ``BaseModel.save()`` persists only ``state_dict`` + ``config``. The
anomaly threshold, the scaler statistics and the feature order are NOT saved,
so they live here. Both training and serving use this one module.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

SCHEMA_VERSION = 1
MODEL_NAME = "lstm_autoencoder"


def paths_for(base: Path | str) -> tuple[Path, Path]:
    """`models/generic_motor` (or with .pt) -> (.pt path, .meta.json path)."""
    base = Path(base)
    if base.suffix == ".pt":
        base = base.with_suffix("")
    return base.with_name(base.name + ".pt"), base.with_name(base.name + ".meta.json")


@dataclass
class ModelMeta:
    machineType: str
    modelVersion: str
    features: List[str]
    seq_len: int
    mean: List[float]
    std: List[float]
    threshold: float
    trainedAt: str
    dataSource: str
    windowCount: int
    thresholdPercentile: float = 95.0
    validation: Optional[Dict[str, Any]] = None
    training: Optional[Dict[str, Any]] = None
    modelName: str = MODEL_NAME
    schemaVersion: int = SCHEMA_VERSION

    def validate(self) -> None:
        f = len(self.features)
        if f == 0 or len(set(self.features)) != f:
            raise ValueError("features must be a non-empty list of unique names")
        if len(self.mean) != f or len(self.std) != f:
            raise ValueError("mean/std length must equal number of features")
        if not all(math.isfinite(v) for v in self.mean):
            raise ValueError("mean contains non-finite values")
        if not all(math.isfinite(v) and v > 0 for v in self.std):
            raise ValueError("std must be finite and > 0 for every feature")
        if not (math.isfinite(self.threshold) and self.threshold > 0):
            raise ValueError("threshold must be finite and > 0")
        if self.seq_len < 2:
            raise ValueError("seq_len must be >= 2")
        if self.schemaVersion != SCHEMA_VERSION:
            raise ValueError(f"unsupported meta schemaVersion {self.schemaVersion}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schemaVersion": self.schemaVersion,
            "modelName": self.modelName,
            "machineType": self.machineType,
            "modelVersion": self.modelVersion,
            "features": list(self.features),
            "seq_len": int(self.seq_len),
            "mean": [float(v) for v in self.mean],
            "std": [float(v) for v in self.std],
            "threshold": float(self.threshold),
            "thresholdPercentile": float(self.thresholdPercentile),
            "trainedAt": self.trainedAt,
            "dataSource": self.dataSource,
            "windowCount": int(self.windowCount),
            "validation": self.validation,
            "training": self.training,
        }

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ModelMeta":
        try:
            meta = cls(
                machineType=d["machineType"],
                modelVersion=d["modelVersion"],
                features=list(d["features"]),
                seq_len=int(d["seq_len"]),
                mean=[float(v) for v in d["mean"]],
                std=[float(v) for v in d["std"]],
                threshold=float(d["threshold"]),
                trainedAt=d["trainedAt"],
                dataSource=d["dataSource"],
                windowCount=int(d["windowCount"]),
                thresholdPercentile=float(d.get("thresholdPercentile", 95.0)),
                validation=d.get("validation"),
                training=d.get("training"),
                modelName=d.get("modelName", MODEL_NAME),
                schemaVersion=int(d.get("schemaVersion", SCHEMA_VERSION)),
            )
        except KeyError as e:
            raise ValueError(f"meta.json is missing required key {e}") from e
        meta.validate()
        return meta


def write_meta(meta: ModelMeta, path: Path | str) -> None:
    meta.validate()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(meta.to_dict(), indent=2) + "\n", encoding="utf-8")


def read_meta(path: Path | str) -> ModelMeta:
    return ModelMeta.from_dict(json.loads(Path(path).read_text(encoding="utf-8")))
