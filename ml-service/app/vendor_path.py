"""Make the unmodified upstream package importable.

Upstream code uses top-level imports (``models``, ``evaluation``), so the
vendored tree ``vendor/ipm`` is placed at the FRONT of ``sys.path``.

Note: this service also has a ``models/`` directory (checkpoints). It has no
``__init__.py`` so it is not a regular package, and Python always prefers the
regular package ``vendor/ipm/models`` over a namespace directory.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR_IPM = ROOT / "vendor" / "ipm"


def ensure_vendor_on_path() -> None:
    p = str(VENDOR_IPM)
    if p not in sys.path:
        sys.path.insert(0, p)


ensure_vendor_on_path()
