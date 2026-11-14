"""Score pipeline groups: validation, resolution, small-group ranking and the merged gold table."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.data import universe
from app.score_pipeline import gold, groups, titres
from app.score_pipeline import store as st
from app.score_pipeline.runs import GOLD_LATEST_KEY, RunParams, StageRecorder, new_context
from app.services.score_table import ScoreTable
from tests.test_score_pipeline_runs import FakeSfn, build_silver


# --- Validation ------------------------------------------------------------------------------------------

def test_without_a_group_the_legacy_fields_build_the_auto_group():
    p = RunParams(max_titles=25)
    assert p.group.kind == "auto" and p.group.max_titles == 25
    legacy = RunParams.model_validate({"max_titles": 200, "ca_share": 0.3, "etf_share": 0.1})
    assert legacy.model_dump()["group"] == {"kind": "auto", "max_titles": 200, "ca_share": 0.3, "etf_share": 0.1}


def test_a_ticker_group_is_cleaned_capped_and_mirrored():
    p = RunParams.model_validate({"group": {"kind": "tickers", "tickers": [" aapl", "AAPL", "ry.to", "brk.b"]}})
    assert p.group.tickers == ["AAPL", "RY.TO", "BRK.B"]
    assert p.max_titles == 3 and p.ca_share == 0 and p.etf_share == 0
    with pytest.raises(ValidationError, match="mal formés"):
        RunParams.model_validate({"group": {"kind": "tickers", "tickers": ["AAPL; DROP"]}})
    with pytest.raises(ValidationError, match="100 au plus"):
        RunParams.model_validate({"group": {"kind": "tickers", "tickers": [f"T{i}" for i in range(101)]}})
    with pytest.raises(ValidationError):
        RunParams.model_validate({"group": {"kind": "tickers", "tickers": []}})


def test_section_and_sector_groups_are_checked():
    p = RunParams.model_validate({"group": {"kind": "section", "id": "populaires", "limit": 12}})
    assert p.max_titles == 12 and "Les plus populaires" in groups.label(p.group)
    with pytest.raises(ValidationError, match="section inconnue"):
        RunParams.model_validate({"group": {"kind": "section", "id": "nope"}})
    sector = RunParams.model_validate({"group": {"kind": "sector", "name": "technologie"}})
    assert sector.group.name == "Technology" and sector.max_titles == 50 and sector.ca_share == 0.3
    with pytest.raises(ValidationError, match="secteur inconnu"):
        RunParams.model_validate({"group": {"kind": "sector", "name": "Cryptos"}})
    with pytest.raises(ValidationError):
        RunParams.model_validate({"group": {"kind": "everything"}})


def test_resolve_tickers_reports_unknown_symbols_and_aliases():
    known = {"AAPL", "BRK-B", "RY.TO", "T", "T.TO"}.__contains__
    resolved, aliases, unknown = groups.resolve_tickers(["AAPL", "BRK.B", "RY", "T", "ZZZZ", "RY.TO"], known)
    assert resolved == ["AAPL", "BRK-B", "RY.TO", "T"]
    assert aliases == {"BRK.B": "BRK-B", "RY": "RY.TO"} and unknown == ["ZZZZ"]


def test_plan_for_a_sector_restricts_both_stock_screeners():
    group = RunParams.model_validate({"group": {"kind": "sector", "name": "Energy", "max_titles": 20}}).group
    plan = titres.plan(group)
    assert {k: n for k, (_s, n) in plan.items()} == {"sector_us": 14, "sector_ca": 6}
    assert all(spec["sector"] == "Energy" for spec, _n in plan.values())


# --- Selection of requested tickers ------------------------------------------------------------------------

def _quote(symbol, name="X Corp", kind="EQUITY", days_ago=1):
    ts = (datetime(2026, 11, 14, 20, tzinfo=timezone.utc) - timedelta(days=days_ago)).timestamp()
    return {"symbol": symbol, "quoteType": kind, "longName": name, "currency": "USD", "marketCap": 1e10,
            "averageDailyVolume3Month": 1e6, "regularMarketTime": ts}


def test_explicit_tickers_keep_cdrs_and_share_classes_and_report_exclusions():
    rows = {s: {"symbol": s, "name": s, "exchange": "X", "country": "US", "cik": 1, "company_key": "cik:1"}
            for s in ("GOOGL", "GOOG", "AAPL.TO", "OLD", "IDX")}
    screens = {"tickers": {"quotes": [_quote("GOOGL"), _quote("GOOG"), _quote("AAPL.TO", "APPLE CDR"),
                                      _quote("OLD", days_ago=20), _quote("IDX", kind="INDEX")]}}
    chosen, _counts, excluded = titres.select(rows, screens, {"tickers": 5}, date(2026, 11, 14), explicit=True,
                                              top_up=False)
    assert [r["symbol"] for r in chosen] == ["GOOGL", "GOOG", "AAPL.TO"]
    assert {e["symbol"] for e in excluded} == {"OLD", "IDX"}


def test_silver_universe_of_a_ticker_group_records_its_resolution(monkeypatch):
    store = st.MemoryStore()
    ctx = new_context("run-t", "test", {"group": {"kind": "tickers", "tickers": ["AAPL", "BRK.B", "NOPE", "OLD"]}})
    ctx.date = "2026-11-14"
    sec = {"fields": ["cik", "name", "ticker", "exchange"],
           "data": [[1, "Apple Inc.", "AAPL", "Nasdaq"], [2, "Berkshire", "BRK-B", "NYSE"], [3, "Old", "OLD", "NYSE"]]}
    st.put_json(store, ctx.key("bronze", "titres_bruts", "sec_company_tickers_exchange.json.gz"), sec)
    st.put_json(store, ctx.key("bronze", "titres_bruts", titres.SCREENS_FILE),
                {"tickers": {"quotes": [_quote("AAPL"), _quote("BRK-B"), _quote("OLD", days_ago=30)]}})
    rec = StageRecorder(store, ctx, "silver_univers")
    monkeypatch.setattr(titres.yf_market, "profile", lambda symbol: {"sector": "Technology"})
    titres.silver(ctx, store, rec, deadline=float("inf"))
    group = rec.metrics["group"]
    assert group["kind"] == "tickers" and group["resolved"] == ["AAPL", "BRK-B"]
    assert group["unknown"] == ["NOPE"] and group["aliases"] == {"BRK.B": "BRK-B"}
    assert group["excluded"] == [{"symbol": "OLD", "reason": titres.REASONS["inactifs"]}]
    messages = " | ".join(d["message"] for d in rec.decisions)
    assert "NOPE" in messages and "BRK.B → BRK-B" in messages


# --- Gold: comparison set and merge ------------------------------------------------------------------------

def _gold(store: st.Store, run_id: str, keep: list[str] | None = None) -> StageRecorder:
    ctx = new_context(run_id, "test", {"max_titles": 8})
    ctx.date = "2026-11-14"
    build_silver(store, ctx)
    if keep is not None:
        univ = st.get_csv(store, ctx.key("silver", "univers", "univers.csv"))
        st.put_csv(store, ctx.key("silver", "univers", "univers.csv"), univ[univ["symbol"].isin(keep)])
    rec = StageRecorder(store, ctx, "gold")
    gold.run(ctx, store, rec, deadline=float("inf"))
    return rec


def test_a_small_group_is_ranked_with_the_latest_table_and_merged_into_it():
    store = st.MemoryStore()
    first = _gold(store, "run-full")
    assert "groupe seul" in first.metrics["comparison"] and first.metrics["reference_titles"] == 0
    before = {r["symbol"]: r for r in st.get_json(store, GOLD_LATEST_KEY)["rows"]}
    assert all(r["run_id"] == "run-full" and r["sector"] for r in before.values() if r["asset_type"] == "action")

    second = _gold(store, "run-small", keep=["T1", "T2"])
    assert second.metrics["reference_titles"] == 6 and second.metrics["comparison_size"] == 8
    assert "dernière table gold" in second.metrics["comparison"]
    latest = st.get_json(store, GOLD_LATEST_KEY)
    ScoreTable.model_validate(latest)
    rows = {r["symbol"]: r for r in latest["rows"]}
    assert set(rows) == set(before) and latest["run_id"] == "run-small"
    assert rows["T1"]["run_id"] == "run-small" and rows["T3"]["run_id"] == "run-full"
    assert rows["T3"] == before["T3"]  # other titles' rows are kept as they were
    # Same data, same comparison set: the group's scores match the full run's.
    assert rows["T1"]["score"] == pytest.approx(before["T1"]["score"], abs=0.01)
    assert rows["T1"]["comparison_set"] == before["T1"]["comparison_set"]
    own = st.get_json(store, "gold/score_par_titre/2026-11-14/run-small/score_par_titre.json")
    assert [r["symbol"] for r in own["rows"]] == sorted(["T1", "T2"], key=lambda s: -rows[s]["score"])
    assert any("fusionnée" in d["message"] and d["count"] == 8 for d in second.decisions)


def test_reference_set_reads_worst_flags_and_sectors_back():
    table = {"run_id": "old", "rows": [{
        "symbol": "LOSS", "score": 30.0, "comparison_set": "Toutes les actions (9 titres ; secteur Energy trop petit)",
        "sub_scores": [{"id": "valorisation", "indicators": [
            {"id": "pe", "value": None, "rank": 0.0, "note": "Bénéfice négatif : classé au dernier rang"},
            {"id": "pb", "value": 3.2, "rank": 40.0, "note": None}]}]}]}
    raw, sectors = gold.reference_set(table, exclude=set())
    assert raw["LOSS"]["pe"].worst and raw["LOSS"]["pb"].value == 3.2 and sectors == {"LOSS": "Energy"}
    merged, replaced, kept = gold.merge(table, [{"symbol": "NEW", "score": 50.0}])
    assert (replaced, kept) == (0, 1) and merged[1]["run_id"] == "old"


# --- API -----------------------------------------------------------------------------------------------

@pytest.fixture
def api(monkeypatch):
    from app import score_pipeline_api
    from app.config import get_settings

    monkeypatch.setenv("DATA_BUCKET", "stocklock-data-test")
    monkeypatch.setenv("SCORE_PIPELINE_ARN", "arn:aws:states:us-east-1:1:stateMachine:stocklock-score-pipeline")
    get_settings.cache_clear()
    sfn, store = FakeSfn(), st.MemoryStore()
    monkeypatch.setattr(score_pipeline_api, "_sfn", lambda: sfn)
    monkeypatch.setattr(score_pipeline_api, "_store", lambda: store)
    return sfn, store


def test_api_checks_requested_tickers_against_the_universe(client, api, monkeypatch):
    sfn, _store = api
    monkeypatch.setattr(universe, "get", lambda s: object() if s in {"AAPL", "RY.TO"} else None)
    refused = client.post("/api/pipeline/score/runs", json={"group": {"kind": "tickers", "tickers": ["ZZZ", "QQQQ"]}})
    assert refused.status_code == 422 and "ZZZ, QQQQ" in refused.json()["detail"]
    assert not sfn.started
    body = client.post("/api/pipeline/score/runs",
                       json={"group": {"kind": "tickers", "tickers": ["AAPL", "RY", "ZZZ"]}}).json()
    assert body["group"]["kind"] == "tickers" and body["group"]["unknown"] == ["ZZZ"]
    assert body["group"]["aliases"] == {"RY": "RY.TO"} and body["params"]["max_titles"] == 3
    assert '"kind": "tickers"' in sfn.started[0]["input"]
    bad = client.post("/api/pipeline/score/runs", json={"group": {"kind": "sector", "name": "Cryptos"}})
    assert bad.status_code == 422


def test_api_lists_group_options_and_reads_legacy_records(client, api):
    sfn, store = api
    st.put_json(store, "runs/old-run.json", {"run_id": "old-run", "status": "succeeded", "trigger": "api",
                                             "params": {"max_titles": 200, "ca_share": 0.3, "etf_share": 0.1,
                                                        "news_per_title": 6, "max_llm_articles": 1200},
                                             "summary": {"titles_scored": 200}, "stages": []})
    sfn.executions.append({"name": "old-run", "status": "SUCCEEDED", "startDate": "2026-11-14T22:00:00Z"})
    body = client.get("/api/pipeline/score/runs").json()
    assert {s["id"] for s in body["group_options"]["sections"]} >= {"populaires", "meilleurs-scores"}
    assert body["group_options"]["max_tickers"] == 100 and len(body["group_options"]["sectors"]) == 11
    run = body["runs"][0]
    assert run["params"]["group"]["kind"] == "auto" and run["group"]["label"].startswith("Sélection automatique")
