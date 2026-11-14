"""Everything a run generated, listed and previewed page by page.

Labo run: each stage's datasets (every row, as stored) and decisions; a group run: its table across
titles and its titles' summaries (each title is a run with its own artifacts). Score pipeline run:
every object its stages wrote under `score/<layer>/<dataset>/<date>/<run_id>/` (and the copy of the
gold table they updated), read as CSV, JSON or text, gzip or not. A preview is a page of rows that
always fits in a response.
"""

from __future__ import annotations

import base64
import gzip
import io
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.pipeline.core import RESPONSE_MAX_BYTES, _cell, _escaped_size
from app.pipeline.datasets import flatten
from app.registry import lab
from app.registry import store as rs
from app.registry.views import RunNotFound, _check, _score_record, _score_stages, lab_record

MAX_LIMIT = 500
MAX_FILE_BYTES = 64 * 1024 * 1024  # read at most this much of a file to preview it
PAGE_BYTES = RESPONSE_MAX_BYTES - 500_000
DECISION_COLUMNS = ["question", "answer", "reason", "rule", "inputs"]


class ArtifactNotFound(LookupError):
    pass


def _file_id(key: str) -> str:
    return "file:" + base64.urlsafe_b64encode(key.encode("utf-8")).decode("ascii").rstrip("=")


def _file_key(artifact_id: str) -> str:
    raw = artifact_id.removeprefix("file:")
    try:
        return base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)).decode("utf-8")
    except ValueError as exc:
        raise ArtifactNotFound(artifact_id) from exc


def _format(key: str) -> str:
    name = key.removesuffix(".gz").lower()
    for ext, fmt in ((".csv", "csv"), (".json", "json"), (".jsonl", "json"), (".parquet", "parquet")):
        if name.endswith(ext):
            return fmt
    return "text"


# --- list ----------------------------------------------------------------------------------------------

