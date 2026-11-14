"""Unified view of the registry: Labo runs (`lab/`) and score pipeline runs (`score/runs/`), newest first.

Score pipeline runs are only read, from the records the pipeline writes (`app.score_pipeline.runs`):
    score/runs/<run_id>.json                 the run record (stages inline once finished)
    score/runs/<run_id>/stages/<stage>.json  one record per stage while it runs
Their run ids start with their UTC start time (20261115T060000Z-1a2b3c), which orders them without
reading them. A list cursor is `<epoch ms>~<run id>` of the last run shown.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.pipeline.core import RESPONSE_MAX_BYTES, fit_datasets
from app.registry import lab
from app.registry import store as rs
from app.score_pipeline.runs import STAGES as SCORE_STAGES

RUN_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
SCORE_RECORD = re.compile(r"^score/runs/([A-Za-z0-9_-]+)\.json$")
SCORE_PIPELINE = "score_pipeline"
LIST_PAGES = 20  # S3 listing pages read at most for one page of runs


class RunNotFound(LookupError):
    pass


# --- score pipeline records ----------------------------------------------------------------------------

def _score_ms(run_id: str) -> int | None:
    try:
        stamp = datetime.strptime(run_id[:16], "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return int(stamp.timestamp() * 1000)


def _score_record(store: rs.Store, run_id: str) -> dict[str, Any]:
    try:
        return rs.get_json(store, f"score/runs/{run_id}.json")
    except rs.NotFound as exc:
        raise RunNotFound(run_id) from exc


def _score_stages(store: rs.Store, run_id: str, record: dict[str, Any]) -> list[dict[str, Any]]:
    if record.get("stages"):
        return record["stages"]
    out = []
    for d in SCORE_STAGES:
        try:
            out.append(rs.get_json(store, f"score/runs/{run_id}/stages/{d.id}.json"))
        except rs.NotFound:
            out.append({"id": d.id, "layer": d.layer, "label": d.label, "status": "pending", "decisions": [],
                        "samples": [], "warnings": [], "outputs": [], "duration_s": None})
    return out


def _iso(value: Any) -> str | None:
    return str(value) if value else None


def score_summary(run_id: str, record: dict[str, Any]) -> dict[str, Any]:
    summary = record.get("summary") or {}
    group = (record.get("group") or {}).get("label")
    title = f"Pipeline de score du {record.get('date') or run_id[:8]}" + (f" · {group}" if group else "")
    error = record.get("error") or None
    duration = record.get("duration_s")
    scored = summary.get("titles_scored")
    started = _iso(record.get("started_at")) or datetime.fromtimestamp(
        (_score_ms(run_id) or 0) / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "run_id": run_id, "pipeline": SCORE_PIPELINE, "pipeline_label": "Pipeline de score", "kind": "pipeline",
        "status": record.get("status") or "running", "trigger": record.get("trigger") or "schedule",
        "persona_id": None, "title": title, "started_at": started, "finished_at": _iso(record.get("finished_at")),
        "duration_ms": round(duration * 1000, 1) if isinstance(duration, (int, float)) else None,
        "key_result": {"label": "Titres notés", "value": scored} if scored is not None else None,
        "governance_passed": None,
        "error": (error.get("message") or error.get("error")) if isinstance(error, dict) else error,
        "parent_id": None, "child_count": 0,
    }


def _score_stage_info(stage: dict[str, Any]) -> dict[str, Any]:
    duration = stage.get("duration_s")
    return {"id": stage["id"], "name": stage.get("label") or stage["id"], "layer": stage.get("layer"),
            "status": stage.get("status") or "pending",
            "duration_ms": round(duration * 1000, 1) if isinstance(duration, (int, float)) else None,
            "warnings": len(stage.get("warnings") or []), "decisions": len(stage.get("decisions") or []),
            "datasets": [{"id": s["dataset"], "title": s["dataset"], "source_id": None,
                          "rows": s.get("total_rows", len(s.get("rows") or [])), "columns": len(s.get("columns") or [])}
                         for s in stage.get("samples") or []]}


# --- list ----------------------------------------------------------------------------------------------

def _cursor(ms: int, run_id: str) -> str:
    return f"{ms}~{run_id}"


def _parse_cursor(cursor: str | None) -> tuple[int, str] | None:
    if not cursor:
        return None
    ms, _, run_id = cursor.partition("~")
    if not ms.isdigit() or not RUN_ID.match(run_id):
        raise ValueError(f"curseur invalide {cursor!r}")
    return int(ms), run_id


def _lab_candidates(store: rs.Store, after: tuple[int, str] | None, filters: dict[str, str | None]
                    ) -> Iterator[dict[str, Any]]:
    start = ""
    if after:  # index keys sort newest first: start after the cursor's own key
        # "~" sorts after every character of the key's remaining parts ([a-z0-9._-])
        start = f"{lab.INDEX_PREFIX}{lab.INVERT_FROM - after[0]:013d}{lab.SEP}{after[1]}{lab.SEP}~"
    for _ in range(LIST_PAGES):
        keys, more = store.list_page(lab.INDEX_PREFIX, start)
        for key in keys:
            entry = lab.parse_index_key(key)
            if entry is None:
                continue
            pipeline = filters.get("pipeline")
            if pipeline and not (entry["pipeline"] == pipeline or (pipeline == "lab" and
                                                                   entry["pipeline"].startswith("lab."))):
                continue
            if any(filters.get(f) and entry[k] != filters[f] for f, k in
                   (("persona", "persona_id"), ("status", "status"), ("trigger", "trigger"))):
                continue
            yield entry
        if not more or not keys:
            return
        start = keys[-1]


def _score_candidates(store: rs.Store, after: tuple[int, str] | None, filters: dict[str, str | None]
                      ) -> Iterator[dict[str, Any]]:
    pipeline = filters.get("pipeline")
    if filters.get("persona") or (pipeline and pipeline != SCORE_PIPELINE) or filters.get("trigger") == "labo":
        return
    ids, start = [], ""
    for _ in range(LIST_PAGES):
        keys, more = store.list_page("score/runs/", start)
        ids += [m.group(1) for m in map(SCORE_RECORD.match, keys) if m]
        if not more or not keys:
            break
        start = keys[-1]
    entries = sorted(((ms, run_id) for run_id in ids if (ms := _score_ms(run_id)) is not None), reverse=True)
    for ms, run_id in entries:
        if after and (ms, run_id) >= after:
            continue
        entry = {"ms": ms, "run_id": run_id, "pipeline": SCORE_PIPELINE}
        if filters.get("status") or filters.get("trigger"):  # only in the record
            record = _score_record(store, run_id)
            summary = score_summary(run_id, record)
            if any(filters.get(f) and summary[f] != filters[f] for f in ("status", "trigger")):
                continue
            entry["summary"] = summary
        yield entry


def _merge(a: Iterator[dict[str, Any]], b: Iterator[dict[str, Any]], count: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    x, y = next(a, None), next(b, None)
    while len(out) < count and (x or y):
        if y is None or (x is not None and (x["ms"], x["run_id"]) >= (y["ms"], y["run_id"])):
            out.append(x)
            x = next(a, None)
        else:
            out.append(y)
            y = next(b, None)
    return out


def _summary(store: rs.Store, entry: dict[str, Any]) -> dict[str, Any]:
    if "summary" in entry:
        return entry["summary"]
    if entry["pipeline"] == SCORE_PIPELINE:
        return score_summary(entry["run_id"], _score_record(store, entry["run_id"]))
    return rs.get_json(store, entry["key"])


def list_runs(pipeline: str | None = None, persona: str | None = None, status: str | None = None,
              trigger: str | None = None, limit: int = 20, cursor: str | None = None) -> dict[str, Any]:
    store = rs.get_store()
    after = _parse_cursor(cursor)
    filters = {"pipeline": pipeline, "persona": persona, "status": status, "trigger": trigger}
    entries = _merge(_lab_candidates(store, after, filters), _score_candidates(store, after, filters), limit + 1)
    page = entries[:limit]
    with ThreadPoolExecutor(max_workers=16, thread_name_prefix="registry-list") as pool:
        runs = list(pool.map(lambda e: _summary(store, e), page))
    more = len(entries) > limit
    return {"runs": runs, "next_cursor": _cursor(page[-1]["ms"], page[-1]["run_id"]) if more else None,
            "stored": True}


# --- one run -------------------------------------------------------------------------------------------

def _check(run_id: str) -> None:
    if not RUN_ID.match(run_id):
        raise RunNotFound(run_id)


def lab_record(run_id: str) -> dict[str, Any] | None:
    try:
        return rs.get_json(rs.get_store(), lab.run_key(run_id))
    except rs.NotFound:
        return None


def get_run(run_id: str) -> dict[str, Any]:
    _check(run_id)
    record = lab_record(run_id)
    if record is not None:
        return {k: v for k, v in record.items() if k not in {"items", "budget"}}
    store = rs.get_store()
    score = _score_record(store, run_id)
    stages = _score_stages(store, run_id, score)
    return {**score_summary(run_id, score), "inputs": None, "options": None, "group": None,
            "stages": [_score_stage_info(s) for s in stages], "result": None, "children": [], "table": None,
            "params": score.get("params"), "summary": score.get("summary")}


def get_stage(run_id: str, stage_id: str) -> dict[str, Any]:
    """One stage in full; a Labo stage's datasets are cut to fit a response (`truncated`)."""
    _check(run_id)
    store = rs.get_store()
    if lab_record(run_id) is not None:
        try:
            stage = rs.get_json(store, lab.stage_key(run_id, stage_id))
        except rs.NotFound as exc:
            raise RunNotFound(f"{run_id}/{stage_id}") from exc
        fit_datasets([stage], RESPONSE_MAX_BYTES - 200_000)
        return {"pipeline": "lab", "stage": stage}
    stages = _score_stages(store, run_id, _score_record(store, run_id))
    stage = next((s for s in stages if s["id"] == stage_id), None)
    if stage is None:
        raise RunNotFound(f"{run_id}/{stage_id}")
    return {"pipeline": SCORE_PIPELINE, "stage": stage}


def configured() -> bool:
    return bool(get_settings().data_bucket)
