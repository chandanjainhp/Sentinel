"""Detection-quality tests against the REAL synthetic-trained checkpoint.

Skipped (with instructions) until models/generic_motor.pt exists.
Windows come from a seed the trainer never used (training used seed 42).
"""
import numpy as np
import pytest

from train import synthetic

pytest.importorskip("torch")

HEALTHY_SEEDS = range(1000, 1020)


def _score(pred, matrix):
    return pred.score(matrix)


def test_healthy_windows_score_below_half(trained_predictor):
    scores = [_score(trained_predictor, synthetic.generate_healthy(60, seed=s)).anomaly_score for s in HEALTHY_SEEDS]
    # The threshold is the p95 of training errors, so a few healthy windows may
    # legitimately land near/above 0.5. Require the typical case, not every case.
    assert np.median(scores) < 0.5, scores
    assert np.mean(np.array(scores) < 0.5) >= 0.85, scores


def test_vibration_ramp_scores_warning_and_blames_vibration(trained_predictor):
    for seed in (2001, 2002, 2003):
        d = synthetic.inject_vibration_fault(synthetic.generate_healthy(60, seed=seed), start=30, kind="ramp")
        r = _score(trained_predictor, d)
        assert r.anomaly_score >= 0.75, (seed, r)
        assert r.suspect_channel == "vibration" and r.fault_type == "vibration_anomaly"
        assert r.fault_probability > 0.0


def test_vibration_spike_scores_warning_and_blames_vibration(trained_predictor):
    d = synthetic.inject_vibration_fault(synthetic.generate_healthy(60, seed=2100), start=30, kind="spike", magnitude=5.0)
    r = _score(trained_predictor, d)
    assert r.anomaly_score >= 0.75 and r.suspect_channel == "vibration"


def test_faulty_scores_higher_than_healthy_on_same_data(trained_predictor):
    h = synthetic.generate_healthy(60, seed=2200)
    f = synthetic.inject_vibration_fault(h, start=30, kind="ramp")
    assert _score(trained_predictor, f).anomaly_score > _score(trained_predictor, h).anomaly_score


def test_healthy_window_reports_no_fault_type(trained_predictor):
    r = _score(trained_predictor, synthetic.generate_healthy(60, seed=1000))
    if r.anomaly_score < 0.5:
        assert r.fault_type == "none" and r.suspect_channel is None
