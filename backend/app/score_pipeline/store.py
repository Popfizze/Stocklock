"""Object storage for the score pipeline: S3 on AWS, a folder for local runs, memory for tests.

Keys are relative to the pipeline's root prefix (`score/`): `bronze/titres_bruts/...` is stored at
`score/bronze/titres_bruts/...` in the data bucket. Files ending in `.gz` are gzip-compressed.
"""

from __future__ import annotations

import gzip
import io
import json
from pathlib import Path
from typing import Any, Protocol

import pandas as pd

ROOT_PREFIX = "score/"


class NotFound(Exception):
    """The object does not exist."""


class Store(Protocol):
    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None: ...

    def get_bytes(self, key: str) -> bytes: ...

    def list_keys(self, prefix: str) -> list[str]: ...


class MemoryStore:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self.objects[key] = data

    def get_bytes(self, key: str) -> bytes:
        if key not in self.objects:
            raise NotFound(key)
        return self.objects[key]

    def list_keys(self, prefix: str) -> list[str]:
        return sorted(k for k in self.objects if k.startswith(prefix))


class FileStore:
    """A local folder laid out like the bucket (local runs: `python -m app.score_pipeline.local`)."""

    def __init__(self, base: Path) -> None:
        self.base = base / ROOT_PREFIX.rstrip("/")

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        path = self.base / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def get_bytes(self, key: str) -> bytes:
        path = self.base / key
        if not path.is_file():
            raise NotFound(key)
        return path.read_bytes()

    def list_keys(self, prefix: str) -> list[str]:
        if not self.base.is_dir():
            return []
        keys = (p.relative_to(self.base).as_posix() for p in self.base.rglob("*") if p.is_file())
        return sorted(k for k in keys if k.startswith(prefix))


class S3Store:
    def __init__(self, bucket: str, client: Any = None) -> None:
        if client is None:
            import boto3

            client = boto3.client("s3")
        self.bucket = bucket
        self.client = client

    def put_bytes(self, key: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        self.client.put_object(Bucket=self.bucket, Key=ROOT_PREFIX + key, Body=data, ContentType=content_type)

    def get_bytes(self, key: str) -> bytes:
        from botocore.exceptions import ClientError

        try:
            return self.client.get_object(Bucket=self.bucket, Key=ROOT_PREFIX + key)["Body"].read()
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code", "") in {"NoSuchKey", "404"}:
                raise NotFound(key) from exc
            raise

    def list_keys(self, prefix: str) -> list[str]:
        keys: list[str] = []
        paginator = self.client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=self.bucket, Prefix=ROOT_PREFIX + prefix):
            keys.extend(obj["Key"][len(ROOT_PREFIX):] for obj in page.get("Contents", []))
        return sorted(keys)


# --- Typed helpers -----------------------------------------------------------------------------------

def _encode(key: str, data: bytes) -> bytes:
    return gzip.compress(data, mtime=0) if key.endswith(".gz") else data


def _decode(key: str, data: bytes) -> bytes:
    return gzip.decompress(data) if key.endswith(".gz") else data


def put_json(store: Store, key: str, value: Any) -> None:
    raw = json.dumps(value, ensure_ascii=False, default=str).encode("utf-8")
    store.put_bytes(key, _encode(key, raw), "application/json")


def get_json(store: Store, key: str) -> Any:
    return json.loads(_decode(key, store.get_bytes(key)))


def put_raw(store: Store, key: str, raw: bytes, content_type: str = "application/json") -> None:
    store.put_bytes(key, _encode(key, raw), content_type)


def put_csv(store: Store, key: str, frame: pd.DataFrame) -> None:
    store.put_bytes(key, _encode(key, frame.to_csv(index=False).encode("utf-8")), "text/csv")


def get_csv(store: Store, key: str, **kwargs: Any) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(_decode(key, store.get_bytes(key))), **kwargs)
