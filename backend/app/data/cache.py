"""Small JSON disk cache for external calls (EDGAR, GDELT, yfinance)."""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from app.config import get_settings


class ExternalUnavailable(Exception):
    """An external source could not be reached or refused the request."""

    def __init__(self, source: str, reason: str):
        super().__init__(f"{source}: {reason}")
        self.source = source
        self.reason = reason


def _cache_path(namespace: str, key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:32]
    return get_settings().cache_dir / namespace / f"{digest}.json"


def read(namespace: str, key: str, ttl_s: float) -> Any | None:
    path = _cache_path(namespace, key)
    if not path.is_file():
        return None
    try:
        envelope = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if time.time() - float(envelope.get("stored_at", 0)) > ttl_s:
        return None
    return envelope.get("value")


def write(namespace: str, key: str, value: Any) -> None:
    path = _cache_path(namespace, key)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"stored_at": time.time(), "key": key, "value": value})
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(payload)
        os.replace(tmp, path)
    except OSError:
        if os.path.exists(tmp):
            os.unlink(tmp)


def cached(namespace: str, key: str, ttl_s: float, fetch: Callable[[], Any]) -> tuple[Any, bool]:
    """Return (value, from_cache). Only successful fetches are stored."""
    hit = read(namespace, key, ttl_s)
    if hit is not None:
        return hit, True
    value = fetch()
    write(namespace, key, value)
    return value, False
