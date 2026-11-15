"""Routes of the run registry: every execution of every pipeline and everything it generated.

    GET /api/runs?pipeline=&persona=&status=&trigger=&since=&until=&limit=&cursor=   newest first, paginated
    GET /api/runs/{run_id}                                             one run, stages summarized
    GET /api/runs/{run_id}/stages/{stage_id}                           one stage in full
    GET /api/runs/{run_id}/artifacts                                   datasets, decisions, files
    GET /api/runs/{run_id}/artifacts/{artifact_id}?offset=&limit=      a page of one of them

Labo runs are stored by POST /api/lab/run and /api/lab/run-batch (`app.registry.lab`); score pipeline
runs are read from the records the pipeline writes.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query

from app.registry import artifacts, views

router = APIRouter(prefix="/api/runs", tags=["exécutions"])

Pipeline = Literal["lab", "lab.score", "lab.explain_move", "lab.tax", "lab.bias", "score_pipeline"]
Status = Literal["running", "succeeded", "warning", "failed"]
Trigger = Literal["labo", "api", "schedule", "local"]


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{what} introuvable")


def _unavailable(exc: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail=f"Registre des exécutions illisible ({type(exc).__name__}).")


@router.get("")
def list_runs(pipeline: Pipeline | None = None, persona: str | None = Query(None, max_length=40),
              status: Status | None = None, trigger: Trigger | None = None,
              limit: int = Query(20, ge=1, le=100), cursor: str | None = Query(None, max_length=120),
              since: str | None = Query(None, max_length=40, description="Started on or after (ISO date or date-time)"),
              until: str | None = Query(None, max_length=40, description="Started on or before (ISO date) / before (date-time)")
              ) -> dict[str, Any]:
    try:
        return views.list_runs(pipeline, persona, status, trigger, limit, cursor, since, until)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise _unavailable(exc) from exc


@router.get("/{run_id}")
def get_run(run_id: str) -> dict[str, Any]:
    try:
        return views.get_run(run_id)
    except views.RunNotFound as exc:
        raise _not_found(f"Exécution {run_id!r}") from exc
    except Exception as exc:  # bucket unreachable, unreadable record
        raise _unavailable(exc) from exc


@router.get("/{run_id}/stages/{stage_id}")
def get_stage(run_id: str, stage_id: str) -> dict[str, Any]:
    try:
        return views.get_stage(run_id, stage_id)
    except views.RunNotFound as exc:
        raise _not_found(f"Étape {stage_id!r} de l'exécution {run_id!r}") from exc
    except Exception as exc:
        raise _unavailable(exc) from exc


@router.get("/{run_id}/artifacts")
def list_artifacts(run_id: str) -> dict[str, Any]:
    try:
        return artifacts.list_artifacts(run_id)
    except views.RunNotFound as exc:
        raise _not_found(f"Exécution {run_id!r}") from exc
    except Exception as exc:
        raise _unavailable(exc) from exc


@router.get("/{run_id}/artifacts/{artifact_id}")
def preview_artifact(run_id: str, artifact_id: str, offset: int = Query(0, ge=0),
                     limit: int = Query(100, ge=1, le=artifacts.MAX_LIMIT)) -> dict[str, Any]:
    try:
        return artifacts.preview(run_id, artifact_id, offset, limit)
    except views.RunNotFound as exc:
        raise _not_found(f"Exécution {run_id!r}") from exc
    except artifacts.ArtifactNotFound as exc:
        raise _not_found(f"Élément {artifact_id!r} de l'exécution {run_id!r}") from exc
    except Exception as exc:
        raise _unavailable(exc) from exc
