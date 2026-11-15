"""Cache of the stock page's step 2 (POST /api/explain-move/stock), per title, window, profile and options.

Three layers, fastest first: this process's memory, the local disk (`/tmp` on Lambda) and, when the data
bucket is configured, S3 under `cache/moves/` (shared by every Lambda instance; the bucket's lifecycle
expires it). A complete answer is kept 12 h. An answer the time budget cut short (a source, a page or the
narration retry left out) or with a model call that failed is kept 15 min only, so that a later request
computes the complete one: the sources left running then are cached by now.

A storage error never fails the request: the answer is computed and returned as if nothing was cached.
"""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import threading
import time
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.data import cache

log = logging.getLogger(__name__)

VERSION = 1  # bump when the answer's shape or the pipeline's logic changes
NAMESPACE = "moves"
PREFIX = "cache/moves/"
TTL_COMPLETE_S = 12 * 3600
TTL_PARTIAL_S = 15 * 60
MEMORY_MAX = 64
LAYERS = ("mémoire", "disque", "s3")
enabled = True  # the tests turn it off unless they test it

_lock = threading.Lock()
_memory: OrderedDict[str, dict[str, Any]] = OrderedDict()


def key(ticker: str, start: Any, end: Any, persona_id: str, options: dict[str, Any]) -> str:
    return json.dumps({"v": VERSION, "ticker": ticker.upper(), "start": str(start), "end": str(end),
                       "persona": persona_id, "options": options}, sort_keys=True)


def _digest(cache_key: str) -> str:
    return hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:40]


def _iso(epoch: float) -> str:
    return datetime.fromtimestamp(epoch, timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def _store():
    if not get_settings().data_bucket:
        return None  # local runs: the disk layer is enough
    from app.registry import store as rs

    return rs.get_store()


def _remember(cache_key: str, envelope: dict[str, Any]) -> None:
    with _lock:
        _memory[cache_key] = envelope
        _memory.move_to_end(cache_key)
        while len(_memory) > MEMORY_MAX:
            _memory.popitem(last=False)


def _fresh(envelope: Any, cache_key: str) -> bool:
    return isinstance(envelope, dict) and envelope.get("key") == cache_key \
        and float(envelope.get("expires_at", 0)) > time.time() and isinstance(envelope.get("value"), dict)


def get(cache_key: str) -> tuple[dict[str, Any], str] | None:
    """(envelope, layer) of a fresh cached answer, or None. A hit in a slower layer fills the faster ones."""
    if not enabled:
        return None
    with _lock:
        envelope = _memory.get(cache_key)
    if _fresh(envelope, cache_key):
        return envelope, LAYERS[0]
    envelope = cache.read(NAMESPACE, cache_key, TTL_COMPLETE_S)
    if _fresh(envelope, cache_key):
        _remember(cache_key, envelope)
        return envelope, LAYERS[1]
    store = _store()
    if store is None:
        return None
    from app.registry import store as rs

    try:
        envelope = rs.get_json(store, f"{PREFIX}{_digest(cache_key)}.json.gz")
    except rs.NotFound:
        return None
    except Exception as exc:  # S3 unreachable or refused: computed as if not cached
        log.warning("moves cache: S3 read failed (%s)", type(exc).__name__)
        return None
    if not _fresh(envelope, cache_key):
        return None
    _remember(cache_key, envelope)
    cache.write(NAMESPACE, cache_key, envelope)
    return envelope, LAYERS[2]


def put(cache_key: str, value: dict[str, Any], skipped: list[str]) -> dict[str, Any]:
    """Stores an answer in every layer; `skipped`: what was left out (short lifetime when not empty)."""
    now = time.time()
    complete = not skipped
    envelope = {"key": cache_key, "stored_at": now, "expires_at": now + (TTL_COMPLETE_S if complete else TTL_PARTIAL_S),
                "complete": complete, "skipped": list(skipped), "value": value}
    _remember(cache_key, envelope)
    cache.write(NAMESPACE, cache_key, envelope)
    store = _store()
    if store is not None:
        from app.registry import store as rs

        try:
            rs.put_json(store, f"{PREFIX}{_digest(cache_key)}.json.gz", envelope)
        except Exception as exc:  # e.g. no PutObject right on cache/ yet: memory and disk still serve
            log.warning("moves cache: S3 write failed (%s)", type(exc).__name__)
    return envelope


def served(envelope: dict[str, Any], layer: str | None, started: float) -> dict[str, Any]:
    """The answer with what the stock page may show about it: where it came from, how long it took."""
    body = copy.copy(envelope["value"])
    body["cache"] = {"hit": layer is not None, "layer": layer, "stored_at": _iso(envelope["stored_at"]),
                     "expires_at": _iso(envelope["expires_at"]), "complete": envelope["complete"],
                     "skipped": envelope["skipped"]}
    body["duration_ms"] = round((time.perf_counter() - started) * 1000, 1)
    return body


def reset() -> None:
    """Forget the memory layer (tests)."""
    with _lock:
        _memory.clear()
