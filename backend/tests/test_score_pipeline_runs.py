"""Score pipeline: the gold stage on synthetic silver data, stage records, and the Labo API routes."""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app import score_pipeline_api
from app.config import get_settings
from app.score_pipeline import gold, stages
from app.score_pipeline import store as st
from app.score_pipeline.runs import GOLD_LATEST_KEY, STAGE_IDS, RunContext, StageRecorder, new_context
from app.services.score_table import ScoreRow, ScoreTable

TECH = ["T1", "T2", "T3", "T4", "T5", "LOSS"]


def _quarters(symbol: str, base: float, growth: float, eps_sign: float = 1.0) -> list[dict]:
    rows = []
    end = date(2022, 12, 31)
    for i in range(16):
        q_end = end + timedelta(days=91 * i)
        rev = base * (1 + growth) ** (i / 4)
        rows.append({"symbol": symbol, "source": "SEC EDGAR", "period_type": "Q", "period_start": None,
                     "period_end": q_end.isoformat(), "published": (q_end + timedelta(days=35)).isoformat(),
                     "revenue": rev, "net_income": rev * 0.2 * eps_sign, "eps": rev / 100 * eps_sign,
                     "equity": base * 4, "total_debt": base * (1 + i % 3), "operating_income": rev * 0.3,
                     "interest_expense": base * 0.02, "currency": "USD"})
    return rows


def _prices(symbol: str, drift: float, n: int = 320) -> list[dict]:
    days = pd.bdate_range(end="2026-11-13", periods=n)
    rng = np.random.default_rng(abs(hash(symbol)) % 1000)
    closes = 100 * np.cumprod(1 + drift + rng.normal(0, 0.01, n))
    return [{"date": d.date().isoformat(), "symbol": symbol, "market": "US", "adj_close": c, "volume": 1000,
             "filled": False} for d, c in zip(days, closes, strict=True)]


def build_silver(store: st.Store, ctx: RunContext) -> None:
    univ = [{"symbol": s, "name": s, "listing_name": s, "exchange": "NYSE", "country": "US", "currency": "USD",
             "financial_currency": "USD", "asset_type": "action", "sector": "Technology", "industry": None,
             "cik": i + 1, "market_cap": 1e10 * (i + 1), "avg_volume_3m": 1e6, "shares_outstanding": 1e8,
             "price": 100, "bucket": "us_actions", "popularity_rank": i + 1} for i, s in enumerate(TECH)]
    univ.append({**univ[0], "symbol": "BANK.TO", "country": "CA", "currency": "CAD", "financial_currency": "CAD",
                 "sector": "Financial Services", "cik": None, "bucket": "ca_actions"})
    univ.append({**univ[0], "symbol": "ETF", "asset_type": "FNB", "sector": "FNB", "cik": None, "bucket": "us_fnb"})
    st.put_csv(store, ctx.key("silver", "univers", "univers.csv"), pd.DataFrame(univ))
    rel = []
    for i, s in enumerate(TECH):
        rel += _quarters(s, 1000 * (i + 1), 0.05 * (i + 1), -1.0 if s == "LOSS" else 1.0)
    rel += [dict(r, currency="CAD") for r in _quarters("BANK.TO", 5000, 0.03)]
    st.put_csv(store, ctx.key("silver", "releves_normalises", "releves_normalises.csv"), pd.DataFrame(rel))
    prices = [p for i, s in enumerate([*TECH, "BANK.TO", "ETF"]) for p in _prices(s, 0.0002 * i)]
    prices += [dict(p, adj_close=1.40) for p in _prices("CAD=X", 0)]
    st.put_csv(store, ctx.key("silver", "cours_propres", "cours_propres.csv.gz"), pd.DataFrame(prices))
    events = [{"symbol": "T1", "date": "2026-11-10", "event_type": "resultats", "impact": 0.8, "relevance": 1.0,
               "excerpt": "beats", "rationale": "", "source": "gdelt", "title": "t", "url": "u", "article_id": "T1#0"}]
    st.put_csv(store, ctx.key("silver", "evenements_structures", "evenements_structures.csv"), pd.DataFrame(events))
    coverage = {s: "ok" for s in TECH}
    coverage["BANK.TO"] = "failed"
    st.put_json(store, ctx.key("silver", "evenements_structures", "couverture.json"), coverage)


