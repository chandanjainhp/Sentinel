"""Adversarial Scope A — contract, boundary, malformed-input, model-state,
concurrency and meta-robustness cases against the real FastAPI app.

Naming convention: every case maps to a line in the task's Scope A list and to
an entry in BUGS_FOUND.md when the CURRENT behavior looks wrong. Where the
contract does not define a behavior, the test pins what the service DOES today
and BUGS_FOUND.md carries the design question — nothing is silently skipped.

Uses the session-scoped untrained tiny model (see conftest): API plumbing and
shape guarantees, NOT detection quality.
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor

import pytest

pytest.importorskip("torch")
pytest.importorskip("fastapi")

import numpy as np  # noqa: E402

from tests.helpers import request_body  # noqa: E402
from train import synthetic  # noqa: E402

SEQ_LEN = 30  # keep in sync with conftest's tiny checkpoint


def healthy(n=60, seed=5):
    return synthetic.generate_healthy(n, seed=seed)


# ---------------------------------------------------------------------------
# 2. Boundary values
# ---------------------------------------------------------------------------


def test_exactly_seq_len_minus_one_is_insufficient_data(client):
    r = client.post("/predict", json=request_body(healthy(SEQ_LEN - 1)))
    assert r.status_code == 200
    b = r.json()
    assert b == {"machineId": "pump-7", "status": "insufficient_data", "have": SEQ_LEN - 1, "need": SEQ_LEN}


def test_exactly_seq_len_is_scored_and_60_events_give_full_confidence(client):
    r30 = client.post("/predict", json=request_body(healthy(SEQ_LEN))).json()
    assert r30["status"] == "ok"
    assert r30["confidence"] == pytest.approx(1 / 10)  # exactly 1 window of the 10 "recent"

    r60 = client.post("/predict", json=request_body(healthy(60))).json()
    assert r60["status"] == "ok"
    assert r60["confidence"] == 1.0  # 31 windows >= RECENT_WINDOWS


def test_zero_events_is_insufficient_data_have_zero(client):
    r = client.post("/predict", json=request_body(healthy(0)))
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "insufficient_data" and b["have"] == 0 and b["need"] == SEQ_LEN


def test_single_event_repeated_thirty_times_is_scored(client):
    """One degenerate sample repeated: uniform rows, zero intra-window variance.

    Must score (not insufficient_data) without dividing by zero anywhere."""
    data = np.repeat(healthy(1, seed=5), SEQ_LEN, axis=0)
    body = request_body(data)
    r = client.post("/predict", json=body)
    assert r.status_code == 200
    b = r.json()
    assert b["status"] == "ok"
    for k in ("anomalyScore", "faultProbability", "confidence"):
        assert 0.0 <= b[k] <= 1.0


def test_duplicate_timestamps_are_accepted(client):
    """Position in the array defines time; duplicated ISO timestamps are not
    rejected (contract: timestamps are validated for format only)."""
    data = healthy(SEQ_LEN + 5)
    events = request_body(data)["window"]
    for e in events[:5]:
        e["timestamp"] = events[0]["timestamp"]
    r = client.post("/predict", json={"machineId": "pump-7", "machineType": "generic_motor", "window": events})
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_out_of_order_timestamps_are_accepted_no_sorting(client):
    """Contract: 'Array order is what counts; the service does not sort.'
    A reversed window must still score — pinning that the service neither
    crashes nor reorders silently (ordering is the caller's duty)."""
    data = healthy(SEQ_LEN + 10, seed=7)
    fwd = request_body(data)["window"]
    rev = request_body(data[::-1])["window"]
    for body in (fwd, rev):
        r = client.post("/predict", json={"machineId": "pump-7", "machineType": "generic_motor", "window": body})
        assert r.status_code == 200 and r.json()["status"] == "ok"
    # Same input twice must be deterministic (stateless service).
    a = client.post("/predict", json={"machineId": "pump-7", "machineType": "generic_motor", "window": fwd}).json()
    b = client.post("/predict", json={"machineId": "pump-7", "machineType": "generic_motor", "window": fwd}).json()
    assert a["anomalyScore"] == b["anomalyScore"]


def test_window_spanning_a_huge_time_gap_still_scores(client):
    """Contract warns irregular spacing 'degrades results' but must not fail."""
    data = healthy(SEQ_LEN + 5, seed=9)
    events = request_body(data)["window"]
    events[10]["timestamp"] = "2020-01-01T00:00:00Z"  # six years earlier
    r = client.post("/predict", json={"machineId": "pump-7", "machineType": "generic_motor", "window": events})
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_max_500_events_accepted_and_501_rejected(client):
    ok = client.post("/predict", json=request_body(healthy(500, seed=11)))
    assert ok.status_code == 200 and ok.json()["status"] == "ok"
    over = client.post("/predict", json=request_body(healthy(501, seed=12)))
    assert over.status_code == 422  # window: List[Event] max_length=MAX_EVENTS


def test_huge_payload_1000_events_rejected_cleanly(client):
    r = client.post("/predict", json=request_body(healthy(1000, seed=13)))
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# 3. Malformed input
# ---------------------------------------------------------------------------


def test_window_as_single_object_not_array_is_422(client):
    body = request_body(healthy(SEQ_LEN))
    body["window"] = body["window"][0]
    r = client.post("/predict", json=body)
    assert r.status_code == 422


def test_window_as_string_is_422(client):
    body = request_body(healthy(SEQ_LEN))
    body["window"] = "not-a-list"
    assert client.post("/predict", json=body).status_code == 422


def test_missing_content_type_with_raw_json_is_422(client):
    body = request_body(healthy(SEQ_LEN))
    r = client.post("/predict", content=json.dumps(body))  # no application/json header
    assert r.status_code == 422


def test_nan_and_infinity_literals_are_rejected(client):
    """Raw JSON NaN/Infinity tokens: allow_inf_nan=False must reject them."""
    for bad in ("NaN", "Infinity", "-Infinity"):
        body = request_body(healthy(SEQ_LEN))
        body["window"][7]["values"]["temperature"] = f"__{bad}__"
        raw = json.dumps(body).replace(f'"__{bad}__"', bad)
        r = client.post(
            "/predict", content=raw, headers={"content-type": "application/json"}
        )
        assert r.status_code == 422, f"{bad} was not rejected"


def test_string_number_is_coerced_today_pinned(client):
    """Pinned CURRENT behavior: pydantic lax mode coerces the numeric string
    '1480' into 1480.0. Contract says values must be numbers; whether the
    service should accept numeric strings is a design question — flagged in
    BUGS_FOUND.md. Non-numeric strings remain 422 (covered in test_api)."""
    body = request_body(healthy(SEQ_LEN))
    body["window"][0]["values"]["rpm"] = "1480"
    assert client.post("/predict", json=body).status_code == 200


def test_boolean_value_is_coerced_today_pinned(client):
    """Pinned CURRENT behavior: JSON true becomes 1.0 rpm. bool is an int
    subclass and pydantic lax mode accepts it — a silent data-quality hazard
    flagged in BUGS_FOUND.md, deliberately NOT fixed in the test pass."""
    body = request_body(healthy(SEQ_LEN))
    body["window"][0]["values"]["rpm"] = True
    assert client.post("/predict", json=body).status_code == 200


def test_null_value_is_rejected(client):
    body = request_body(healthy(SEQ_LEN))
    body["window"][0]["values"]["current"] = None
    assert client.post("/predict", json=body).status_code == 422


def test_missing_machine_id_and_empty_machine_id_are_422(client):
    body = request_body(healthy(SEQ_LEN))
    del body["machineId"]
    assert client.post("/predict", json=body).status_code == 422
    body2 = request_body(healthy(SEQ_LEN))
    body2["machineId"] = ""
    assert client.post("/predict", json=body2).status_code == 422


def test_missing_window_is_422(client):
    assert client.post("/predict", json={"machineId": "x", "machineType": "generic_motor"}).status_code == 422


def test_oversized_machine_id_and_machine_type_are_422(client):
    body = request_body(healthy(SEQ_LEN))
    body["machineId"] = "m" * 129
    assert client.post("/predict", json=body).status_code == 422
    body2 = request_body(healthy(SEQ_LEN))
    body2["machineType"] = "g" * 65
    assert client.post("/predict", json=body2).status_code == 422


def test_event_missing_timestamp_is_422(client):
    body = request_body(healthy(SEQ_LEN))
    del body["window"][3]["timestamp"]
    assert client.post("/predict", json=body).status_code == 422


def test_non_iso_timestamp_is_422(client):
    body = request_body(healthy(SEQ_LEN))
    body["window"][0]["timestamp"] = "24th of September"
    assert client.post("/predict", json=body).status_code == 422


def test_extra_channel_with_non_numeric_value_is_rejected_today(client):
    """CONTRACT.md says extra channels are 'ignored' — but pydantic validates
    the whole values dict, so a non-numeric EXTRA channel 422s. Pinned as
    current behavior; contract nuance recorded in BUGS_FOUND.md."""
    body = request_body(healthy(SEQ_LEN))
    for e in body["window"]:
        e["values"]["pressure"] = 3.0  # numeric extra channel IS ignored
    assert client.post("/predict", json=body).json()["status"] == "ok"
    body2 = request_body(healthy(SEQ_LEN))
    body2["window"][0]["values"]["pressure"] = "high"
    assert client.post("/predict", json=body2).status_code == 422


def test_negative_rpm_is_accepted_today_contract_gap(client):
    """Physically impossible but schema-legal: the service scores it. The
    contract never forbids it — flagged in BUGS_FOUND.md as a CONTRACT.md
    decision, NOT fixed here."""
    data = healthy(SEQ_LEN, seed=3)
    body = request_body(data)
    for e in body["window"]:
        e["values"]["rpm"] = -1500.0
    r = client.post("/predict", json=body)
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_missing_channel_in_first_event_names_index_zero(client):
    body = request_body(healthy(SEQ_LEN))
    del body["window"][0]["values"]["rpm"]
    r = client.post("/predict", json=body)
    assert r.status_code == 422
    assert "window[0]" in r.json()["detail"] and "rpm" in r.json()["detail"]


def test_missing_channel_in_last_event_names_last_index(client):
    body = request_body(healthy(SEQ_LEN))
    del body["window"][-1]["values"]["current"]
    r = client.post("/predict", json=body)
    assert r.status_code == 422
    assert f"window[{SEQ_LEN - 1}]" in r.json()["detail"]


# ---------------------------------------------------------------------------
# 4. Model state: 400/503, startup failures, concurrency
# ---------------------------------------------------------------------------


def test_unknown_machine_type_400_lists_supported(client):
    r = client.post("/predict", json=request_body(healthy(SEQ_LEN), machine_type="wind_turbine"))
    assert r.status_code == 400
    assert "generic_motor" in r.json()["detail"]


def test_predict_with_no_loaded_model_is_503_with_reason(empty_client):
    r = empty_client.post("/predict", json=request_body(healthy(SEQ_LEN)))
    assert r.status_code == 503
    detail = r.json()["detail"]
    assert "not loaded" in detail
    # The registry's recorded failure reason is surfaced, not swallowed.
    assert "no model file present" in detail or "Error" in detail or "error" in detail


def test_health_degraded_names_the_model(empty_client):
    h = empty_client.get("/health").json()
    assert h["status"] == "degraded" and "generic_motor" in h["notLoaded"]
    assert h["models"] == []


def test_concurrent_predicts_are_consistent_and_stable(client):
    """Thread-safety: N workers x M calls of healthy and faulty payloads.
    Every response must be 200, identical inputs give identical scores, and
    the service is healthy afterwards (no shared-state corruption)."""
    healthy_body = request_body(healthy(SEQ_LEN, seed=21))
    faulty = healthy(SEQ_LEN, seed=22)
    faulty[:, 1] += 8.0  # vibration ramp way past healthy range
    faulty_body = request_body(faulty)

    def call(i):
        body = healthy_body if i % 2 == 0 else faulty_body
        r = client.post("/predict", json=body)
        assert r.status_code == 200, r.text
        return r.json()

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(call, range(96)))

    healthy_scores = {r["anomalyScore"] for i, r in enumerate(results) if i % 2 == 0}
    faulty_scores = {r["anomalyScore"] for i, r in enumerate(results) if i % 2 != 0}
    assert len(healthy_scores) == 1, f"healthy score diverged under concurrency: {healthy_scores}"
    assert len(faulty_scores) == 1, f"faulty score diverged under concurrency: {faulty_scores}"
    assert client.get("/health").json()["status"] == "ok"


