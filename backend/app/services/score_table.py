"""Read contract of the gold table `score_par_titre`: one persona-independent score per title.

The table is produced by the score pipeline (sources -> bronze -> silver -> gold, run on AWS; not part
of the API). The API only reads it, from the data bucket (`DATA_BUCKET`) at `SCORE_TABLE_KEY`
(default `gold/score_par_titre/latest.json`), and never makes a score up: when the table is absent or
a title is not in it, the answer says so.

File format (JSON, UTF-8):
    {"schema_version": 1, "generated_at": "2026-11-15T06:00:00Z", "method": "...",
     "rows": [ScoreRow, ...]}

The score of a row is the sum of its sub-scores' contributions. The six sub-scores and their nominal
weights: rentabilite 25 %, solidite 20 %, croissance 15 %, valorisation 15 %, momentum_risque 15 %,
evenements 10 %. Each indicator is capped at the 5th/95th percentile of the comparison set, then
ranked 0-100 (valuation within the sector); a sub-score is the mean of its ranks. A missing sub-score
(`score` null) has its weight redistributed over the others (`effective_weight`) and the row is
flagged `partiel`.

Each pipeline run merges its rows into the table (the other titles keep their latest row), so rows can
come from different runs: `run_id` and `date` say which run computed a row and on which day's data.
"""

from __future__ import annotations

import json
import threading
import time
import datetime as dt
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from app.config import get_settings

SubScoreId = Literal["rentabilite", "solidite", "croissance", "valorisation", "momentum_risque", "evenements"]
TTL_S = 10 * 60


class ScoreIndicator(BaseModel):
    id: str = Field(description="roe, net_margin, debt_to_equity, interest_coverage, revenue_cagr_3y, ...")
    label: str
    value: float | None = Field(description="Raw value before capping; null when the data is missing")
    unit: Literal["ratio", "multiple", "number"] = Field(
        description="ratio: 0.31 is 31 %; multiple: 12.5 is 12,5x; number: shown as is")
    better: Literal["higher", "lower"]
    rank: float | None = Field(default=None, ge=0, le=100, description="Rank 0-100 in the comparison set")
    note: str | None = None


class SubScore(BaseModel):
    id: SubScoreId
    label: str
    weight: float = Field(ge=0, le=1, description="Nominal weight, e.g. 0.25")
    effective_weight: float = Field(ge=0, le=1, description="Weight after redistribution; 0 when missing")
    score: float | None = Field(ge=0, le=100, description="Mean of the indicators' ranks; null when missing")
    contribution: float = Field(ge=0, le=100, description="score x effective_weight, in points of the score")
    indicators: list[ScoreIndicator] = []


class ScoreSource(BaseModel):
    id: str
    title: str
    url: str | None = None
    as_of: str | None = None


class ScoreRow(BaseModel):
    symbol: str = Field(description="Yahoo Finance symbol, as in the universe: AAPL, RY.TO")
    date: dt.date = Field(description="Date of the data the score is computed on")
    score: float = Field(ge=0, le=100)
    partiel: bool = Field(description="At least one sub-score is missing and its weight was redistributed")
    comparison_set: str | None = Field(default=None, description="e.g. « Technologie, 48 titres »")
    sub_scores: list[SubScore]
    sources: list[ScoreSource] = []
    run_id: str | None = Field(default=None, description="Pipeline run that computed this row (the table merges "
                                                          "the rows of several runs, each with its own date)")


class ScoreTable(BaseModel):
    schema_version: Literal[1]
    generated_at: dt.datetime
    method: str | None = None
    rows: list[dict[str, Any]]


# --- Reading -----------------------------------------------------------------------------------------

class _Absent(Exception):
    pass


def _fetch_object(bucket: str, key: str) -> bytes:
    """The table's bytes; _Absent when the object does not exist (patched in tests)."""
    import boto3
    from botocore.exceptions import ClientError

    try:
        response = boto3.client("s3").get_object(Bucket=bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"NoSuchKey", "404", "NoSuchBucket"}:
            raise _Absent from exc
        raise
    return response["Body"].read()


_lock = threading.Lock()
_memo: dict[str, Any] = {}


def _read() -> dict[str, Any]:
    settings = get_settings()
    key = settings.score_table_key
    base = {"key": key, "generated_at": None, "method": None, "rows": {}, "rejected": 0}
    if not settings.data_bucket:
        return {**base, "status": "absent",
                "message": "Aucun bucket de données n'est configuré (DATA_BUCKET) : la table des scores n'est pas lue."}
    try:
        raw = _fetch_object(settings.data_bucket, key)
    except _Absent:
        return {**base, "status": "absent",
                "message": "La table des scores n'existe pas encore : le pipeline de score n'a pas encore été exécuté."}
    except Exception as exc:  # botocore errors, network
        return {**base, "status": "unavailable",
                "message": f"Lecture de la table des scores impossible ({type(exc).__name__})."}
    try:
        table = ScoreTable.model_validate(json.loads(raw))
    except (ValueError, ValidationError) as exc:
        return {**base, "status": "unavailable",
                "message": f"Table des scores illisible ({type(exc).__name__})."}
    rows: dict[str, ScoreRow] = {}
    rejected = 0
    for item in table.rows:
        try:
            row = ScoreRow.model_validate(item)
        except ValidationError:
            rejected += 1
            continue
        rows[row.symbol.upper()] = row
    return {**base, "status": "available", "message": None, "generated_at": table.generated_at.isoformat(),
            "method": table.method, "rows": rows, "rejected": rejected}


def load() -> dict[str, Any]:
    """The table's state, re-read at most every 10 minutes."""
    with _lock:
        if not _memo or time.time() - _memo["loaded_at"] > TTL_S:
            _memo.clear()
            _memo.update(_read(), loaded_at=time.time())
        return _memo


def reset() -> None:
    with _lock:
        _memo.clear()


def status() -> dict[str, Any]:
    t = load()
    return {"status": t["status"], "message": t["message"], "key": t["key"], "generated_at": t["generated_at"],
            "method": t["method"], "count": len(t["rows"]), "rejected": t["rejected"]}


def for_symbol(symbol: str) -> dict[str, Any]:
    """{"status": available | not_scored | absent | unavailable, "message", "generated_at", "score"}."""
    t = load()
    out = {"status": t["status"], "message": t["message"], "generated_at": t["generated_at"], "score": None}
    if t["status"] != "available":
        return out
    row = t["rows"].get(symbol.upper())
    if row is None:
        return {**out, "status": "not_scored",
                "message": "Ce titre n'a pas encore de score : il ne figure pas dans la dernière table calculée."}
    return {**out, "score": row.model_dump(mode="json")}


def summaries() -> dict[str, tuple[float, bool]]:
    """(score, partiel) by symbol; empty when the table is not available."""
    t = load()
    return {symbol: (row.score, row.partiel) for symbol, row in t["rows"].items()}


def best(limit: int) -> list[ScoreRow]:
    return sorted(load()["rows"].values(), key=lambda row: (-row.score, row.symbol))[:limit]
