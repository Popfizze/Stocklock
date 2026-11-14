"""Routes of the Labo's « Pipeline de score » button: start a run on AWS, follow it, list recent runs.

A run is an execution of the Step Functions state machine `SCORE_PIPELINE_ARN`, named by its run id; its
record and stage records are read from the data bucket (`score/runs/...`, written by the stages).

    POST /api/pipeline/score/runs            start a run (202), 409 while another one is running
    GET  /api/pipeline/score/runs            the 20 most recent runs (no stage detail)
    GET  /api/pipeline/score/runs/{run_id}   one run: status per stage, decisions, samples, errors
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Body, HTTPException

from app.config import get_settings
from app.score_pipeline import store as st
from app.score_pipeline.runs import STAGES, RunParams, new_run_id, now_iso, pending_stage, read_stages, run_key
from app.services import score_table

router = APIRouter(prefix="/api/pipeline/score", tags=["pipeline de score"])
RUN_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
LIST_LIMIT = 20
EXECUTION_STATUS = {"RUNNING": "running", "SUCCEEDED": "succeeded", "FAILED": "failed", "TIMED_OUT": "failed",
                    "ABORTED": "failed", "PENDING_REDRIVE": "failed"}


# --- AWS clients (patched in tests) ---------------------------------------------------------------------

def _sfn() -> Any:
    import boto3

    return boto3.client("stepfunctions", region_name=get_settings().aws_region)


def _store() -> st.Store:
    return st.S3Store(get_settings().data_bucket)


def _state_machine() -> str:
    s = get_settings()
    if not s.score_pipeline_arn or not s.data_bucket:
        raise HTTPException(status_code=503, detail="Le pipeline de score n'est pas déployé ici "
                                                    "(SCORE_PIPELINE_ARN ou DATA_BUCKET manquant).")
    return s.score_pipeline_arn


def _execution_arn(state_machine: str, run_id: str) -> str:
    return state_machine.replace(":stateMachine:", ":execution:") + ":" + run_id


# --- Views -----------------------------------------------------------------------------------------------

def _read_record(store: st.Store, run_id: str) -> dict[str, Any] | None:
    try:
        return st.get_json(store, run_key(run_id))
    except st.NotFound:
        return None


def _current_stage(stages: list[dict[str, Any]]) -> str | None:
    return next((s["id"] for s in stages if s["status"] == "running"), None)


def _view(run_id: str, record: dict[str, Any] | None, execution: dict[str, Any] | None,
          stages: list[dict[str, Any]] | None) -> dict[str, Any]:
    record = record or {}
    status = record.get("status") or "running"
    error = record.get("error")
    if execution is not None:
        exec_status = EXECUTION_STATUS.get(execution.get("status", ""), "running")
        if status == "running" and exec_status == "failed":
            status = "failed"
            error = error or {"error": execution.get("error") or execution.get("status"),
                              "message": (execution.get("cause") or "Exécution interrompue")[:2000]}
        elif status == "running" and exec_status == "succeeded":
            status = "succeeded"
    started = record.get("started_at") or (execution or {}).get("startDate")
    finished = record.get("finished_at") or ((execution or {}).get("stopDate") if status != "running" else None)
    view = {
        "run_id": run_id, "status": status, "trigger": record.get("trigger") or "schedule",
        "date": record.get("date"), "params": record.get("params") or RunParams().model_dump(),
        "started_at": str(started) if started else None, "finished_at": str(finished) if finished else None,
        "duration_s": record.get("duration_s"), "current_stage": None, "summary": record.get("summary"),
        "error": error,
    }
    if stages is not None:
        if status == "failed":
            for s in stages:
                if s["status"] == "running":
                    s["status"] = "failed"
        view["stages"] = stages
        view["current_stage"] = _current_stage(stages)
    return view


# --- Routes ----------------------------------------------------------------------------------------------

@router.post("/runs", status_code=202)
def start_run(params: RunParams | None = Body(default=None)) -> dict[str, Any]:
    state_machine = _state_machine()
    params = params or RunParams()
    sfn = _sfn()
    running = sfn.list_executions(stateMachineArn=state_machine, statusFilter="RUNNING", maxResults=5)
    if running.get("executions"):
        current = running["executions"][0]["name"]
        raise HTTPException(status_code=409, detail=f"Une exécution du pipeline de score est déjà en cours "
                                                    f"({current}) : attendez qu'elle se termine.")
    run_id = new_run_id()
    sfn.start_execution(stateMachineArn=state_machine, name=run_id,
                        input=json.dumps({"params": params.model_dump(), "trigger": "api"}))
    return _view(run_id, {"status": "running", "trigger": "api", "params": params.model_dump(),
                          "started_at": now_iso()}, None, [pending_stage(d) for d in STAGES])


@router.get("/runs")
def list_runs() -> dict[str, Any]:
    s = get_settings()
    configured = bool(s.score_pipeline_arn and s.data_bucket)
    if not configured:
        return {"configured": False, "stages": _catalog(), "runs": []}
    sfn, store = _sfn(), _store()
    executions = sfn.list_executions(stateMachineArn=s.score_pipeline_arn, maxResults=LIST_LIMIT).get("executions", [])
    runs = []
    for execution in executions:
        run_id = execution["name"]
        runs.append(_view(run_id, _read_record(store, run_id), execution, None))
    return {"configured": True, "stages": _catalog(), "runs": runs}


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    state_machine = _state_machine()
    if not RUN_ID.match(run_id):
        raise HTTPException(status_code=404, detail=f"run inconnu {run_id!r}")
    sfn, store = _sfn(), _store()
    record = _read_record(store, run_id)
    try:
        execution = sfn.describe_execution(executionArn=_execution_arn(state_machine, run_id))
    except Exception as exc:  # ExecutionDoesNotExist, or a run made elsewhere (local)
        if record is None:
            raise HTTPException(status_code=404, detail=f"run inconnu {run_id!r}") from exc
        execution = None
    finished = record is not None and record.get("status") in {"succeeded", "failed"}
    stages = record["stages"] if finished else read_stages(store, run_id)
    view = _view(run_id, record, execution, stages)
    if view["status"] == "succeeded":
        _refresh_score_table(view["started_at"])
    return view


def _instant(value: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")) if value else None
    except ValueError:
        return None


def _refresh_score_table(run_started_at: str | None) -> None:
    """Drop this instance's 10-minute copy of the score table when it predates a finished run."""
    state = score_table.load()
    generated, started = _instant(state.get("generated_at")), _instant(run_started_at)
    if state["status"] != "available" or (generated and started and generated < started):
        score_table.reset()


def _catalog() -> list[dict[str, Any]]:
    return [{"id": d.id, "layer": d.layer, "label": d.label, "datasets": list(d.datasets),
             "description": d.description} for d in STAGES]

