from __future__ import annotations

from typing import Dict, List, Sequence

import numpy as np

from train import synthetic


def to_events(data: np.ndarray, features: Sequence[str] = synthetic.FEATURES) -> List[Dict]:
    ts = synthetic.timestamps(len(data))
    return [
        {"timestamp": ts[i], "values": {f: float(data[i, j]) for j, f in enumerate(features)}}
        for i in range(len(data))
    ]


def request_body(data: np.ndarray, machine_type: str = "generic_motor", machine_id: str = "pump-7") -> Dict:
    return {"machineId": machine_id, "machineType": machine_type, "window": to_events(data)}
