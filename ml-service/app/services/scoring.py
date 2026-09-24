"""Pure-numpy scoring helpers. NO torch import here (unit-testable anywhere).

Every number the API reports is derived by a function in this file or by the
autoencoder's reconstruction error. Nothing is a hand-tuned heuristic.
"""
from __future__ import annotations

import math
from typing import Dict, List, Sequence

import numpy as np

# How many of the most recent windows count as "recent" for faultProbability.
RECENT_WINDOWS = 10

# Suggested severity cut-offs for the CONSUMING app (documented in CONTRACT.md).
# They are NOT applied by this service.
WARNING_SCORE = 0.75   # error >= 1.5 x threshold
CRITICAL_SCORE = 0.90  # error >= 1.8 x threshold

_EPS = 1e-8


class MissingChannel(ValueError):
    """An event lacks one or more required channels."""

    def __init__(self, index: int, missing: Sequence[str]):
        self.index = index
        self.missing = list(missing)
        super().__init__(
            f"Event at window[{index}] is missing required channel(s): {self.missing}"
        )


# ---------------------------------------------------------------------------
# THE score mapping. One function, one place.
# ---------------------------------------------------------------------------
def score_from_error(error: float, threshold: float) -> float:
    """score = clip(error / (2 * threshold), 0, 1).

    The calibrated threshold maps to exactly 0.5; 2x threshold and above -> 1.0.
    """
    if not (isinstance(threshold, (int, float)) and math.isfinite(threshold) and threshold > 0):
        raise ValueError(f"threshold must be a positive finite number, got {threshold!r}")
    if not math.isfinite(error):
        raise ValueError(f"error must be finite, got {error!r}")
    return float(min(1.0, max(0.0, error / (2.0 * threshold))))


# ---------------------------------------------------------------------------
# Windowing / scaling
# ---------------------------------------------------------------------------
def build_matrix(events: Sequence[Dict[str, float]], features: Sequence[str]) -> np.ndarray:
    """Turn a list of ``values`` dicts into an (n, F) float64 matrix in
    ``features`` order. Extra channels are ignored. Raises MissingChannel."""
    rows: List[List[float]] = []
    for i, values in enumerate(events):
        missing = [f for f in features if f not in values]
        if missing:
            raise MissingChannel(i, missing)
        rows.append([float(values[f]) for f in features])
    if not rows:
        return np.empty((0, len(features)), dtype=np.float64)
    return np.asarray(rows, dtype=np.float64)


def scale(x: np.ndarray, mean: Sequence[float], std: Sequence[float]) -> np.ndarray:
    """(x - mean) / std per channel, using the statistics saved at training time."""
    mean_a = np.asarray(mean, dtype=np.float64)
    std_a = np.maximum(np.asarray(std, dtype=np.float64), _EPS)
    return (x - mean_a) / std_a


def make_windows(x: np.ndarray, seq_len: int, stride: int = 1) -> np.ndarray:
    """(n, F) -> (N, seq_len, F) windows, oldest first. Returns a copy."""
    if x.ndim != 2:
        raise ValueError("x must be 2-D (time, features)")
    if seq_len < 1 or stride < 1:
        raise ValueError("seq_len and stride must be >= 1")
    n = x.shape[0]
    if n < seq_len:
        return np.empty((0, seq_len, x.shape[1]), dtype=x.dtype)
    view = np.lib.stride_tricks.sliding_window_view(x, window_shape=seq_len, axis=0)
    # view shape: (n - seq_len + 1, F, seq_len) -> (N, seq_len, F)
    return np.ascontiguousarray(view[::stride].transpose(0, 2, 1))


# ---------------------------------------------------------------------------
# Statistics reported by the API
# ---------------------------------------------------------------------------
def per_channel_error(x: np.ndarray, recon: np.ndarray) -> np.ndarray:
    """Mean squared reconstruction error per channel: (N, T, F) -> (N, F)."""
    return np.mean((x - recon) ** 2, axis=1)


def exceedance_ratio(errors: np.ndarray, threshold: float, recent: int = RECENT_WINDOWS) -> float:
    """Share of the most recent ``recent`` windows whose error exceeds threshold.

    A persistence statistic, NOT a trained classifier's probability.
    """
    if len(errors) == 0:
        raise ValueError("errors is empty")
    tail = np.asarray(errors)[-recent:]
    return float(np.mean(tail > threshold))


def confidence_from_windows(n_windows: int, recent: int = RECENT_WINDOWS) -> float:
    """Data-sufficiency confidence: how much of the intended recent-window
    evidence was actually available. min(1, n_windows / recent).

    It says nothing about model accuracy and is not a calibrated probability.
    """
    if n_windows <= 0:
        return 0.0
    return float(min(1.0, n_windows / float(recent)))