@pytest.fixture
def ctx_store():
    store = st.MemoryStore()
    ctx = new_context("run-gold", "test", {"max_titles": 8})
    ctx.date = "2026-11-14"
    build_silver(store, ctx)
    return ctx, store


def test_gold_writes_a_valid_table_with_redistributed_weights(ctx_store):
    ctx, store = ctx_store
    rec = StageRecorder(store, ctx, "gold")
    gold.run(ctx, store, rec, deadline=float("inf"))
    table = st.get_json(store, GOLD_LATEST_KEY)
    ScoreTable.model_validate(table)
    rows = {r["symbol"]: ScoreRow.model_validate(r) for r in table["rows"]}
    assert set(rows) == {*TECH, "BANK.TO", "ETF"}
    assert table == st.get_json(store, ctx.key("gold", "score_par_titre", "score_par_titre.json"))
    for row in rows.values():
        assert row.score == pytest.approx(sum(s.contribution for s in row.sub_scores), abs=0.05)
        assert sum(s.effective_weight for s in row.sub_scores) == pytest.approx(1.0, abs=1e-3)
    etf = rows["ETF"]
    assert etf.partiel and [s.id for s in etf.sub_scores if s.score is not None] == ["momentum_risque"]
    t1 = rows["T1"]
    assert not t1.partiel and t1.comparison_set == "Technology, 6 titres"
    events = next(s for s in t1.sub_scores if s.id == "evenements")
    assert events.score == pytest.approx(90.0)  # 50 + 50 × 0.8
    t2_events = next(s for s in rows["T2"].sub_scores if s.id == "evenements")
    assert t2_events.score == 50.0 and t2_events.indicators[0].note.startswith("Aucun événement")
    bank = rows["BANK.TO"]
    assert bank.partiel and "trop petit" in bank.comparison_set
    loss_pe = next(i for s in rows["LOSS"].sub_scores for i in s.indicators if i.id == "pe")
    assert loss_pe.rank == 0.0 and "négatif" in loss_pe.note
    assert rec.metrics["titles_scored"] == 8 and rec.metrics["partial"] == 2
    growth = next(i for s in rows["T5"].sub_scores for i in s.indicators if i.id == "revenue_cagr_3y")
    assert growth.value == pytest.approx(0.25, abs=0.02)


def test_handle_runs_init_stage_and_finalize_records(ctx_store, monkeypatch):
    _ctx, store = ctx_store
    run = stages.handle({"stage": "init", "execution_name": "exec-1",
                         "input": {"trigger": "api", "params": {"max_titles": 8}}}, store)["run"]
    assert run["run_id"] == "exec-1" and run["params"]["max_titles"] == 8
    assert st.get_json(store, "runs/exec-1.json")["status"] == "running"

    def boom(ctx, store, rec, deadline):
        rec.decide("source", "essai")
        raise RuntimeError("source en panne")

    monkeypatch.setitem(stages.RUNNERS, "bronze_titres", boom)
    with pytest.raises(RuntimeError):
        stages.handle({"stage": "bronze_titres", "run": run}, store, remaining_ms=60_000)
    stage = st.get_json(store, "runs/exec-1/stages/bronze_titres.json")
    assert stage["status"] == "failed" and "source en panne" in stage["error"]
    cause = '{"errorType": "RuntimeError", "errorMessage": "source en panne"}'
    stages.handle({"stage": "fail", "run": run, "error": {"Error": "RuntimeError", "Cause": cause}}, store)
    record = st.get_json(store, "runs/exec-1.json")
    assert record["status"] == "failed" and record["error"]["message"] == "RuntimeError: source en panne"
    assert [s["id"] for s in record["stages"]] == list(STAGE_IDS)
    assert record["stages"][1]["status"] == "pending"


# --- API -----------------------------------------------------------------------------------------------

