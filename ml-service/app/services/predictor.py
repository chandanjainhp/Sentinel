"""Windowing -> scaling -> inference -> score mapping. Stateless.

Numeric helpers live in ``scoring.py``; this module only adds the torch model.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Union

import numpy as np

from app import vendor_path  # noqa: F401  (must precede upstream imports)
from app.services import scoring
from app.services.artifacts import ModelMeta, paths_for, read_meta

from models.autoencoder_anomaly import LSTMAutoencoder  # vendored, unmodified

log = logging.getLogger("sentinel.ml")

# machineType -> file stem inside the models directory. Adding a machine type
# means adding a trained <stem>.pt/.meta.json pair and one line here.
SUPPORTED_MACHINE_TYPES: Dict[str, str] = {"generic_motor": "generic_motor"}


@dataclass
class Prediction:
    anomaly_score: float
    fault_probability: float
    fault_type: str
    suspect_channel: Optional[str]
    confidence: float


@dataclass
class NotEnoughData:
    have: int
    need: int


class Predictor:
    def __init__(self, meta: ModelMeta, model: LSTMAutoencoder):
        self.meta = meta
        self.model = model

    # -- loading ---------------------------------------------------------
    @classmethod
    def load(cls, base: Union[Path, str]) -> "Predictor":
        pt_path, meta_path = paths_for(base)
        if not pt_path.is_file():
            raise FileNotFoundError(f"checkpoint not found: {pt_path}")
        if not meta_path.is_file():
            raise FileNotFoundError(f"meta file not found: {meta_path}")
        meta = read_meta(meta_path)
        model = LSTMAutoencoder.load(pt_path)          # upstream: weights + config only
        cfg = model.config
        if cfg["input_size"] != len(meta.features) or cfg["seq_len"] != meta.seq_len:
            raise ValueError(
                f"checkpoint (input_size={cfg['input_size']}, seq_len={cfg['seq_len']}) "
                f"does not match meta (features={len(meta.features)}, seq_len={meta.seq_len})"
            )
        model.set_threshold(meta.threshold)            # upstream does not persist it
        return cls(meta, model)

    # -- inference -------------------------------------------------------
    def score(self, matrix: np.ndarray) -> Union[Prediction, NotEnoughData]:
        """``matrix``: (n_events, n_features) raw values in meta.features order."""
        m = self.meta
        n = matrix.shape[0]
        if n < m.seq_len:
            return NotEnoughData(have=n, need=m.seq_len)

        x = scoring.scale(matrix, m.mean, m.std)
        windows = scoring.make_windows(x, m.seq_len, stride=1).astype(np.float32)
        errors = self.model.predict_anomaly_score(windows)          # (N,) upstream MSE per window
        latest_error = float(errors[-1])

        anomaly_score = scoring.score_from_error(latest_error, m.threshold)
        fault_probability = scoring.exceedance_ratio(errors, m.threshold)
        confidence = scoring.confidence_from_windows(len(errors))

        suspect: Optional[str] = None
        fault_type = "none"
        if latest_error > m.threshold:
            recon = self.model.predict(windows[-1:])
            ch_err = scoring.per_channel_error(windows[-1:], recon)[0]
            suspect = m.features[int(np.argmax(ch_err))]
            fault_type = f"{suspect}_anomaly"

        return Prediction(
            anomaly_score=round(anomaly_score, 4),
            fault_probability=round(fault_probability, 4),
            fault_type=fault_type,
            suspect_channel=suspect,
            confidence=round(confidence, 4),
        )


class ModelRegistry:
    """Loaded once at startup; read-only afterwards (thread-safe for serving)."""

    def __init__(self) -> None:
        self.loaded: Dict[str, Predictor] = {}
        self.errors: Dict[str, str] = {}

    @classmethod
    def load_all(cls, models_dir: Path | str) -> "ModelRegistry":
        reg = cls()
        for machine_type, stem in SUPPORTED_MACHINE_TYPES.items():
            try:
                reg.loaded[machine_type] = Predictor.load(Path(models_dir) / stem)
                log.info("loaded %s (%s)", machine_type, reg.loaded[machine_type].meta.modelVersion)
            except Exception as exc:  # keep serving; /predict answers 503 for this type
                reg.errors[machine_type] = f"{type(exc).__name__}: {exc}"
                log.error("could not load model for %s: %s", machine_type, reg.errors[machine_type])
        return reg

    def get(self, machine_type: str) -> Optional[Predictor]:
        return self.loaded.get(machine_type)
