# models/

Trained checkpoints live here, one pair of files per machine type:

| File | Written by | Contains |
|------|-----------|----------|
| `generic_motor.pt` | upstream `BaseModel.save()` | `state_dict` + `config` **only** |
| `generic_motor.meta.json` | `train/train_autoencoder.py` | `features` (order matters), `seq_len`, `mean`, `std`, `threshold`, `modelVersion`, `trainedAt`, `dataSource`, `windowCount`, validation stats |

The `.meta.json` is required: upstream does not save the anomaly threshold or any input scaling, so without it the `.pt` is not usable. The service refuses to load a `.pt` whose `input_size`/`seq_len` disagree with its meta.

## Status of the files in this delivery

**This delivery does not contain a trained checkpoint.** The environment it was built in had no PyTorch and no network, so training could not be run and no weights were fabricated. Until the two files exist, `POST /predict` returns **503** and `GET /health` reports `degraded`.

Create the demo checkpoint (about a minute on CPU):

```bash
python train/train_autoencoder.py --synthetic --out models/generic_motor
```

That model is trained on **synthetic** data (`dataSource: "synthetic"`, version suffix `+synthetic.YYYYMMDD`). It has never seen a real machine. It exists to exercise the pipeline and the tests. For real use, train on healthy readings from your own equipment:

```bash
python train/train_autoencoder.py --data healthy.csv --features temperature,vibration,current,rpm --seq-len 30 --out models/generic_motor
```

Do not commit or deploy a checkpoint whose provenance you cannot state.
