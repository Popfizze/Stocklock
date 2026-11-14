"""StockLock FastAPI app: personas, the four analysis routes and the Lab (pipeline catalog and runs).

Run from backend/: uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError

from app.accounts_api import router as accounts_router
from app.config import get_settings
from app.personas import get_persona, list_public
from app.pipeline.core import OptionError, PipelineInputError
from app.pipeline.registry import STEPS, catalog, execute
from app.schemas import (AnalysisResponse, BiasRequest, ExplainMoveRequest, LabRunRequest, Persona,
                         ScoreRequest, TaxRequest)
from app.services import stocks

settings = get_settings()
app = FastAPI(title="StockLock API", version="0.1.0",
              description="Assistant d'investissement agentique et auto-explicatif (simulation, données publiques).")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])
app.include_router(accounts_router)


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


@app.post("/api/tax", response_model=AnalysisResponse)
def tax(request: TaxRequest) -> AnalysisResponse:
    return _run_business("tax", request)


@app.post("/api/bias", response_model=AnalysisResponse)
def bias(request: BiasRequest) -> AnalysisResponse:
    return _run_business("bias", request)


# --- Lab ----------------------------------------------------------------------------------------

@app.get("/api/lab/pipelines")
def lab_pipelines() -> dict[str, Any]:
    return catalog()


@app.post("/api/lab/run")
def lab_run(request: LabRunRequest) -> dict[str, Any]:
    if request.step not in STEPS:
        raise HTTPException(status_code=422, detail=f"étape inconnue {request.step!r} ; étapes : {sorted(STEPS)}")
    persona = get_persona(request.persona_id)
    try:
        result, response = execute(request.step, persona, request.inputs, request.options)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.errors(include_url=False, include_context=False)) from exc
    except (OptionError, PipelineInputError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return result.to_dict(response.model_dump(mode="json"))


# --- Tableau de bord ----------------------------------------------------------------------------

@app.get("/api/stocks")
def stock_list() -> list[dict[str, Any]]:
    return stocks.list_stocks()


@app.get("/api/stocks/{ticker}")
def stock_detail(ticker: str, range_: stocks.Range = Query("1M", alias="range")) -> dict[str, Any]:
    symbol = ticker.strip().upper()
    if not stocks.known(symbol):
        raise HTTPException(status_code=404, detail=f"titre inconnu {ticker!r}")
    return stocks.stock_detail(symbol, range_)
