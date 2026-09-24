"""Torch-free tests: score mapping, windowing, statistics, synthetic data.

Deliberately does not import pytest so it can run anywhere numpy exists.
"""
import math
from contextlib import contextmanager

import numpy as np

from app.services import scoring
from train import synthetic


@contextmanager
def raises(exc):
    try:
        yield
    except exc:
        return
    raise AssertionError(f"{exc.__name__} not raised")


# ---- score mapping -------------------------------------------------------
def test_error_equal_to_threshold_maps_to_half():
    for thr in (0.01, 0.3, 1.0, 42.0):
        assert math.isclose(scoring.score_from_error(thr, thr), 0.5)


def test_score_clips_at_zero_and_one():
    assert scoring.score_from_error(0.0, 0.3) == 0.0
    assert scoring.score_from_error(2 * 0.3, 0.3) == 1.0
    assert scoring.score_from_error(1e9, 0.3) == 1.0
    assert scoring.score_from_error(-5.0, 0.3) == 0.0


def test_score_is_monotonic_and_severity_cutoffs_correspond_to_error_multiples():
    thr = 0.2
    assert math.isclose(scoring.score_from_error(1.5 * thr, thr), scoring.WARNING_SCORE)
    assert math.isclose(scoring.score_from_error(1.8 * thr, thr), scoring.CRITICAL_SCORE)
    xs = [scoring.score_from_error(e, thr) for e in np.linspace(0, 0.5, 50)]
    assert xs == sorted(xs)


def test_score_rejects_bad_threshold_or_error():
    for bad in (0.0, -1.0, float("nan"), float("inf")):
        with raises(ValueError):
            scoring.score_from_error(0.1, bad)
    with raises(ValueError):
        scoring.score_from_error(float("nan"), 0.1)


# ---- windowing / scaling -------------------------------------------------
def test_make_windows_stride_1_shape_order_and_content():
    x = np.arange(12, dtype=float).reshape(6, 2)      # 6 steps, 2 features
    w = scoring.make_windows(x, seq_len=3)
    assert w.shape == (4, 3, 2)
    assert (w[0] == x[0:3]).all() and (w[-1] == x[3:6]).all()   # oldest first


def test_make_windows_stride_and_too_short():
    x = np.arange(20, dtype=float).reshape(10, 2)
    assert scoring.make_windows(x, 4, stride=3).shape == (3, 4, 2)   # starts 0,3,6
    assert scoring.make_windows(x[:3], 4).shape == (0, 4, 2)


def test_sixty_events_with_seq_len_30_gives_31_windows():
    assert scoring.make_windows(np.zeros((60, 4)), 30).shape == (31, 30, 4)


def test_scale_uses_saved_statistics_in_feature_order():
    x = np.array([[10.0, 100.0], [12.0, 90.0]])
    out = scoring.scale(x, mean=[10.0, 100.0], std=[2.0, 5.0])
    assert np.allclose(out, [[0.0, 0.0], [1.0, -2.0]])


# ---- building the matrix -------------------------------------------------
def test_build_matrix_orders_by_features_and_ignores_extra_channels():
    ev = [{"rpm": 1500.0, "temperature": 80.0, "pressure": 3.0}]
    m = scoring.build_matrix(ev, ["temperature", "rpm"])
    assert m.tolist() == [[80.0, 1500.0]]


def test_build_matrix_reports_index_and_missing_channels():
    ev = [{"a": 1.0, "b": 2.0}, {"a": 1.0}]
    with raises(scoring.MissingChannel) as _:
        scoring.build_matrix(ev, ["a", "b"])
    try:
        scoring.build_matrix(ev, ["a", "b"])
    except scoring.MissingChannel as e:
        assert e.index == 1 and e.missing == ["b"]


# ---- statistics ----------------------------------------------------------
def test_exceedance_ratio_counts_only_recent_windows():
    errors = np.array([9, 9, 9, 9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9], dtype=float)
    # only the last 10 values count; the four leading 9s must be ignored
    tail = errors[-10:]
    assert math.isclose(scoring.exceedance_ratio(errors, 0.5, recent=10), float((tail > 0.5).mean()))
    assert scoring.exceedance_ratio(np.array([0.1, 0.2]), 0.5) == 0.0
    assert scoring.exceedance_ratio(np.array([1.0, 1.0]), 0.5) == 1.0
    with raises(ValueError):
        scoring.exceedance_ratio(np.array([]), 0.5)


def test_confidence_is_data_sufficiency_only():
    assert scoring.confidence_from_windows(0) == 0.0
    assert scoring.confidence_from_windows(1) == 0.1
    assert scoring.confidence_from_windows(10) == 1.0
    assert scoring.confidence_from_windows(31) == 1.0


def test_per_channel_error_identifies_the_deviating_channel():
    x = np.zeros((1, 5, 3))
    recon = x.copy()
    recon[0, :, 1] = 2.0
    ce = scoring.per_channel_error(x, recon)
    assert ce.shape == (1, 3) and int(ce[0].argmax()) == 1


# ---- synthetic generator -------------------------------------------------
def test_synthetic_is_deterministic_finite_and_plausible():
    a = synthetic.generate_healthy(3000, seed=1)
    b = synthetic.generate_healthy(3000, seed=1)
    c = synthetic.generate_healthy(3000, seed=2)
    assert a.shape == (3000, 4) and np.isfinite(a).all()
    assert (a == b).all() and not (a == c).all()
    assert 60 < a[:, 0].mean() < 85 and 1.5 < a[:, 1].mean() < 3.5


def test_fault_injection_only_touches_vibration_and_does_not_mutate_input():
    d = synthetic.generate_healthy(60, seed=3)
    before = d.copy()
    f = synthetic.inject_vibration_fault(d, start=30, kind="ramp", magnitude=4.5)
    assert (d == before).all()
    assert (f[:, [0, 2, 3]] == d[:, [0, 2, 3]]).all()
    assert (f[:30, 1] == d[:30, 1]).all() and f[-1, 1] > d[-1, 1] + 4.0
    s = synthetic.inject_vibration_fault(d, start=30, kind="spike", magnitude=5.0)
    assert (s[-5:, 1] - d[-5:, 1] == 5.0).all() and (s[:-5, 1] == d[:-5, 1]).all()
