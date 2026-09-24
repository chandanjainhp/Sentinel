#!/usr/bin/env python3
"""Train the LSTM autoencoder (healthy data only) and write:

    <out>.pt         upstream BaseModel.save()  -> state_dict + config
    <out>.meta.json  features, seq_len, mean, std, threshold, version, ...

Examples
--------
    python train/train_autoencoder.py --synthetic --out models/generic_motor
    python train/train_autoencoder.py --data healthy.csv \
        --features temperature,vibration,current,rpm --seq-len 30 --out models/generic_motor

CSV format: header row with `timestamp` + one column per feature; HEALTHY
readings only, in chronological order.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

from app import vendor_path  # noqa: E402,F401  (puts vendor/ipm on sys.path)
from app.services.artifacts import ModelMeta, paths_for, write_meta  # noqa: E402
from app.services.scoring import make_windows, scale  # noqa: E402
from train import synthetic  # noqa: E402

MODEL_VERSION_BASE = "0.1.0"
BASE_CONFIG = vendor_path.VENDOR_IPM / "configs" / "autoencoder_config.yaml"


def banner_synthetic() -> None:
    bar = "!" * 78
    print(
        f"\n{bar}\n"
        "!!  WARNING: TRAINING ON SYNTHETIC DATA                                     !!\n"
        "!!  The resulting model has never seen a real machine. It is a DEMO model.  !!\n"
        "!!  Do not present its output as a real diagnosis. dataSource='synthetic'.  !!\n"
        f"{bar}\n",
        file=sys.stderr,
    )


def load_csv(path: Path, features: List[str]) -> Tuple[np.ndarray, int]:
    rows, skipped = [], 0
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        missing = [c for c in ["timestamp", *features] if c not in (reader.fieldnames or [])]
        if missing:
            raise SystemExit(f"CSV {path} is missing column(s): {missing}")
        for r in reader:
            try:
                vals = [float(r[f]) for f in features]
            except (TypeError, ValueError):
                skipped += 1
                continue
            if not np.all(np.isfinite(vals)):
                skipped += 1
                continue
            rows.append(vals)
    return np.asarray(rows, dtype=np.float64), skipped


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--data", type=Path, help="CSV of HEALTHY readings (timestamp + channels)")
    src.add_argument("--synthetic", action="store_true", help="generate synthetic healthy data (DEMO model)")
    p.add_argument("--features", default=",".join(synthetic.FEATURES))
    p.add_argument("--seq-len", type=int, default=30)
    p.add_argument("--out", type=Path, required=True, help="output base path, e.g. models/generic_motor")
    p.add_argument("--machine-type", default="generic_motor")
    p.add_argument("--stride", type=int, default=5, help="training window stride")
    p.add_argument("--epochs", type=int, default=40)
    p.add_argument("--patience", type=int, default=8)
    p.add_argument("--batch-size", type=int, default=128)
    p.add_argument("--hidden-size", type=int, default=64)
    p.add_argument("--val-fraction", type=float, default=0.2, help="chronological tail held out for early stopping")
    p.add_argument("--synthetic-samples", type=int, default=20000)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)
    import torch  # imported late so --help works without torch
    import yaml
    from models.autoencoder_anomaly import LSTMAutoencoder

    features = [f.strip() for f in args.features.split(",") if f.strip()]
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)

    # ---- data ---------------------------------------------------------
    if args.synthetic:
        banner_synthetic()
        if features != synthetic.FEATURES:
            raise SystemExit(f"--synthetic only generates {synthetic.FEATURES}")
        raw = synthetic.generate_healthy(args.synthetic_samples, seed=args.seed)
        data_source, tag = "synthetic", "synthetic"
    else:
        raw, skipped = load_csv(args.data, features)
        if skipped:
            print(f"Skipped {skipped} unparseable/non-finite rows", file=sys.stderr)
        data_source = args.data.name
        tag = "csv." + hashlib.sha256(args.data.read_bytes()).hexdigest()[:8]

    n = len(raw)
    split = int(n * (1.0 - args.val_fraction))
    if split < args.seq_len * 4 or (n - split) < args.seq_len:
        raise SystemExit(f"Not enough rows ({n}) for seq_len={args.seq_len} with val_fraction={args.val_fraction}")
    train_raw, val_raw = raw[:split], raw[split:]

    # ---- scaler: fit on healthy TRAINING rows only --------------------
    mean = train_raw.mean(axis=0)
    std = train_raw.std(axis=0)
    if np.any(std < 1e-8):
        bad = [f for f, s in zip(features, std) if s < 1e-8]
        raise SystemExit(f"Channel(s) {bad} are constant in the training data; remove them.")
    X_train = make_windows(scale(train_raw, mean, std), args.seq_len, args.stride).astype(np.float32)
    X_val = make_windows(scale(val_raw, mean, std), args.seq_len, args.stride).astype(np.float32)
    print(f"rows={n}  train_windows={len(X_train)}  val_windows={len(X_val)}  shape={X_train.shape}")

    # ---- model via the upstream API ----------------------------------
    config = yaml.safe_load(BASE_CONFIG.read_text())
    config.pop("dataset", None)  # CWRU-specific block, irrelevant here
    config.update(
        input_size=len(features), seq_len=args.seq_len, hidden_size=args.hidden_size,
        epochs=args.epochs, patience=args.patience, batch_size=args.batch_size,
        device="cpu",  # checkpoints must load on CPU-only hosts
    )
    model = LSTMAutoencoder(config)
    history = model.fit(X_train, X_val=X_val)  # upstream also calibrates the threshold (p95 of train errors)
    threshold = float(model.threshold)

    val_scores = model.predict_anomaly_score(X_val)
    val_exceed = float(np.mean(val_scores > threshold))
    print(f"threshold={threshold:.6f}  held-out healthy windows above threshold: {val_exceed:.1%}")

    # ---- persist ------------------------------------------------------
    pt_path, meta_path = paths_for(args.out)
    model.save(pt_path)
    now = datetime.now(timezone.utc)
    meta = ModelMeta(
        machineType=args.machine_type,
        modelVersion=f"{MODEL_VERSION_BASE}+{tag}.{now:%Y%m%d}",
        features=features, seq_len=args.seq_len,
        mean=mean.tolist(), std=std.tolist(),
        threshold=threshold, thresholdPercentile=float(config["threshold_percentile"]),
        trainedAt=now.isoformat().replace("+00:00", "Z"),
        dataSource=data_source, windowCount=int(len(X_train)),
        validation={"windows": int(len(X_val)), "exceedanceRate": val_exceed},
        training={"epochsRun": len(history["train_loss"]), "finalTrainLoss": float(history["train_loss"][-1]),
                  "seed": args.seed, "stride": args.stride, "hiddenSize": args.hidden_size},
    )
    write_meta(meta, meta_path)
    print(f"wrote {pt_path}\nwrote {meta_path}")
    if args.synthetic:
        banner_synthetic()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
