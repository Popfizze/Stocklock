"""StockLock FastAPI app: personas, the four analysis routes and the Lab (pipeline catalog and runs).

Run from backend/: uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from app.accounts_api import router as accounts_router
from app.config import get_settings
from app.market_api import router as market_router
from app.personas import get_persona, list_public
from app.pipeline import batch
from app.pipeline.core import OptionError, PipelineInputError
from app.pipeline.registry import STEPS, catalog, execute
from app.registry import lab as stored_runs
from app.profile_api import router as profile_router
from app.runs_api import router as runs_router
from app.score_pipeline_api import router as score_pipeline_router
from app.scoring_api import router as scoring_router
from app.schemas import (AnalysisResponse, BiasRequest, ExplainMoveRequest, LabBatchRequest, LabRunRequest,
                         Persona, ScoreRequest, StockBiasRequest, StockMovesRequest, TaxRequest)
from app.services import lab_groups, moves_view

settings = get_settings()
app = FastAPI(title="StockLock API", version="0.1.0",
              description="Assistant d'investissement agentique et auto-explicatif (simulation, données publiques).")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])
app.include_router(accounts_router)
app.include_router(scoring_router)  # POST /api/scores/reweight before the market's /api/scores/{ticker}
app.include_router(market_router)
app.include_router(profile_router)
app.include_router(score_pipeline_router)
app.include_router(runs_router)


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
    contracts of /api/explain-move stay unchanged."""
    persona = get_persona(request.persona_id)
    start, end = moves_view.window_for(request.period)
    try:
        result, response = execute("explain_move", persona,
                                   {"ticker": request.ticker, "start": start, "end": end},
                                   {"benchmark.method": "market_model"})
    except PipelineInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if result.failed:
        failed = next(s for s in result.stages if s["status"] == "error")
        raise HTTPException(status_code=503, detail=f"Étape « {failed['name']} » indisponible.")
    return moves_view.build(result, response, request.period)


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
    ctx = result.context
    return {
        "analysis": response.model_dump(),
        "signals": ctx.state.get("signals", []),
        "profile_flags": ctx.report.profile_flags,
        "history": ctx.state.get("market_history"),
        "hype": ctx.state.get("hype"),
        "simulation": ctx.state.get("simulation_data"),
        "warnings": [w for stage in result.stages for w in stage["warnings"]],
    }


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
