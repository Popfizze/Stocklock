"""Read contract of the gold table `score_par_titre`: absent, unreadable, or one row per title."""

from __future__ import annotations

import json

import pytest

from app.config import get_settings
from app.services import score_table

WEIGHTS = {"rentabilite": 0.25, "solidite": 0.20, "croissance": 0.15, "valorisation": 0.15,
           "momentum_risque": 0.15, "evenements": 0.10}


def score_row(symbol: str, score: float, partiel: bool = False) -> dict:
    """A row whose sub-scores all equal `score` (contributions sum to it); `evenements` missing if partiel."""
    missing = {"evenements"} if partiel else set()
    kept = sum(w for k, w in WEIGHTS.items() if k not in missing)
    subs = []
    for sub_id, weight in WEIGHTS.items():
        effective = 0.0 if sub_id in missing else weight / kept
        sub_score = None if sub_id in missing else score
        subs.append({"id": sub_id, "label": sub_id, "weight": weight, "effective_weight": effective,
                     "score": sub_score, "contribution": (sub_score or 0) * effective,
                     "indicators": [{"id": f"{sub_id}_x", "label": "Indicateur", "value": 0.12, "unit": "ratio",
                                     "better": "higher", "rank": sub_score}]})
    return {"symbol": symbol, "date": "2026-11-13", "score": score, "partiel": partiel,
            "comparison_set": "Technologie, 48 titres", "sub_scores": subs,
            "sources": [{"id": "sec_edgar", "title": "SEC EDGAR", "url": "https://www.sec.gov/", "as_of": "2026-11-10"}]}


def install_table(monkeypatch, rows: list[dict] | None = None, *, raw: bytes | None = None,
                  error: Exception | None = None) -> list[tuple[str, str]]:
    """Serve a score table from a fake bucket; `rows=None` with no raw/error means no object."""
    monkeypatch.setenv("DATA_BUCKET", "stocklock-data-test")
    get_settings.cache_clear()
    score_table.reset()
    reads: list[tuple[str, str]] = []

    def fake_fetch(bucket: str, key: str) -> bytes:
        reads.append((bucket, key))
        if error is not None:
            raise error
        if raw is not None:
            return raw
        if rows is None:
            raise score_table._Absent
        return json.dumps({"schema_version": 1, "generated_at": "2026-11-15T06:00:00Z",
                           "method": "6 sous-scores pondérés", "rows": rows}).encode()

    monkeypatch.setattr(score_table, "_fetch_object", fake_fetch)
    return reads


def test_without_a_bucket_the_table_is_absent_and_says_so(client):
    body = client.get("/api/scores").json()
    assert body["status"] == "absent"
    assert "DATA_BUCKET" in body["message"]
    one = client.get("/api/scores/AAPL").json()
    assert one == {"status": "absent", "message": body["message"], "generated_at": None, "score": None}


def test_missing_object_means_the_pipeline_has_not_run(monkeypatch, client):
    reads = install_table(monkeypatch, None)
    body = client.get("/api/scores/AAPL").json()
    assert body["status"] == "absent"
    assert body["score"] is None
    assert "pipeline de score" in body["message"]
    assert reads == [("stocklock-data-test", "gold/score_par_titre/latest.json")]


def test_a_scored_title_returns_its_row(monkeypatch, client):
    install_table(monkeypatch, [score_row("AAPL", 72.4), score_row("RY.TO", 60.0, partiel=True)])
    body = client.get("/api/scores/aapl").json()
    assert body["status"] == "available"
    assert body["generated_at"].startswith("2026-11-15T06:00:00")
    row = body["score"]
    assert row["symbol"] == "AAPL" and row["score"] == 72.4 and row["partiel"] is False
    assert [s["id"] for s in row["sub_scores"]] == list(WEIGHTS)
    assert sum(s["contribution"] for s in row["sub_scores"]) == pytest.approx(72.4)
    partial = client.get("/api/scores/RY.TO").json()["score"]
    events = next(s for s in partial["sub_scores"] if s["id"] == "evenements")
    assert partial["partiel"] is True and events["score"] is None and events["effective_weight"] == 0


def test_a_title_outside_the_table_is_not_scored(monkeypatch, client):
    install_table(monkeypatch, [score_row("AAPL", 72.4)])
    body = client.get("/api/scores/NVDA").json()
    assert body["status"] == "not_scored" and body["score"] is None
    assert "pas encore de score" in body["message"]


def test_invalid_rows_are_rejected_not_served(monkeypatch, client):
    bad = {**score_row("NVDA", 50.0), "score": 140}
    install_table(monkeypatch, [score_row("AAPL", 72.4), bad])
    status = client.get("/api/scores").json()
    assert status["status"] == "available" and status["count"] == 1 and status["rejected"] == 1
    assert client.get("/api/scores/NVDA").json()["status"] == "not_scored"


@pytest.mark.parametrize("raw", [b"not json", b'{"schema_version": 2, "generated_at": "2026-11-15", "rows": []}'])
def test_an_unreadable_table_is_unavailable(monkeypatch, client, raw):
    install_table(monkeypatch, raw=raw)
    body = client.get("/api/scores/AAPL").json()
    assert body["status"] == "unavailable" and body["score"] is None


def test_a_bucket_error_is_unavailable(monkeypatch, client):
    install_table(monkeypatch, error=RuntimeError("AccessDenied"))
    body = client.get("/api/scores").json()
    assert body["status"] == "unavailable"
    assert "RuntimeError" in body["message"]


def test_the_table_is_read_once_per_ten_minutes(monkeypatch, client):
    reads = install_table(monkeypatch, [score_row("AAPL", 72.4)])
    client.get("/api/scores/AAPL")
    client.get("/api/scores/NVDA")
    client.get("/api/scores")
    assert len(reads) == 1
