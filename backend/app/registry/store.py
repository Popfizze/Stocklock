"""Storage of the run registry: objects by full key (`lab/...`, `score/...`) in the data bucket.

Without a data bucket (local runs, tests) the same layout lives in a folder of the cache directory, so
the registry works everywhere; the API Lambda writes only under `lab/` (IAM) and reads `score/`.
"""

from __future__ import annotations

import gzip
import json
import threading
from pathlib import Path
from typing import Any, Protocol

from app.config import get_settings


class NotFound(Exception):
    """The object does not exist."""


class Store(Protocol):
    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None: ...

    def get_bytes(self, key: str) -> bytes: ...

    def size(self, key: str) -> int: ...

    def list_page(self, prefix: str, start_after: str = "", max_keys: int = 1000) -> tuple[list[str], bool]:
        """(keys after `start_after`, in key order; whether more keys follow)."""
        ...


class FileStore:
    def __init__(self, base: Path) -> None:
        self.base = base

    def _path(self, key: str) -> Path:
        parts = key.split("/")
        if not key or key.startswith("/") or any(p in {"", ".", ".."} or "\\" in p or ":" in p for p in parts):
            raise NotFound(key)  # keys stay inside the folder
        return self.base.joinpath(*parts)

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get_bytes(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise NotFound(key)
        return path.read_bytes()

    def size(self, key: str) -> int:
        path = self._path(key)
        if not path.is_file():
            raise NotFound(key)
        return path.stat().st_size

    def list_page(self, prefix: str, start_after: str = "", max_keys: int = 1000) -> tuple[list[str], bool]:
        if not self.base.is_dir():
            return [], False
        keys = sorted(p.relative_to(self.base).as_posix() for p in self.base.rglob("*") if p.is_file())
        keys = [k for k in keys if k.startswith(prefix) and k > start_after]
        return keys[:max_keys], len(keys) > max_keys


class S3Store:
    def __init__(self, bucket: str, client: Any = None) -> None:
        if client is None:
            import boto3

            client = boto3.client("s3", region_name=get_settings().aws_region)
        self.bucket = bucket
        self.client = client

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def _missing(self, exc: Exception) -> bool:
        code = getattr(exc, "response", {}).get("Error", {}).get("Code", "")
        return code in {"NoSuchKey", "404", "NotFound"}

    def get_bytes(self, key: str) -> bytes:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except Exception as exc:
            if self._missing(exc):
                raise NotFound(key) from exc
            raise

    def size(self, key: str) -> int:
        try:
            return int(self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"])
        except Exception as exc:
            if self._missing(exc):
                raise NotFound(key) from exc
            raise

    def list_page(self, prefix: str, start_after: str = "", max_keys: int = 1000) -> tuple[list[str], bool]:
        kwargs: dict[str, Any] = {"Bucket": self.bucket, "Prefix": prefix, "MaxKeys": max_keys}
        if start_after:
            kwargs["StartAfter"] = start_after
        page = self.client.list_objects_v2(**kwargs)
        return [o["Key"] for o in page.get("Contents", [])], bool(page.get("IsTruncated"))


_lock = threading.Lock()
_store: dict[str, Store] = {}


def get_store() -> Store:
    """The data bucket when configured, else `<cache dir>/registry`; one instance per configuration."""
    s = get_settings()
    key = f"s3:{s.data_bucket}" if s.data_bucket else f"file:{s.cache_dir}"
    with _lock:
        if key not in _store:
            _store[key] = S3Store(s.data_bucket) if s.data_bucket else FileStore(s.cache_dir / "registry")
        return _store[key]


def reset() -> None:
    with _lock:
        _store.clear()


# --- JSON helpers ----------------------------------------------------------------------------------

def dumps(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")


def put_json(store: Store, key: str, value: Any) -> None:
    data = dumps(value)
    store.put_bytes(key, gzip.compress(data, mtime=0) if key.endswith(".gz") else data, "application/json")


def get_json(store: Store, key: str) -> Any:
    raw = store.get_bytes(key)
    return json.loads(gzip.decompress(raw) if key.endswith(".gz") else raw)
