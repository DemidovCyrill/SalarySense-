"""Точка входа: ``python -m app``."""

from __future__ import annotations

import sys

from .backend.server import run

if __name__ == "__main__":
    sys.exit(run())
