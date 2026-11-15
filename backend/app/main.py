"""StockLock FastAPI app: personas, the four analysis routes and the Lab (pipeline catalog and runs).

Run from backend/: uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from threading import Lock, Thread
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from app.accounts_api import router as accounts_router
from app.config import get_settings
from app.market_api import router as market_router
from app.personas import get_persona, list_public
from app.pipeline import batch
from app.pipeline.core import OptionError, PipelineInputError
from app.pipeline.explain_move_fetch import Budget
from app.pipeline.registry import STEPS, catalog, execute
from app.registry import lab as stored_runs
from app.profile_api import router as profile_router
from app.runs_api import router as runs_router
from app.score_pipeline_api import router as score_pipeline_router
from app.scoring_api import router as scoring_router
from app.schemas import (AnalysisResponse, BiasRequest, ExplainMoveRequest, LabBatchRequest, LabRunRequest,
                         Persona, ScoreRequest, StockBiasRequest, StockMovesRequest, TaxRequest)
from app.services import lab_groups, moves_cache, moves_view, narration

settings = get_settings()
log = logging.getLogger("stocklock.http")
log.setLevel(logging.INFO)  # Lambda's default root logger is often WARNING; latency logs must reach CloudWatch.


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    narration.warm_up()  # a new instance starts its AgentCore session while it boots (no model call)
    yield


app = FastAPI(title="StockLock API", version="0.1.0", lifespan=lifespan,
              description="Assistant d'investissement agentique et auto-explicatif (simulation, données publiques).")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])


@app.middleware("http")
async def endpoint_timing(request: Any, call_next: Any) -> Any:
    """One structured CloudWatch log per API call, with the matched endpoint and its duration."""
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = round((time.perf_counter() - started) * 1000, 1)
        log.exception(json.dumps({"event": "http_request", "endpoint": request.url.path,
                                  "method": request.method, "status": 500, "duration_ms": duration_ms}))
        raise
    duration_ms = round((time.perf_counter() - started) * 1000, 1)
    route = request.scope.get("route")
    endpoint = getattr(route, "path", request.url.path)
    log.info(json.dumps({"event": "http_request", "endpoint": endpoint, "method": request.method,
                         "status": response.status_code, "duration_ms": duration_ms}))
    response.headers["Server-Timing"] = f"app;dur={duration_ms}"
    return response


app.include_router(accounts_router)
app.include_router(scoring_router)  # POST /api/scores/reweight before the market's /api/scores/{ticker}
app.include_router(market_router)
app.include_router(profile_router)
app.include_router(score_pipeline_router)
app.include_router(runs_router)


# The stock-page analysis reports real stage completions while it runs. Results are kept briefly
# in process memory because this prototype has neither authentication nor a durable job queue.
_BIAS_RUNS: dict[str, dict[str, Any]] = {}
_BIAS_RUNS_LOCK = Lock()
_BIAS_RUN_TTL_SECONDS = 30 * 60


def _stock_bias_body(result: Any, response: AnalysisResponse) -> dict[str, Any]:
    ctx = result.context
    return {
        "analysis": response.model_dump(),
        "signals": ctx.state.get("signals", []),
        "profile_flags": ctx.report.profile_flags,
        "history": ctx.state.get("market_history"),
        "hype": ctx.state.get("hype"),
        "simulation": ctx.state.get("simulation_data"),
        "warnings": [warning for stage in result.stages for warning in stage["warnings"]],
    }


def _bias_run_view(run: dict[str, Any]) -> dict[str, Any]:
    view = {"run_id": run["run_id"], "status": run["status"], "stages": run["stages"]}
    if run.get("error"):
        view["error"] = run["error"]
    if run.get("result"):
        view["result"] = run["result"]
    return view


def _prune_bias_runs() -> None:
    cutoff = time.monotonic() - _BIAS_RUN_TTL_SECONDS
    for run_id, run in list(_BIAS_RUNS.items()):
        if run["created_at"] < cutoff:
            del _BIAS_RUNS[run_id]


def _run_stock_bias(run_id: str, persona: dict[str, Any], request: StockBiasRequest) -> None:
    def on_stage(event: str, record: Any) -> None:
        with _BIAS_RUNS_LOCK:
            run = _BIAS_RUNS.get(run_id)
            if not run:
                return
            stage = next(item for item in run["stages"] if item["id"] == record.id)
            if event == "started":
                run["status"] = "running"
                stage["status"] = "active"
            else:
                stage["status"] = "done" if record.status in {"ok", "warning", "skipped"} else "error"

    try:
        result, response = execute(
            "bias", persona, request.model_dump(exclude={"persona_id"}),
            {"simulation_2022.portfolio": "ticker"}, on_stage=on_stage,
        )
        if result.failed:
            failed = next(stage for stage in result.stages if stage["status"] == "error")
            with _BIAS_RUNS_LOCK:
                run = _BIAS_RUNS.get(run_id)
                if run:
                    run["status"] = "failed"
                    run["error"] = f"Étape « {failed['name']} » indisponible."
            return
        with _BIAS_RUNS_LOCK:
            run = _BIAS_RUNS.get(run_id)
            if run:
                run["status"] = "completed"
                run["result"] = _stock_bias_body(result, response)
    except PipelineInputError as exc:
        with _BIAS_RUNS_LOCK:
            run = _BIAS_RUNS.get(run_id)
            if run:
                run["status"] = "failed"
                run["error"] = str(exc)
    except Exception:
        with _BIAS_RUNS_LOCK:
            run = _BIAS_RUNS.get(run_id)
            if run:
                run["status"] = "failed"
                run["error"] = "Impossible de terminer l’analyse."


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "agent_mode": settings.agent_mode, "model": settings.bedrock_model_id,
            "fast_model": settings.bedrock_fast_model_id, "data_dir_exists": settings.data_dir.is_dir()}


@app.get("/api/personas", response_model=list[Persona])
def personas() -> list[dict[str, Any]]:
    return list_public()


def _run_business(step_id: str, request: BaseModel) -> AnalysisResponse:
    persona = get_persona(request.persona_id)  # type: ignore[attr-defined]
    inputs = request.model_dump(exclude={"persona_id"})
    try:
        result, response = execute(step_id, persona, inputs)
    except PipelineInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result.failed:
        failed = next(s for s in result.stages if s["status"] == "error")
        raise HTTPException(status_code=503, detail=f"Étape « {failed['name']} » en erreur : "
                                                    f"{'; '.join(failed['warnings'])}")
    return response


@app.post("/api/score", response_model=AnalysisResponse)
def score(request: ScoreRequest) -> AnalysisResponse:
    return _run_business("score", request)


@app.post("/api/explain-move", response_model=AnalysisResponse)
def explain_move(request: ExplainMoveRequest) -> AnalysisResponse:
    return _run_business("explain_move", request)


@app.post("/api/explain-move/stock")
def stock_moves(request: StockMovesRequest) -> dict[str, Any]:
    """Step 2 on a stock page: the period's marked moves and what plausibly explains each one.

    Market model (beta over the year before the window, with its fallback); the business and Lab
    contracts of /api/explain-move stay unchanged. Answered from the cache when it can be
    (services/moves_cache), else computed within a time budget (pipeline/explain_move_fetch): the
    sources and pages left out are stated in the warnings and in `cache.skipped`."""
    started = time.perf_counter()
    persona = get_persona(request.persona_id)
    start, end = moves_view.window_for(request.period)
    options = {"benchmark.method": "market_model"}
    cache_key = moves_cache.key(request.ticker, start, end, request.persona_id, options)
    hit = moves_cache.get(cache_key)
    if hit is not None:
        return moves_cache.served(hit[0], hit[1], started)
    narration.warm_up()  # the model session starts while the prices load
    budget = Budget()
    try:
        result, response = execute("explain_move", persona, {"ticker": request.ticker, "start": start, "end": end},
                                   options, state={"budget": budget})
    except PipelineInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result.failed:
        failed = next(s for s in result.stages if s["status"] == "error")
        raise HTTPException(status_code=503, detail=f"Étape « {failed['name']} » indisponible.")
    body = moves_view.build(result, response, request.period)
    skipped = [*budget.skipped, *result.context.state.get("degraded", [])]
    return moves_cache.served(moves_cache.put(cache_key, body, skipped), None, started)


@app.post("/api/tax", response_model=AnalysisResponse)
def tax(request: TaxRequest) -> AnalysisResponse:
    return _run_business("tax", request)


@app.post("/api/bias", response_model=AnalysisResponse)
def bias(request: BiasRequest) -> AnalysisResponse:
    return _run_business("bias", request)


@app.post("/api/bias/stock")
def stock_bias(request: StockBiasRequest) -> dict[str, Any]:
    """Bias analysis for a stock page; keep the legacy business and Lab contracts unchanged."""
    persona = get_persona(request.persona_id)
    try:
        result, response = execute("bias", persona, request.model_dump(exclude={"persona_id"}),
                                   {"simulation_2022.portfolio": "ticker"})
    except PipelineInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result.failed:
        failed = next(s for s in result.stages if s["status"] == "error")
        raise HTTPException(status_code=503, detail=f"Étape « {failed['name']} » indisponible.")
    return _stock_bias_body(result, response)


@app.post("/api/bias/stock/runs")
def start_stock_bias_run(request: StockBiasRequest) -> dict[str, Any]:
    """Starts a stock-page bias analysis and returns a status resource to poll."""
    persona = get_persona(request.persona_id)
    run_id = uuid4().hex
    run = {
        "run_id": run_id,
        "status": "queued",
        "created_at": time.monotonic(),
        "stages": [{"id": stage.id, "name": stage.name, "status": "pending"} for stage in STEPS["bias"].stages],
    }
    with _BIAS_RUNS_LOCK:
        _prune_bias_runs()
        _BIAS_RUNS[run_id] = run
    Thread(target=_run_stock_bias, args=(run_id, persona, request), daemon=True).start()
    return _bias_run_view(run)


@app.get("/api/bias/stock/runs/{run_id}")
def stock_bias_run(run_id: str) -> dict[str, Any]:
    """Returns the latest completed stage and the result once every stage is done."""
    with _BIAS_RUNS_LOCK:
        run = _BIAS_RUNS.get(run_id)
        if not run:
            raise HTTPException(status_code=404, detail="Analyse introuvable ou expirée.")
        return _bias_run_view(run)


# --- Lab ----------------------------------------------------------------------------------------

@app.get("/api/lab/pipelines")
def lab_pipelines() -> dict[str, Any]:
    return catalog()


@app.post("/api/lab/run")
def lab_run(request: LabRunRequest) -> dict[str, Any]:
    if request.step not in STEPS:
        raise HTTPException(status_code=422, detail=f"étape inconnue {request.step!r} ; étapes : {sorted(STEPS)}")
    persona = get_persona(request.persona_id)
    started_at = stored_runs.now_iso()
    try:
        result, response = execute(request.step, persona, request.inputs, request.options, datasets=True)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False)) from exc
    except (OptionError, PipelineInputError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # stored with every row first: to_dict cuts the datasets to fit the response
    stored_runs.save_single(STEPS[request.step], request.persona_id, result, response, started_at)
    return result.to_dict(response.model_dump(mode="json"))


@app.get("/api/lab/groups")
def lab_groups_catalog() -> dict[str, Any]:
    """Sections and sectors a group run can target, and the largest group size."""
    return lab_groups.catalog()


@app.post("/api/lab/run-batch")
def lab_run_batch(request: LabBatchRequest) -> dict[str, Any]:
    """One step on every title of a group, synchronously (see app.pipeline.batch for the time budget)."""
    if request.step not in STEPS:
        raise HTTPException(status_code=422, detail=f"étape inconnue {request.step!r} ; étapes : {sorted(STEPS)}")
    persona = get_persona(request.persona_id)
    g = request.group
    try:
        batch.check_step(request.step)
        group = lab_groups.resolve(g.kind, g.tickers, g.ref, g.limit)
        return batch.run_batch(request.step, persona, request.persona_id, group, request.inputs, request.options)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False)) from exc
    except (OptionError, PipelineInputError, lab_groups.GroupError, batch.BatchError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
