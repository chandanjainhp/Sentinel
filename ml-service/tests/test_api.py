"""API behaviour with an UNTRAINED tiny model: plumbing only, not detection quality."""
import pytest

pytest.importorskip("torch")
pytest.importorskip("fastapi")

from tests.helpers import request_body  # noqa: E402
from train import synthetic  # noqa: E402


def healthy(n=60, seed=5):
    return synthetic.generate_healthy(n, seed=seed)


def test_unknown_machine_type_is_400(client):
    r = client.post("/predict", json=request_body(healthy(), machine_type="submarine"))
    assert r.status_code == 400 and "Unknown machineType" in r.json()["detail"]


def test_model_not_loaded_is_503(empty_client):
    r = empty_client.post("/predict", json=request_body(healthy()))
    assert r.status_code == 503 and "not loaded" in r.json()["detail"]


def test_missing_channel_is_422_and_names_the_channel(client):
    body = request_body(healthy())
    del body["window"][3]["values"]["vibration"]
    r = client.post("/predict", json=body)
    assert r.status_code == 422
    assert "window[3]" in r.json()["detail"] and "vibration" in r.json()["detail"]


def test_malformed_request_is_422(client):
    assert client.post("/predict", json={"machineId": "x"}).status_code == 422
    body = request_body(healthy(35))
    body["window"][0]["values"]["rpm"] = "fast"
    assert client.post("/predict", json=body).status_code == 422


def test_too_few_events_is_200_insufficient_data(client):
    r = client.post("/predict", json=request_body(healthy(12)))
    assert r.status_code == 200
    assert r.json() == {"machineId": "pump-7", "status": "insufficient_data", "have": 12, "need": 30}


def test_empty_window_is_insufficient_data(client):
    r = client.post("/predict", json=request_body(healthy(0)))
    assert r.status_code == 200 and r.json()["have"] == 0


def test_exactly_one_window_is_scored(client):
    assert client.post("/predict", json=request_body(healthy(30))).json()["status"] == "ok"


def test_ok_response_matches_contract(client):
    r = client.post("/predict", json=request_body(healthy(60)))
    assert r.status_code == 200
    b = r.json()
    assert set(b) == {"machineId", "status", "model", "modelVersion", "anomalyScore", "faultProbability",
                      "faultType", "suspectChannel", "rulValue", "rulUnit", "confidence", "methods"}
    assert b["status"] == "ok" and b["model"] == "lstm_autoencoder" and b["modelVersion"] == "0.0.0+untrained-test"
    assert b["rulValue"] is None and b["rulUnit"] is None          # null == "not available"
    for k in ("anomalyScore", "faultProbability", "confidence"):
        assert 0.0 <= b[k] <= 1.0
    assert b["methods"] == {"anomalyScore": "lstm_autoencoder_reconstruction_error",
                            "faultProbability": "recent_exceedance_ratio",
                            "faultType": "top_error_channel", "rul": "not_available"}
    if b["faultType"] == "none":
        assert b["suspectChannel"] is None
    else:
        assert b["suspectChannel"] in synthetic.FEATURES and b["faultType"] == b["suspectChannel"] + "_anomaly"


def test_extra_channels_are_ignored(client):
    body = request_body(healthy(35))
    for e in body["window"]:
        e["values"]["pressure"] = 3.0
    assert client.post("/predict", json=body).json()["status"] == "ok"


def test_health_and_models(client):
    h = client.get("/health").json()
    assert h["status"] == "ok" and h["models"][0]["machineType"] == "generic_motor"
    assert h["models"][0]["modelVersion"] == "0.0.0+untrained-test"
    m = client.get("/models").json()[0]
    assert m["features"] == synthetic.FEATURES and m["seq_len"] == 30 and m["threshold"] == 0.5
    assert {"trainedAt", "dataSource"} <= set(m)


def test_health_is_degraded_when_model_missing(empty_client):
    h = empty_client.get("/health").json()
    assert h["status"] == "degraded" and "generic_motor" in h["notLoaded"] and h["models"] == []
