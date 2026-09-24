from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CHECKPOINT = ROOT / "models" / "generic_motor.pt"
META = ROOT / "models" / "generic_motor.meta.json"


@pytest.fixture(scope="session")
def tiny_models_dir(tmp_path_factory) -> Path:
    """An UNTRAINED, tiny checkpoint that exercises the real load/serve path.

    Only for API-plumbing tests (status codes, shapes, ranges). It says nothing
    about detection quality; that is tested against the real trained model.
    """
    pytest.importorskip("torch")
    from app import vendor_path  # noqa: F401
    from models.autoencoder_anomaly import LSTMAutoencoder
    from app.services.artifacts import ModelMeta, paths_for, write_meta
    from train import synthetic

    d = tmp_path_factory.mktemp("models")
    model = LSTMAutoencoder({"input_size": 4, "seq_len": 30, "hidden_size": 8, "num_layers": 1,
                             "dropout": 0.0, "device": "cpu"})
    model.set_threshold(0.5)
    pt, meta_path = paths_for(d / "generic_motor")
    model.save(pt)
    ref = synthetic.generate_healthy(2000, seed=0)
    write_meta(ModelMeta(
        machineType="generic_motor", modelVersion="0.0.0+untrained-test", features=list(synthetic.FEATURES),
        seq_len=30, mean=ref.mean(0).tolist(), std=ref.std(0).tolist(), threshold=0.5,
        trainedAt="2026-01-01T00:00:00Z", dataSource="test-untrained", windowCount=0), meta_path)
    return d


@pytest.fixture()
def client(tiny_models_dir):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app(tiny_models_dir)) as c:   # `with` runs the startup (model load)
        yield c


@pytest.fixture()
def empty_client(tmp_path):
    pytest.importorskip("fastapi")
    pytest.importorskip("torch")
    from fastapi.testclient import TestClient
    from app.main import create_app
    with TestClient(create_app(tmp_path)) as c:          # no model files -> not loaded
        yield c


@pytest.fixture(scope="session")
def trained_predictor():
    """The real synthetic-trained checkpoint. Skips (with instructions) if absent."""
    pytest.importorskip("torch")
    if not (CHECKPOINT.is_file() and META.is_file()):
        pytest.skip("models/generic_motor.pt not found. Run: "
                    "python train/train_autoencoder.py --synthetic --out models/generic_motor")
    from app.services.predictor import Predictor
    return Predictor.load(ROOT / "models" / "generic_motor")
