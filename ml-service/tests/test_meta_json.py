"""meta.json round-trip (torch-free half). Deliberately no pytest import."""
import json
import tempfile
from pathlib import Path

from app.services.artifacts import ModelMeta, paths_for, read_meta, write_meta


def _meta(**kw):
    base = dict(
        machineType="generic_motor", modelVersion="0.1.0+synthetic.20260924",
        features=["temperature", "vibration", "current", "rpm"], seq_len=30,
        mean=[72.0, 2.4, 14.0, 1485.0], std=[2.3, 0.22, 1.2, 6.0],
        threshold=0.123456789, trainedAt="2026-09-24T00:00:00Z",
        dataSource="synthetic", windowCount=3200,
    )
    base.update(kw)
    return ModelMeta(**base)


def _raises(exc, fn):
    try:
        fn()
    except exc:
        return
    raise AssertionError(f"{exc.__name__} not raised")


def test_round_trip_preserves_threshold_scaler_and_feature_order():
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "generic_motor.meta.json"
        original = _meta()
        write_meta(original, path)
        loaded = read_meta(path)
        assert loaded.features == original.features             # order matters
        assert loaded.mean == original.mean and loaded.std == original.std
        assert loaded.threshold == original.threshold
        assert loaded.seq_len == 30 and loaded.dataSource == "synthetic"
        assert loaded.modelVersion == original.modelVersion


def test_paths_for_accepts_base_or_pt():
    assert paths_for("models/generic_motor") == (Path("models/generic_motor.pt"), Path("models/generic_motor.meta.json"))
    assert paths_for("models/generic_motor.pt")[1].name == "generic_motor.meta.json"


def test_invalid_meta_is_rejected():
    _raises(ValueError, lambda: _meta(std=[2.3, 0.0, 1.2, 6.0]).validate())
    _raises(ValueError, lambda: _meta(threshold=0.0).validate())
    _raises(ValueError, lambda: _meta(mean=[1.0]).validate())
    _raises(ValueError, lambda: _meta(features=["a", "a", "b", "c"]).validate())


def test_missing_key_gives_clear_error():
    d = _meta().to_dict()
    del d["threshold"]
    _raises(ValueError, lambda: ModelMeta.from_dict(d))


def test_file_is_plain_json_a_human_can_read():
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "m.meta.json"
        write_meta(_meta(), path)
        assert json.loads(path.read_text())["features"][1] == "vibration"
