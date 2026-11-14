"""Run parameters, run context, stage records and the run record of the score pipeline.

Layout under `score/` (see `store.py`):
    runs/<run_id>.json                    the run record (written at start, then at the end)
    runs/<run_id>/stages/<stage>.json     one record per stage (written when it starts and ends)
    <layer>/<dataset>/<date>/<run_id>/..  the datasets
"""

from __future__ import annotations

import math
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

import pandas as pd
from pydantic import BaseModel, Field

from app.score_pipeline import store as st

SCHEMA_VERSION = 1
TIMEZONE = ZoneInfo("America/Toronto")
SAMPLE_ROWS = 8
GOLD_LATEST_KEY = "gold/score_par_titre/latest.json"


@dataclass(frozen=True)
class StageDef:
    id: str
    layer: str      # bronze | silver | gold
    label: str
    datasets: tuple[str, ...]
    description: str


STAGES: tuple[StageDef, ...] = (
    StageDef("bronze_titres", "bronze", "Liste des titres", ("titres_bruts",),
             "Copie brute du jour des répertoires SEC et TMX, et des filtres Yahoo Finance (popularité)."),
    StageDef("silver_univers", "silver", "Univers", ("univers",),
             "Fusion SEC + TMX, doublons et titres inactifs retirés, sélection des titres notés, secteur."),
    StageDef("bronze_releves", "bronze", "Relevés financiers", ("releves_bruts",),
             "SEC EDGAR companyfacts (États-Unis), Yahoo Finance (Canada et repli)."),
    StageDef("bronze_cours", "bronze", "Cours quotidiens", ("cours_bruts",),
             "Yahoo Finance par lots sur 2 ans, Stooq en repli."),
    StageDef("bronze_articles", "bronze", "Articles", ("articles_bruts",),
             "GDELT (par lots de noms) et Federal Register, actualités Yahoo Finance en repli."),
    StageDef("silver_releves", "silver", "Relevés normalisés", ("releves_normalises",),
             "Une ligne par trimestre (et par exercice), datée à sa publication."),
    StageDef("silver_cours", "silver", "Cours propres", ("cours_propres",),
             "Calendriers alignés, clôture ajustée des fractionnements et dividendes, volume."),
    StageDef("silver_evenements", "silver", "Événements structurés", ("evenements_structures",),
             "Claude Haiku (Amazon Bedrock) lit les articles par lots et en tire des événements notés."),
    StageDef("gold", "gold", "Score par titre", ("indicateurs_bruts", "rangs", "score_par_titre"),
             "12 indicateurs bruts, rangs 0-100 plafonnés aux 5e/95e centiles, 6 sous-scores pondérés."),
)
STAGE_IDS = tuple(s.id for s in STAGES)
BY_ID = {s.id: s for s in STAGES}


class RunParams(BaseModel):
    """Parameters of a run (body of POST /api/pipeline/score/runs); all optional."""

    max_titles: int = Field(200, ge=5, le=600, description="Number of titles scored (most valuable first)")
    ca_share: float = Field(0.3, ge=0, le=1, description="Share of Canadian (TSX) stocks among the stocks")
    etf_share: float = Field(0.1, ge=0, le=0.5, description="Share of ETFs among the titles")
    news_per_title: int = Field(6, ge=0, le=20, description="Most articles kept per title")
    max_llm_articles: int = Field(1200, ge=0, le=5000, description="Most articles sent to Bedrock in a run")


@dataclass
class RunContext:
    run_id: str
    date: str                 # YYYY-MM-DD, America/Toronto
    started_at: str           # ISO 8601 UTC
    trigger: str              # api | schedule | local
    params: RunParams

    def key(self, layer: str, dataset: str, name: str) -> str:
        return f"{layer}/{dataset}/{self.date}/{self.run_id}/{name}"

    def to_dict(self) -> dict[str, Any]:
        return {"run_id": self.run_id, "date": self.date, "started_at": self.started_at,
                "trigger": self.trigger, "params": self.params.model_dump()}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RunContext:
        return cls(data["run_id"], data["date"], data["started_at"], data.get("trigger", "api"),
                   RunParams.model_validate(data.get("params") or {}))


def new_run_id() -> str:
    """Also the Step Functions execution name: 20261115T060000Z-1a2b3c."""
    return time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()) + "-" + uuid.uuid4().hex[:6]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def new_context(run_id: str, trigger: str, params: dict[str, Any] | None) -> RunContext:
    return RunContext(run_id, datetime.now(TIMEZONE).date().isoformat(), now_iso(), trigger,
                      RunParams.model_validate(params or {}))


def run_key(run_id: str) -> str:
    return f"runs/{run_id}.json"


def stage_key(run_id: str, stage: str) -> str:
    return f"runs/{run_id}/stages/{stage}.json"


# --- Samples -------------------------------------------------------------------------------------------

def _cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else round(value, 6)
    if isinstance(value, (int, str, bool)):
        return value
    if hasattr(value, "item"):  # numpy scalars
        return _cell(value.item())
    return str(value)