def _lab_artifacts(record: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    if record.get("kind") == "batch":
        table = record.get("table") or {}
        out.append({"id": "lab:batch:table", "kind": "dataset", "stage_id": None,
                    "title": "Tableau du groupe (un titre par ligne)", "format": "table", "path": None,
                    "size_bytes": None, "rows": len(table.get("rows") or []),
                    "columns": len(table.get("columns") or [])})
        out.append({"id": "lab:batch:items", "kind": "dataset", "stage_id": None,
                    "title": "Titres du groupe (statut, résultat, erreur)", "format": "table", "path": None,
                    "size_bytes": None, "rows": len(record.get("items") or []), "columns": len(ITEM_COLUMNS)})
    for stage in record.get("stages") or []:
        for d in stage.get("datasets") or []:
            out.append({"id": f"lab:{stage['id']}:dataset:{d['id']}", "kind": "dataset", "stage_id": stage["id"],
                        "title": d["title"], "format": "table", "path": None, "size_bytes": None,
                        "rows": d["rows"], "columns": d["columns"]})
        if stage.get("decisions"):
            out.append({"id": f"lab:{stage['id']}:decisions", "kind": "decisions", "stage_id": stage["id"],
                        "title": f"Décisions · {stage['name']}", "format": "table", "path": None,
                        "size_bytes": None, "rows": stage["decisions"], "columns": len(DECISION_COLUMNS)})
    return out


def _score_artifacts(store: rs.Store, run_id: str) -> list[dict[str, Any]]:
    stages = _score_stages(store, run_id, _score_record(store, run_id))
    seen: dict[str, str] = {}
    for stage in stages:
        for key in stage.get("outputs") or []:
            seen.setdefault(key, stage["id"])

    def describe(item: tuple[str, str]) -> dict[str, Any]:
        key, stage_id = item
        try:
            size: int | None = store.size(key)
        except Exception:  # missing (expired bronze) or unreadable: still listed
            size = None
        parts = key.split("/")
        title = f"{parts[2]}/{parts[-1]}" if len(parts) > 3 else parts[-1]
        if key.endswith("latest.json"):
            title += " (copie courante : un run plus récent a pu la remplacer)"
        return {"id": _file_id(key), "kind": "file", "stage_id": stage_id, "title": title, "format": _format(key),
                "path": key, "size_bytes": size, "rows": None, "columns": None}

    with ThreadPoolExecutor(max_workers=16, thread_name_prefix="registry-head") as pool:
        return list(pool.map(describe, seen.items()))


def list_artifacts(run_id: str) -> dict[str, Any]:
    _check(run_id)
    record = lab_record(run_id)
    artifacts = _lab_artifacts(record) if record is not None else _score_artifacts(rs.get_store(), run_id)
    return {"run_id": run_id, "artifacts": artifacts}


# --- preview -------------------------------------------------------------------------------------------

ITEM_COLUMNS = ["ticker", "name", "status", "duration_ms", "key_result", "governance_passed", "warnings", "error",
                "run_id"]


def _page(columns: list[str], rows: list[list[Any]], offset: int, limit: int, total: int | None,
          note: str | None = None) -> dict[str, Any]:
    cells = [[_cell(v) for v in r] for r in rows[offset:offset + limit]]
    while cells and _escaped_size(cells) > PAGE_BYTES:  # very wide rows: fewer per page
        cells = cells[: max(1, len(cells) // 2)]
        note = note or "Page réduite pour tenir dans une réponse : demandez la suite avec offset."
    shown = offset + len(cells)
    return {"columns": columns, "rows": cells, "offset": offset, "limit": limit,
            "total_rows": total, "has_more": total is not None and shown < total, "note": note}


def _lab_preview(run_id: str, record: dict[str, Any], artifact: dict[str, Any], offset: int, limit: int
                 ) -> dict[str, Any]:
    aid = artifact["id"]
    if aid == "lab:batch:table":
        table = record.get("table") or {}
        keys = [c["key"] for c in table.get("columns") or []]
        rows = [[r.get(k) for k in keys] for r in table.get("rows") or []]
        return _page(keys, rows, offset, limit, len(rows))
    if aid == "lab:batch:items":
        rows = [[i.get(c) if c != "key_result" else (i.get("key_result") or {}).get("value") for c in ITEM_COLUMNS]
                for i in record.get("items") or []]
        return _page(ITEM_COLUMNS, rows, offset, limit, len(rows))
    stage = rs.get_json(rs.get_store(), lab.stage_key(run_id, artifact["stage_id"]))
    if artifact["kind"] == "decisions":
        rows = [[d.get("question"), d.get("answer"), d.get("reason"), d.get("rule"),
                 json.dumps(d["inputs"], ensure_ascii=False) if d.get("inputs") else None]
                for d in stage.get("decisions") or []]
        return _page(DECISION_COLUMNS, rows, offset, limit, len(rows))
    dataset_id = aid.split(":dataset:", 1)[1]
    dataset = next((d for d in stage.get("datasets") or [] if d["id"] == dataset_id), None)
    if dataset is None:
        raise ArtifactNotFound(aid)
    return _page(dataset["columns"], dataset["rows"], offset, limit, len(dataset["rows"]))


def _records_table(records: list[Any]) -> tuple[list[str], list[list[Any]]]:
    if records and all(isinstance(r, dict) for r in records):
        columns = list(dict.fromkeys(k for r in records for k in r))
        return columns, [[r.get(c) for c in columns] for r in records]
    return ["valeur"], [[r] for r in records]


def _json_table(value: Any) -> tuple[list[str], list[list[Any]], str | None]:
    if isinstance(value, list):
        columns, rows = _records_table(value)
        return columns, rows, None
    if isinstance(value, dict):
        lists = {k: v for k, v in value.items() if isinstance(v, list) and v and isinstance(v[0], dict)}
        if lists:
            key = max(lists, key=lambda k: len(lists[k]))
            columns, rows = _records_table(lists[key])
            others = [k for k in value if k != key]
            note = f"Liste « {key} » du fichier" + (f" ; autres clés : {', '.join(others[:12])}." if others else ".")
            return columns, rows, note
        return ["clé", "valeur"], [[k, v] for k, v in flatten(value)], None
    return ["valeur"], [[value]], None


def _file_preview(store: rs.Store, artifact: dict[str, Any], offset: int, limit: int) -> dict[str, Any]:
    key = artifact["path"]
    size = artifact.get("size_bytes")
    if size is not None and size > MAX_FILE_BYTES:
        return _page([], [], offset, limit, None, f"Fichier de {size / 1e6:.0f} Mo : trop volumineux pour un aperçu "
                                                   f"(limite {MAX_FILE_BYTES / 1e6:.0f} Mo).")
    try:
        raw = store.get_bytes(key)
    except rs.NotFound:
        return _page([], [], offset, limit, None, "Fichier absent du bucket (expiré ou supprimé).")
    data = gzip.decompress(raw) if key.endswith(".gz") else raw
    fmt = artifact["format"]
    if fmt == "csv":
        import pandas as pd

        frame = pd.read_csv(io.BytesIO(data), dtype=object, keep_default_na=False, na_values=[""])
        frame = frame.astype(object).where(frame.notna(), None)
        return _page([str(c) for c in frame.columns], frame.values.tolist(), offset, limit, len(frame))
    if fmt == "json":
        text = data.decode("utf-8", errors="replace")
        try:
            value = json.loads(text)
        except ValueError:  # JSON lines
            value = [json.loads(line) for line in text.splitlines() if line.strip()]
        columns, rows, note = _json_table(value)
        return _page(columns, rows, offset, limit, len(rows), note)
    if fmt == "parquet":
        try:
            import pandas as pd

            frame = pd.read_parquet(io.BytesIO(data))
        except ImportError:
            return _page([], [], offset, limit, None, "Format Parquet non lisible par l'API (pyarrow absent).")
        frame = frame.astype(object).where(frame.notna(), None)
        return _page([str(c) for c in frame.columns], frame.values.tolist(), offset, limit, len(frame))
    lines = data.decode("utf-8", errors="replace").splitlines()
    return _page(["ligne"], [[line] for line in lines], offset, limit, len(lines))


def preview(run_id: str, artifact_id: str, offset: int = 0, limit: int = 100) -> dict[str, Any]:
    _check(run_id)
    offset, limit = max(0, offset), max(1, min(limit, MAX_LIMIT))
    record = lab_record(run_id)
    store = rs.get_store()
    if record is not None:
        artifact = next((a for a in _lab_artifacts(record) if a["id"] == artifact_id), None)
        if artifact is None:
            raise ArtifactNotFound(artifact_id)
        return {"artifact": artifact, **_lab_preview(run_id, record, artifact, offset, limit)}
    if not artifact_id.startswith("file:"):
        raise ArtifactNotFound(artifact_id)
    key = _file_key(artifact_id)
    stages = _score_stages(store, run_id, _score_record(store, run_id))
    stage_id = next((s["id"] for s in stages if key in (s.get("outputs") or [])), None)
    if stage_id is None:  # only the run's own outputs can be read through it
        raise ArtifactNotFound(artifact_id)
    try:
        size: int | None = store.size(key)
    except Exception:
        size = None
    parts = key.split("/")
    artifact = {"id": artifact_id, "kind": "file", "stage_id": stage_id,
                "title": f"{parts[2]}/{parts[-1]}" if len(parts) > 3 else parts[-1], "format": _format(key),
                "path": key, "size_bytes": size, "rows": None, "columns": None}
    page = _file_preview(store, artifact, offset, limit)
    if page["total_rows"] is not None:
        artifact = {**artifact, "rows": page["total_rows"], "columns": len(page["columns"])}
    return {"artifact": artifact, **page}


__all__ = ["ArtifactNotFound", "RunNotFound", "list_artifacts", "preview"]
