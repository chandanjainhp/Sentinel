"""Upstream save() drops the threshold; the sidecar + set_threshold() restores it."""
import numpy as np
import pytest

torch = pytest.importorskip("torch")


def test_checkpoint_plus_meta_round_trip_restores_threshold_and_behaviour(tiny_models_dir):
    from app.services.predictor import Predictor
    from app.services.artifacts import read_meta

    p = Predictor.load(tiny_models_dir / "generic_motor")
    meta = read_meta(tiny_models_dir / "generic_motor.meta.json")
    assert p.model.threshold == meta.threshold == 0.5
    assert p.meta.features == ["temperature", "vibration", "current", "rpm"]
    assert p.meta.std == meta.std and p.meta.mean == meta.mean


def test_raw_upstream_load_does_not_restore_threshold(tiny_models_dir):
    """Documents WHY the sidecar exists (fact #3)."""
    from models.autoencoder_anomaly import LSTMAutoencoder
    raw = LSTMAutoencoder.load(tiny_models_dir / "generic_motor.pt")
    assert raw.threshold is None


def test_mismatched_checkpoint_and_meta_is_refused(tiny_models_dir, tmp_path):
    import json, shutil
    from app.services.predictor import Predictor
    shutil.copy(tiny_models_dir / "generic_motor.pt", tmp_path / "x.pt")
    meta = json.loads((tiny_models_dir / "generic_motor.meta.json").read_text())
    meta["features"] = meta["features"][:3]; meta["mean"] = meta["mean"][:3]; meta["std"] = meta["std"][:3]
    (tmp_path / "x.meta.json").write_text(json.dumps(meta))
    with pytest.raises(ValueError, match="does not match"):
        Predictor.load(tmp_path / "x")


def test_vendored_upstream_is_the_one_imported():
    from app import vendor_path
    import models.autoencoder_anomaly as m
    assert str(vendor_path.VENDOR_IPM) in m.__file__