# ---------------------------------------------------------------------------
# 5. Score correctness (mapping anchors via the pure function + e2e direction)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("mult", "expected"),
    [
        (0.0, 0.0),
        (0.25, 0.125),
        (0.5, 0.25),
        (0.75, 0.375),
        (1.0, 0.5),  # the calibrated threshold anchors at exactly 0.5
        (1.5, 0.75),
        (1.8, 0.9),
        (2.0, 1.0),
        (10.0, 1.0),
        (100.0, 1.0),
    ],
)
def test_score_mapping_sweep_across_threshold_multiples(mult, expected):
    from app.services.scoring import score_from_error

    assert score_from_error(mult * 0.5, 0.5) == pytest.approx(expected, abs=1e-12)


def test_score_mapping_is_monotonic_and_never_exceeds_one():
    from app.services.scoring import score_from_error

    errors = [i * 0.05 for i in range(0, 60)]  # 0.0 .. 2.95
    scores = [score_from_error(e, 0.5) for e in errors]
    assert all(b >= a for a, b in zip(scores, scores[1:]))
    assert all(0.0 <= s <= 1.0 for s in scores)
    assert scores[-1] == 1.0  # error >> threshold clips to 1.0, never above


def test_score_mapping_rejects_invalid_threshold_and_nonfinite_error():
    from app.services.scoring import score_from_error

    for bad_threshold in (0.0, -1.0, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            score_from_error(1.0, bad_threshold)
    for bad_error in (float("nan"), float("inf"), float("-inf")):
        with pytest.raises(ValueError):
            score_from_error(bad_error, 0.5)


def test_end_to_end_mapping_direction_higher_error_scores_higher(client):
    """On the same tiny model: a healthy window must score lower than the same
    window with a large vibration fault injected."""
    base = request_body(healthy(SEQ_LEN, seed=31))
    r_healthy = client.post("/predict", json=base).json()

    faulty = healthy(SEQ_LEN, seed=31)
    faulty[:, 1] += 8.0
    r_faulty = client.post("/predict", json=request_body(faulty)).json()

    assert r_healthy["anomalyScore"] < r_faulty["anomalyScore"]
    assert r_faulty["faultType"].endswith("_anomaly")
    assert r_healthy["rulValue"] is None and r_faulty["rulValue"] is None


# ---------------------------------------------------------------------------
# 6. meta.json robustness: loud failure at startup, never silent misscaling
# ---------------------------------------------------------------------------


def _write_meta(path_dir, features, seq_len=SEQ_LEN, threshold=0.5):
    from app.services.artifacts import ModelMeta, write_meta
    from train import synthetic

    ref = synthetic.generate_healthy(2000, seed=0)
    k = len(features)
    write_meta(
        ModelMeta(
            machineType="generic_motor",
            modelVersion="0.0.0+adversarial",
            features=features,
            seq_len=seq_len,
            mean=ref.mean(0).tolist()[:k],
            std=ref.std(0).tolist()[:k],
            threshold=threshold,
            trainedAt="2026-01-01T00:00:00Z",
            dataSource="adversarial",
            windowCount=0,
        ),
        path_dir / "generic_motor.meta.json",
    )


@pytest.fixture(scope="module")
def corrupt_models_dir(tmp_path_factory, tiny_models_dir):
    """Directory where generic_motor.pt is garbage bytes + meta is valid JSON
    of the wrong shape (feature count mismatch)."""
    d = tmp_path_factory.mktemp("corrupt")
    (d / "generic_motor.pt").write_bytes(b"this is not a torch zipfile")
    ref = synthetic.generate_healthy(100, seed=1)
    from app.services.artifacts import ModelMeta, write_meta

    write_meta(
        ModelMeta(
            machineType="generic_motor",
            modelVersion="0.0.0+adversarial",
            features=["temperature", "vibration", "current"],  # 3 != checkpoint's 4
            seq_len=SEQ_LEN,
            mean=ref.mean(0).tolist()[:3],
            std=ref.std(0).tolist()[:3],
            threshold=0.5,
            trainedAt="2026-01-01T00:00:00Z",
            dataSource="adversarial",
            windowCount=0,
        ),
        d / "generic_motor.meta.json",
    )
    return d


@pytest.fixture()
def corrupt_client(corrupt_models_dir):
    from fastapi.testclient import TestClient
    from app.main import create_app

    with TestClient(create_app(corrupt_models_dir)) as c:
        yield c


def test_corrupt_checkpoint_fails_loud_but_service_still_serves(corrupt_client):
    h = corrupt_client.get("/health").json()
    assert h["status"] == "degraded"
    reason = h["notLoaded"]["generic_motor"]
    assert reason  # names the exception — a human can debug from /health
    r = corrupt_client.post("/predict", json=request_body(healthy(SEQ_LEN)))
    assert r.status_code == 503
    assert "not loaded" in r.json()["detail"]


def test_corrupt_meta_json_is_rejected_not_silently_misscaled(tmp_path, tiny_models_dir):
    """Corrupt meta.json -> registry records the parse error; nothing loads."""
    import shutil

    from fastapi.testclient import TestClient
    from app.main import create_app

    d = tmp_path
    shutil.copy(tiny_models_dir / "generic_motor.pt", d / "generic_motor.pt")
    (d / "generic_motor.meta.json").write_text("{ not valid json !!!")
    with TestClient(create_app(d)) as c:
        h = c.get("/health").json()
        assert h["status"] == "degraded" and "generic_motor" in h["notLoaded"]
        assert c.post("/predict", json=request_body(healthy(SEQ_LEN))).status_code == 503


def test_meta_feature_count_mismatch_is_refused_at_load(tmp_path, tiny_models_dir):
    """Predictor.load must refuse a checkpoint/meta pair whose feature counts
    disagree — this is the 'silently misscale' guard."""
    import shutil

    from app.services.predictor import Predictor

    d = tmp_path
    shutil.copy(tiny_models_dir / "generic_motor.pt", d / "generic_motor.pt")
    _write_meta(d, features=["temperature", "vibration", "current"])  # 3 vs 4
    with pytest.raises(ValueError, match="does not match meta"):
        Predictor.load(d / "generic_motor")


def test_missing_meta_file_is_a_loud_missing_file(tmp_path, tiny_models_dir):
    import shutil

    from app.services.predictor import Predictor

    shutil.copy(tiny_models_dir / "generic_motor.pt", tmp_path / "generic_motor.pt")
    with pytest.raises(FileNotFoundError, match="meta"):
        Predictor.load(tmp_path)


def test_meta_with_zero_std_is_rejected(tmp_path):
    """std=0 would scale-division-by-zero at serve time; must be refused on
    load (validate: std finite and > 0)."""
    from app.services.artifacts import ModelMeta

    meta = ModelMeta(
        machineType="generic_motor",
        modelVersion="0.0.0+adversarial",
        features=["a", "b"],
        seq_len=4,
        mean=[1.0, 2.0],
        std=[0.0, 1.0],
        threshold=0.5,
        trainedAt="2026-01-01T00:00:00Z",
        dataSource="adversarial",
        windowCount=0,
    )
    with pytest.raises(ValueError, match="std"):
        meta.validate()
