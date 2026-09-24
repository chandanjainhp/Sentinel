# Sentinel ML service

A stateless FastAPI service that scores industrial-machine sensor windows for anomalies with an **LSTM autoencoder** trained on healthy data only. It replaces the upstream `ml_service.py` stub. API details for integrators are in **[CONTRACT.md](CONTRACT.md)**.

> **Honesty rules this service follows**
> - The only model is `lstm_autoencoder`. Nothing that is a heuristic is ever labelled as a model.
> - There is **no RUL**. `rulValue`/`rulUnit` are `null` = "not available", never `0`.
> - Fault names are `"<channel>_anomaly"` (the channel that deviates most). There is no fault classifier, so no invented names like "bearing_degradation".
> - `faultProbability` is a persistence statistic, not a classifier probability. `confidence` is data sufficiency only.
> - The checkpoint you can generate here is trained on **synthetic** data. It is a demo.

## Status of this delivery (read before relying on it)

The sandbox this was built in had **no PyTorch, no FastAPI/pytest, and no network**. So:

| Item | State |
|------|-------|
| Vendored upstream (`vendor/ipm/`) | Done; verified byte-identical to the zip with `diff -r` |
| Scoring / windowing / meta code, synthetic generator, Node example | **Executed and passing** (20 Python tests + 6 Node scenarios) |
| Training script, predictor, FastAPI app, API tests, trained-model tests | Written and syntax-checked (`py_compile`); **never executed** |
| Trained checkpoint in `models/` | **Not included** (see `models/README.md`); `/predict` returns 503 until you train |
| Docker image | Dockerfile written, **not built** (no Docker) |

First thing to do on a machine with the dependencies: run the training command and the full test suite (below). Expect to fix small things; nothing on the torch/FastAPI path has been run yet.

## Layout

```
app/main.py               FastAPI app; models loaded once at startup (lifespan)
app/routes/predict.py     POST /predict
app/services/predictor.py torch model wrapper: scale -> windows -> error -> scores
app/services/scoring.py   pure-numpy: THE score mapping, windowing, exceedance, confidence
app/services/artifacts.py meta.json read/write/validation (shared by training and serving)
app/schemas/prediction.py Pydantic request/response models
train/train_autoencoder.py, train/synthetic.py
models/                   checkpoints + README
vendor/ipm/               UNMODIFIED upstream (models, preprocessing, evaluation, deployment, datasets, configs)
tests/  CONTRACT.md  Dockerfile  requirements*.txt  examples/worker.mjs
```

## Quick start

```bash
pip install -r requirements-dev.txt        # CPU torch: pip install torch --index-url https://download.pytorch.org/whl/cpu
python train/train_autoencoder.py --synthetic --out models/generic_motor
pytest
python -m app                              # serves on ML_PORT (default 9000)
curl -s localhost:9000/health
```

Docker: `docker build -t sentinel-ml . && docker run --rm -p 9000:9000 sentinel-ml`
(CPU-only torch; only runtime deps; port from `ML_PORT`; models baked in from `models/` or mounted at `/app/models`; `ML_MODELS_DIR` overrides the path).

## How each response field is computed

All deterministic. The score mapping exists in exactly one place, `scoring.score_from_error`, with unit tests.

1. Scale each channel with the `mean`/`std` saved in `meta.json`, in the `features` order stored there.
2. Slide `seq_len`-sized windows (stride 1) over the received events. Compute each window's error with upstream `predict_anomaly_score()` (MSE over time and channels).
3. `anomalyScore = clip(error_latest / (2 x threshold), 0, 1)`. Threshold -> 0.5. The consuming app should treat >= 0.75 as WARNING (error >= 1.5x threshold) and >= 0.90 as CRITICAL (>= 1.8x).
4. `faultProbability` = fraction of the last 10 windows with error > threshold.
5. If the latest error > threshold: `suspectChannel` = argmax of per-channel MSE for the latest window; `faultType = "<channel>_anomaly"`. Otherwise `"none"` and `null`.
6. `confidence = min(1, windows_available / 10)`.
7. `rulValue = rulUnit = null`.

Known property: the upstream threshold is the 95th percentile of *training* window errors, so about 5% of healthy windows sit above it by construction. Expect a small non-zero `faultProbability` floor on a healthy machine. Training also reports the held-out exceedance rate in `meta.json` -> `validation.exceedanceRate`.

## Training

`train/train_autoencoder.py` (`--data <csv>` or `--synthetic`, `--features`, `--seq-len 30`, `--out`):

- Chronological split: first 80% trains, last 20% is held out for early stopping; scaler fit on the training part only.
- Windows with stride 5; `LSTMAutoencoder` from the vendored upstream with `input_size = len(features)`, hyper-parameters from upstream `configs/autoencoder_config.yaml`, `device` forced to `cpu`.
- Threshold calibrated by upstream `fit()` (p95); saved with `model.save()` to `<out>.pt` and the sidecar `<out>.meta.json`.
- `--synthetic` prints a loud warning (before and after) and records `dataSource: "synthetic"`.

## Upstream facts checked in the code

1. Root `ml_service.py` is a rule-based stub that hardcodes `"model": "transformer_rul"`: **true**.
2. The repo ships no checkpoints: **true** (none in the tree or git).
3. `BaseModel.save()` stores only `state_dict` and `config`; `threshold` and scaling are not saved: **true** (`tests/test_meta_checkpoint.py` asserts a raw upstream load has `threshold is None`).
4. The RUL models are configured for 14 CMAPSS features; `LSTMAutoencoder` takes `input_size` and trains on healthy data: **true**.

Extra observations: `evaluation/` imports matplotlib at module level (never imported by this service, so matplotlib is not a dependency); `deployment/streaming_pipeline.StreamingPredictor` is stateful and calls `float(model.predict(X)[0])`, which does not fit an autoencoder, so it is not used; `models/__init__.py` imports all four models, so the TCN's `torch.nn.utils.weight_norm` (deprecated in newer torch) is imported at startup, and if a future torch removes it the import will fail (hence `torch<3` and this note).

## Not in scope

Auth/users, a database, extra endpoints, GPU, model registry, drift monitoring, RUL, LLM/RAG. The optional `turbofan_demo` phase was skipped (no network, no torch).