class FakeSfn:
    def __init__(self) -> None:
        self.started: list[dict] = []
        self.executions: list[dict] = []

    def list_executions(self, stateMachineArn, statusFilter=None, maxResults=20):
        items = [e for e in self.executions if statusFilter is None or e["status"] == statusFilter]
        return {"executions": items[:maxResults]}

    def start_execution(self, stateMachineArn, name, input):
        self.started.append({"name": name, "input": input})
        self.executions.insert(0, {"name": name, "status": "RUNNING", "startDate": "2026-11-14T22:00:00Z"})
        return {"executionArn": f"{stateMachineArn}:{name}"}

    def describe_execution(self, executionArn):
        name = executionArn.rsplit(":", 1)[1]
        for e in self.executions:
            if e["name"] == name:
                return e
        raise LookupError("ExecutionDoesNotExist")


@pytest.fixture
def api(monkeypatch):
    monkeypatch.setenv("DATA_BUCKET", "stocklock-data-test")
    monkeypatch.setenv("SCORE_PIPELINE_ARN", "arn:aws:states:us-east-1:1:stateMachine:stocklock-score-pipeline")
    get_settings.cache_clear()
    sfn, store = FakeSfn(), st.MemoryStore()
    monkeypatch.setattr(score_pipeline_api, "_sfn", lambda: sfn)
    monkeypatch.setattr(score_pipeline_api, "_store", lambda: store)
    return sfn, store


def test_api_is_unavailable_when_the_pipeline_is_not_deployed(client):
    assert client.post("/api/pipeline/score/runs", json={}).status_code == 503
    body = client.get("/api/pipeline/score/runs").json()
    assert body["configured"] is False and body["runs"] == [] and len(body["stages"]) == len(STAGE_IDS)


def test_api_starts_a_run_and_refuses_a_second_one(client, api):
    sfn, _store = api
    resp = client.post("/api/pipeline/score/runs", json={"max_titles": 25})
    assert resp.status_code == 202
    body = resp.json()
    assert body["status"] == "running" and body["params"]["max_titles"] == 25
    assert [s["status"] for s in body["stages"]] == ["pending"] * len(STAGE_IDS)
    assert '"max_titles": 25' in sfn.started[0]["input"] and sfn.started[0]["name"] == body["run_id"]
    again = client.post("/api/pipeline/score/runs", json={})
    assert again.status_code == 409 and body["run_id"] in again.json()["detail"]
    assert client.post("/api/pipeline/score/runs", json={"max_titles": 100000}).status_code == 422


def test_api_reads_stage_records_while_running_and_the_record_when_done(client, api, ctx_store):
    sfn, store = api
    run = stages.handle({"stage": "init", "execution_name": "run-a", "input": {"trigger": "api"}}, store)["run"]
    sfn.executions.append({"name": "run-a", "status": "RUNNING", "startDate": "2026-11-14T22:00:00Z"})
    rec = StageRecorder(store, RunContext.from_dict(run), "bronze_titres")
    rec.decide("source", "SEC + TMX", 14000)
    rec.add_sample("titres_bruts", [{"symbole": "AAPL"}])
    rec.write("succeeded")
    StageRecorder(store, RunContext.from_dict(run), "silver_univers").write("running")
    body = client.get("/api/pipeline/score/runs/run-a").json()
    assert body["status"] == "running" and body["current_stage"] == "silver_univers"
    assert body["stages"][0]["decisions"][0]["count"] == 14000
    assert body["stages"][0]["samples"][0]["rows"] == [["AAPL"]]
    assert body["stages"][2]["status"] == "pending"

    sfn.executions[0].update(status="FAILED", error="States.Timeout", cause="délai dépassé",
                             stopDate="2026-11-14T23:00:00Z")
    failed = client.get("/api/pipeline/score/runs/run-a").json()
    assert failed["status"] == "failed" and failed["error"]["message"] == "délai dépassé"
    assert failed["stages"][1]["status"] == "failed"

    listing = client.get("/api/pipeline/score/runs").json()
    assert listing["configured"] and listing["runs"][0]["run_id"] == "run-a" and "stages" not in listing["runs"][0]
    assert client.get("/api/pipeline/score/runs/nope").status_code == 404
    assert client.get("/api/pipeline/score/runs/bad%20id").status_code == 404