def sample(dataset: str, frame: pd.DataFrame | list[dict[str, Any]], rows: int = SAMPLE_ROWS) -> dict[str, Any]:
    """{"dataset", "columns", "rows", "total_rows"}: the first rows of a dataset, JSON-safe."""
    if not isinstance(frame, pd.DataFrame):
        frame = pd.DataFrame(frame)
    head = frame.head(rows)
    return {"dataset": dataset, "columns": [str(c) for c in head.columns],
            "rows": [[_cell(v) for v in row] for row in head.itertuples(index=False, name=None)],
            "total_rows": int(len(frame))}


# --- Stage records ---------------------------------------------------------------------------------------

@dataclass
class StageRecorder:
    """What a stage did; written to `runs/<run_id>/stages/<stage>.json` when it starts and ends."""

    store: st.Store
    ctx: RunContext
    stage: str
    started: float = field(default_factory=time.monotonic)
    started_at: str = field(default_factory=now_iso)
    rows: dict[str, int] = field(default_factory=dict)
    decisions: list[dict[str, Any]] = field(default_factory=list)
    samples: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    outputs: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    sources: list[dict[str, str]] = field(default_factory=list)

    def decide(self, kind: str, message: str, count: int | None = None) -> None:
        """kind: source | fallback | filter | missing | parameter | info."""
        self.decisions.append({"kind": kind, "message": message, "count": count})

    def source(self, source_id: str, title: str, url: str) -> None:
        if all(s["id"] != source_id for s in self.sources):
            self.sources.append({"id": source_id, "title": title, "url": url})

    def output(self, key: str) -> str:
        self.outputs.append(st.ROOT_PREFIX + key)
        return key

    def add_sample(self, dataset: str, frame: pd.DataFrame | list[dict[str, Any]]) -> None:
        self.samples.append(sample(dataset, frame))

    def record(self, status: str, error: str | None = None) -> dict[str, Any]:
        finished = status != "running"
        definition = BY_ID.get(self.stage)
        return {
            "id": self.stage, "layer": definition.layer if definition else None,
            "label": definition.label if definition else self.stage,
            "status": status, "started_at": self.started_at,
            "finished_at": now_iso() if finished else None,
            "duration_s": round(time.monotonic() - self.started, 1) if finished else None,
            "rows": self.rows, "decisions": self.decisions, "samples": self.samples,
            "warnings": self.warnings, "outputs": self.outputs, "metrics": self.metrics,
            "sources": self.sources, "error": error,
        }

    def write(self, status: str, error: str | None = None) -> dict[str, Any]:
        rec = self.record(status, error)
        st.put_json(self.store, stage_key(self.ctx.run_id, self.stage), rec)
        return rec


# --- Run record --------------------------------------------------------------------------------------

def pending_stage(definition: StageDef) -> dict[str, Any]:
    return {"id": definition.id, "layer": definition.layer, "label": definition.label, "status": "pending",
            "started_at": None, "finished_at": None, "duration_s": None, "rows": {}, "decisions": [],
            "samples": [], "warnings": [], "outputs": [], "metrics": {}, "sources": [], "error": None}


def read_stages(store: st.Store, run_id: str) -> list[dict[str, Any]]:
    """The run's stages in pipeline order; `pending` for those not started."""
    out = []
    for definition in STAGES:
        try:
            out.append(st.get_json(store, stage_key(run_id, definition.id)))
        except st.NotFound:
            out.append(pending_stage(definition))
    return out


def start_record(ctx: RunContext) -> dict[str, Any]:
    return {"schema_version": SCHEMA_VERSION, **ctx.to_dict(), "status": "running", "finished_at": None,
            "duration_s": None, "stages": [pending_stage(d) for d in STAGES], "summary": None, "error": None}


def _duration(started_at: str) -> float:
    start = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
    return round((datetime.now(timezone.utc) - start).total_seconds(), 1)


def summary_of(stages: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {s["id"]: s for s in stages}
    gold = by_id.get("gold", {}).get("metrics", {})
    events = by_id.get("silver_evenements", {}).get("metrics", {})
    return {
        "titles_selected": by_id.get("silver_univers", {}).get("rows", {}).get("univers"),
        "titles_scored": gold.get("titles_scored"),
        "partial": gold.get("partial"),
        "table_key": gold.get("table_key"),
        "bedrock_calls": events.get("bedrock_calls"),
        "bedrock_input_tokens": events.get("input_tokens"),
        "bedrock_output_tokens": events.get("output_tokens"),
        "top": gold.get("top"),
    }


def finish_record(store: st.Store, ctx: RunContext, status: str,
                  error: dict[str, Any] | None = None) -> dict[str, Any]:
    stages = read_stages(store, ctx.run_id)
    if status == "failed":
        for s in stages:
            if s["status"] == "running":
                s["status"] = "failed"
                s["error"] = s.get("error") or (error or {}).get("message")
    record = {"schema_version": SCHEMA_VERSION, **ctx.to_dict(), "status": status, "finished_at": now_iso(),
              "duration_s": _duration(ctx.started_at), "stages": stages, "summary": summary_of(stages),
              "error": error}
    st.put_json(store, run_key(ctx.run_id), record)
    return record
