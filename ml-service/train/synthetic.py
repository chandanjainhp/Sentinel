"""Synthetic HEALTHY multi-channel motor data + fault injection helpers.

This is a plausible-looking simulation, not real machine data. Anything
trained on it is a DEMO model (see README).

Structure: a shared, slowly varying "load" factor (daily cycle + AR(1)
wander) drives all channels with different gains, plus per-channel sensor
noise and a slow thermal drift on temperature. Because the channels are
correlated, the autoencoder has real structure to learn.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Sequence

import numpy as np

FEATURES: List[str] = ["temperature", "vibration", "current", "rpm"]
DEFAULT_INTERVAL_S = 60.0  # one event per minute


def _ar1(rng: np.random.Generator, n: int, phi: float, sigma: float) -> np.ndarray:
    out = np.empty(n)
    out[0] = 0.0
    eps = rng.normal(0.0, sigma, n)
    for i in range(1, n):
        out[i] = phi * out[i - 1] + eps[i]
    return out


def _ema(x: np.ndarray, alpha: float) -> np.ndarray:
    out = np.empty_like(x)
    out[0] = x[0]
    for i in range(1, len(x)):
        out[i] = alpha * x[i] + (1 - alpha) * out[i - 1]
    return out


def generate_healthy(
    n: int, seed: int = 0, interval_s: float = DEFAULT_INTERVAL_S
) -> np.ndarray:
    """Return an (n, 4) array with columns == FEATURES (healthy operation)."""
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.float64)
    day = 86400.0 / interval_s
    phase = rng.uniform(0, 2 * np.pi)
    phase2 = rng.uniform(0, 2 * np.pi)

    load = 0.5 * np.sin(2 * np.pi * t / day + phase) + _ar1(rng, n, phi=0.98, sigma=0.03)
    drift = 0.8 * np.sin(2 * np.pi * t / (7 * day) + phase2)  # slow, ~weekly, in deg C

    temperature = 72.0 + 6.0 * _ema(load, 0.05) + drift + rng.normal(0, 0.4, n)  # thermal lag
    vibration = 2.4 + 0.5 * load + rng.normal(0, 0.12, n)
    current = 14.0 + 3.0 * load + rng.normal(0, 0.25, n)
    rpm = 1485.0 - 15.0 * load + rng.normal(0, 2.0, n)

    vibration = np.clip(vibration, 0.05, None)
    return np.column_stack([temperature, vibration, current, rpm])


def timestamps(n: int, start: datetime | None = None, interval_s: float = DEFAULT_INTERVAL_S) -> List[str]:
    """ISO-8601 UTC timestamps, oldest first."""
    start = start or datetime(2026, 1, 1, tzinfo=timezone.utc)
    return [(start + timedelta(seconds=interval_s * i)).isoformat().replace("+00:00", "Z") for i in range(n)]


def inject_vibration_fault(
    data: np.ndarray,
    start: int,
    kind: str = "ramp",
    magnitude: float = 4.5,
    features: Sequence[str] = FEATURES,
) -> np.ndarray:
    """Return a COPY of ``data`` with a vibration fault from row ``start`` on.

    kind="ramp":  linear rise from 0 to +magnitude (in vibration units) by the last row.
    kind="spike": +magnitude on the last 5 rows only.
    Healthy vibration is ~2.4, so magnitude 4.5 reaches ~7 (the contract's example).
    """
    out = data.copy()
    col = list(features).index("vibration")
    n = out.shape[0]
    if not 0 <= start < n:
        raise ValueError("start out of range")
    if kind == "ramp":
        out[start:, col] += np.linspace(0.0, magnitude, n - start)
    elif kind == "spike":
        out[max(start, n - 5):, col] += magnitude
    else:
        raise ValueError("kind must be 'ramp' or 'spike'")
    return out
