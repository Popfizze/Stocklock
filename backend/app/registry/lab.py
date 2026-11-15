"""Labo runs in the registry: a run on one title, a group run (parent) and each title of a group (child).

    lab/index/<inverted ms>~<run id>~<pipeline>~<persona>~<status>~<trigger>.json   top-level runs only
    lab/runs/<run id>/run.json.gz               the run: summary, inputs, options, group, stage summaries,
                                                result, children, table
    lab/runs/<run id>/stages/<stage>.json.gz    one stage in full: metrics, preview, decisions, every
                                                dataset with every row (never cut here)

The index key carries what the list filters on, newest first in key order, so a page of the list is
one S3 listing plus one small read per run shown. Saving never breaks a run: a storage error is logged
and the run's answer is returned as usual.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from app.pipeline.core import RunResult, StepSpec
from app.registry import store as rs

log = logging.getLogger(__name__)

INDEX_PREFIX = "lab/index/"
RUNS_PREFIX = "lab/runs/"
TRIGGER = "labo"
INVERT_FROM = 10**13  # inverted epoch milliseconds keep 13 digits until year 2286
SEP = "~"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def millis(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def run_key(run_id: str) -> str:
    return f"{RUNS_PREFIX}{run_id}/run.json.gz"


def stage_key(run_id: str, stage_id: str) -> str:
    return f"{RUNS_PREFIX}{run_id}/stages/{stage_id}.json.gz"


def index_key(summary: dict[str, Any]) -> str:
    inverted = INVERT_FROM - millis(summary["started_at"])
    parts = [f"{inverted:013d}", summary["run_id"], summary["pipeline"], summary["persona_id"] or "-",
             summary["status"], summary["trigger"]]
    return INDEX_PREFIX + SEP.join(parts) + ".json"


def parse_index_key(key: str) -> dict[str, Any] | None:
    parts = key[len(INDEX_PREFIX):].removesuffix(".json").split(SEP)
    if len(parts) != 6 or not parts[0].isdigit():
        return None
    inverted, run_id, pipeline, persona, status, trigger = parts
    return {"key": key, "ms": INVERT_FROM - int(inverted), "run_id": run_id, "pipeline": pipeline,
            "persona_id": None if persona == "-" else persona, "status": status, "trigger": trigger}


# --- records -----------------------------------------------------------------------------------------

def run_status(stages: list[dict[str, Any]]) -> str:
    if any(s["status"] == "error" for s in stages):
        return "failed"
    return "warning" if any(s["status"] == "warning" for s in stages) else "succeeded"


def stage_info(stage: dict[str, Any], layers: dict[str, str]) -> dict[str, Any]:
    return {
        "id": stage["id"], "name": stage["name"], "layer": layers.get(stage["id"]), "status": stage["status"],
        "duration_ms": stage.get("duration_ms"), "warnings": len(stage.get("warnings") or []),
        "decisions": len(stage.get("decisions") or []),
        "datasets": [{"id": d["id"], "title": d["title"], "source_id": d.get("source_id"),
                      "rows": d.get("total_rows", len(d["rows"])), "columns": len(d["columns"])}
                     for d in stage.get("datasets") or []],
    }


def _failure(stages: list[dict[str, Any]]) -> str | None:
    failed = next((s for s in stages if s["status"] == "error"), None)
    return f"Étape « {failed['name']} » en erreur : {'; '.join(failed['warnings'])}" if failed else None


def single_record(step: StepSpec, persona_id: str, result: RunResult, response: Any, started_at: str,
                  kind: str = "single", parent_id: str | None = None) -> dict[str, Any]:
    inputs = result.context.inputs.model_dump(mode="json")
    title = str(inputs.get(step.group_input) or "") if step.group_input else ""
    governance = response.governance.passed if response is not None else None
    summary = {
        "run_id": result.run_id, "pipeline": f"lab.{step.id}", "pipeline_label": f"Labo · {step.label}",
        "kind": kind, "status": run_status(result.stages), "trigger": TRIGGER, "persona_id": persona_id,
        "title": title or step.label, "started_at": started_at, "finished_at": now_iso(),
        "duration_ms": round(result.duration_ms, 1), "key_result": result.key_result,
        "governance_passed": governance, "error": _failure(result.stages), "parent_id": parent_id,
        "child_count": 0,
    }
    layers = {s.id: s.layer for s in step.stages}
    return {**summary, "inputs": inputs, "options": result.options_used, "group": None,
            "stages": [stage_info(s, layers) for s in result.stages],
            "result": response.model_dump(mode="json") if response is not None else None,
            "children": [], "table": None, "params": None, "summary": None}


def summary_of(record: dict[str, Any]) -> dict[str, Any]:
    keys = ("run_id", "pipeline", "pipeline_label", "kind", "status", "trigger", "persona_id", "title",
            "started_at", "finished_at", "duration_ms", "key_result", "governance_passed", "error", "parent_id",
            "child_count")
    return {k: record.get(k) for k in keys}


def _write(objects: dict[str, Any]) -> None:
    store = rs.get_store()
    with ThreadPoolExecutor(max_workers=min(8, len(objects)), thread_name_prefix="registry") as pool:
        for future in [pool.submit(rs.put_json, store, key, value) for key, value in objects.items()]:
            future.result()


def save_single(step: StepSpec, persona_id: str, result: RunResult, response: Any, started_at: str,
                kind: str = "single", parent_id: str | None = None) -> dict[str, Any] | None:
    """Stores a run on one title with every stage in full; its summary, or None when storing failed.

    Call it before `RunResult.to_dict`, which cuts the datasets to fit a response."""
    try:
        record = single_record(step, persona_id, result, response, started_at, kind, parent_id)
        objects: dict[str, Any] = {run_key(result.run_id): record}
        objects.update({stage_key(result.run_id, s["id"]): s for s in result.stages})
        if parent_id is None:
            objects[index_key(record)] = summary_of(record)
        _write(objects)
        return summary_of(record)
    except Exception:  # storage must never break a run
        log.exception("registry: run %s not stored", result.run_id)
        return None


def save_batch(step: StepSpec, persona_id: str, batch: dict[str, Any], started_at: str, inputs: dict[str, Any],
               children: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Stores a group run (its titles were stored as they finished); its summary, or None on failure."""
    try:
        counts = batch["summary"]
        n = counts["requested"]
        not_ok = counts["error"] + counts["timeout"]
        skipped = counts.get("skipped", 0)  # nothing to analyse for the title (no quotation in the period)
        status = "failed" if not_ok + skipped == n else ("succeeded" if counts["ok"] + skipped == n else "warning")
        summary = {
            "run_id": batch["batch_id"], "pipeline": f"lab.{step.id}", "pipeline_label": f"Labo · {step.label}",
            "kind": "batch", "status": status, "trigger": TRIGGER, "persona_id": persona_id,
            "title": f"Groupe · {batch['group']['label']} ({n} titre{'s' if n > 1 else ''})",
            "started_at": started_at, "finished_at": now_iso(), "duration_ms": batch["duration_ms"],
            "key_result": None, "governance_passed": None,
            "error": " ".join(filter(None, [
                f"{not_ok} titre(s) en erreur ou non terminé(s)." if not_ok else None,
                f"{skipped} titre(s) ignoré(s), sans cotation sur la période." if skipped else None])) or None,
            "parent_id": None,
            "child_count": n,
        }
        record = {**summary, "inputs": inputs, "options": batch["options_used"], "group": batch["group"],
                  "stages": [], "result": None, "children": children, "table": batch["table"],
                  "params": None, "summary": None, "items": batch["items"], "budget": batch["budget"]}
        _write({run_key(summary["run_id"]): record, index_key(summary): summary})
        return summary
    except Exception:
        log.exception("registry: group run %s not stored", batch.get("batch_id"))
        return None
