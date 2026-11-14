"""Entry point of every stage (the `score` collector Lambda calls `handle`, so does the local runner).

Events (built by the state machine):
    {"stage": "init", "execution_name": "...", "input": {"params": {...}, "trigger": "api"}}
    {"stage": "<stage id>", "run": {run context}}
    {"stage": "finalize", "run": {...}}
    {"stage": "fail", "run": {...}, "error": {"Error": "...", "Cause": "..."}}
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from typing import Any

from app.score_pipeline import articles, cours, evenements, gold, releves, titres
from app.score_pipeline import store as st
from app.score_pipeline.runs import (RunContext, StageRecorder, finish_record, new_context, new_run_id, run_key,
                                     start_record, stage_key)

log = logging.getLogger("stocklock.score_pipeline")
SAFETY_MARGIN_S = 45

Runner = Callable[[RunContext, st.Store, StageRecorder, float], None]
RUNNERS: dict[str, Runner] = {
    "bronze_titres": titres.bronze,
    "silver_univers": titres.silver,
    "bronze_releves": releves.bronze,
    "bronze_cours": cours.bronze,
    "bronze_articles": articles.bronze,
    "silver_releves": releves.silver,
    "silver_cours": cours.silver,
    "silver_evenements": evenements.silver,
    "gold": gold.run,
}


def _error_message(error: dict[str, Any] | None) -> dict[str, Any]:
    """Step Functions' {"Error", "Cause"} -> {"error", "message", "stage"}; Cause is the Lambda's error JSON."""
    error = error or {}
    cause = error.get("Cause") or ""
    message = cause
    try:
        parsed = json.loads(cause)
        message = f"{parsed.get('errorType', '')}: {parsed.get('errorMessage', '')}".strip(": ")
    except (TypeError, ValueError):
        pass
    return {"error": error.get("Error") or "Erreur", "message": (message or error.get("Error") or "")[:2000]}


def handle(event: dict[str, Any], store: st.Store, remaining_ms: int | None = None) -> dict[str, Any]:
    stage = event.get("stage")
    if stage == "init":
        payload = event.get("input") or {}
        ctx = new_context(event.get("execution_name") or new_run_id(), payload.get("trigger") or "schedule",
                          payload.get("params"))
        st.put_json(store, run_key(ctx.run_id), start_record(ctx))
        log.info("run %s started with %s", ctx.run_id, ctx.params.model_dump())
        return {"run": ctx.to_dict()}

    ctx = RunContext.from_dict(event["run"])
    if stage == "finalize":
        record = finish_record(store, ctx, "succeeded")
        return {"run_id": ctx.run_id, "status": record["status"], "summary": record["summary"]}
    if stage == "fail":
        record = finish_record(store, ctx, "failed", _error_message(event.get("error")))
        return {"run_id": ctx.run_id, "status": record["status"]}
    if stage not in RUNNERS:
        raise ValueError(f"étape inconnue {stage!r}")

    budget_s = (remaining_ms / 1000 if remaining_ms else 900) - SAFETY_MARGIN_S
    deadline = time.monotonic() + max(30.0, budget_s)
    rec = StageRecorder(store, ctx, stage)
    rec.write("running")
    try:
        RUNNERS[stage](ctx, store, rec, deadline)
    except Exception as exc:
        rec.write("failed", f"{type(exc).__name__}: {exc}")
        log.exception("stage %s of run %s failed", stage, ctx.run_id)
        raise
    record = rec.write("succeeded")
    return {"run_id": ctx.run_id, "stage": stage, "status": "succeeded", "rows": record["rows"],
            "duration_s": record["duration_s"], "key": st.ROOT_PREFIX + stage_key(ctx.run_id, stage)}
