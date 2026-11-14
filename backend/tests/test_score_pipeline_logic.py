"""Score pipeline: pure logic of each stage (no network, no S3, no Bedrock)."""

from __future__ import annotations

import math
from datetime import date, datetime, timezone

import numpy as np
import pandas as pd
import pytest

from app.score_pipeline import cours, evenements, releves, titres
from app.score_pipeline import indicators as ind
from app.score_pipeline import store as st
from app.score_pipeline.runs import RunParams, StageRecorder, new_context


# --- Indicators ----------------------------------------------------------------------------------------

def test_cagr_normal_negative_start_and_negative_end():
    v = ind.cagr(100.0, 133.1, 3)
    assert v.value == pytest.approx(0.10, abs=1e-9) and not v.worst
    start_neg = ind.cagr(-5.0, 10.0, 3)
    assert start_neg.value is None and not start_neg.present and "départ" in start_neg.note
    end_neg = ind.cagr(5.0, -1.0, 3)
    assert end_neg.worst and end_neg.present


def test_volatility_uses_daily_returns_and_sqrt_of_periods():
    rets = np.array([0.01, -0.01] * 50)
    closes = pd.Series(100 * np.cumprod(1 + rets))
    expected = float(np.std(rets, ddof=1) * math.sqrt(252))
    assert ind.annualized_volatility(closes, 252) == pytest.approx(expected, rel=1e-9)
    assert ind.annualized_volatility(closes, 365) == pytest.approx(expected * math.sqrt(365 / 252), rel=1e-9)
    assert ind.annualized_volatility(closes.head(10), 252) is None


def test_max_drawdown_is_a_positive_fraction():
    assert ind.max_drawdown(pd.Series([100, 120, 90, 110, 60, 80])) == pytest.approx(0.5)
    assert ind.max_drawdown(pd.Series([1, 2, 3])) == 0


def test_momentum_skips_the_last_month():
    days = pd.date_range("2025-01-01", "2026-11-13", freq="D")
    closes = pd.Series(np.linspace(100, 200, len(days)), index=days)
    as_of = days[-1]
    expected = ind.value_asof(closes, as_of - pd.DateOffset(months=1)) / ind.value_asof(
        closes, as_of - pd.DateOffset(months=12)) - 1
    assert ind.momentum_12_1(closes, as_of) == pytest.approx(expected)
    assert ind.momentum_12_1(closes[closes.index > "2026-06-01"], as_of) is None


def test_events_value_weights_relevance_and_halves_every_30_days():
    today = date(2026, 11, 14)
    assert ind.events_value([], today) == (50.0, 0)
    fresh_good = (date(2026, 11, 14), 1.0, 1.0)
    old_bad = (date(2026, 10, 15), -1.0, 1.0)  # 30 days old: weight 0.5
    value, n = ind.events_value([fresh_good, old_bad], today)
    assert n == 2
    assert value == pytest.approx(50 + 50 * (1.0 - 0.5) / 1.5)
    too_old = (date(2026, 7, 1), -1.0, 1.0)
    irrelevant = (date(2026, 11, 14), -1.0, 0.0)
    assert ind.events_value([too_old, irrelevant], today)[0] == 50.0


def test_cap_clips_to_the_5th_and_95th_percentiles():
    values = {str(i): float(i) for i in range(101)}
    values["outlier"] = 10_000.0
    capped = ind.cap(values)
    assert capped["outlier"] == pytest.approx(np.percentile(list(values.values()), 95))
    assert capped["0"] == pytest.approx(np.percentile(list(values.values()), 5))


def test_ranks_invert_when_lower_is_better_and_worst_ranks_last():
    ranks = ind.percentile_ranks({"a": 1.0, "b": 2.0, "c": 3.0}, lower_is_better=False)
    assert ranks == {"a": 0.0, "b": 50.0, "c": 100.0}
    assert ind.percentile_ranks({"a": 1.0, "b": 2.0, "c": 3.0}, lower_is_better=True)["a"] == 100.0
    assert ind.percentile_ranks({"a": 5.0}, False) == {"a": 50.0}
    _capped, pe = ind.rank_indicator("pe", {"cheap": ind.Value(8.0), "dear": ind.Value(40.0),
                                            "loss": ind.Value(None, True)})
    assert pe["cheap"] == 100.0 and pe["dear"] == 0.0 and pe["loss"] == 0.0
    _c, events = ind.rank_indicator("events_90d", {"x": ind.Value(73.5)})
    assert events == {"x": 73.5}


def test_combine_redistributes_missing_weights_and_flags_partial():
    full = {s.id: 50.0 for s in ind.SUBSCORES}
    score, weights, partiel = ind.combine(full)
    assert score == pytest.approx(50.0) and not partiel and sum(weights.values()) == pytest.approx(1.0)
    etf = {s.id: None for s in ind.SUBSCORES}
    etf["momentum_risque"] = 80.0
    score, weights, partiel = ind.combine(etf)
    assert score == pytest.approx(80.0) and partiel and weights["momentum_risque"] == pytest.approx(1.0)
    missing_events = dict(full, evenements=None, rentabilite=90.0)
    score, weights, partiel = ind.combine(missing_events)
    assert partiel and weights["evenements"] == 0
    assert weights["rentabilite"] == pytest.approx(0.25 / 0.9)
    assert score == pytest.approx(90 * 0.25 / 0.9 + 50 * 0.65 / 0.9)
    assert ind.combine({s.id: None for s in ind.SUBSCORES})[0] is None


# --- Universe ------------------------------------------------------------------------------------------

def test_quotas_split_us_canada_and_etfs():
    q = titres.quotas(200, 0.3, 0.1)
    assert q == {"us_actions": 126, "ca_actions": 54, "us_fnb": 10, "ca_fnb": 10}
    assert sum(titres.quotas(37, 0.3, 0.1).values()) == 37


def _quote(symbol, kind="EQUITY", name="X Corp", days_ago=1, volume=1_000_000):
    ts = datetime(2026, 11, 14 - days_ago, 20, tzinfo=timezone.utc).timestamp()
    return {"symbol": symbol, "quoteType": kind, "longName": name, "shortName": name, "currency": "USD",
            "marketCap": 1e11, "averageDailyVolume3Month": volume, "regularMarketTime": ts,
            "sharesOutstanding": 1e9, "regularMarketPrice": 100.0}


def test_select_keeps_universe_titles_in_screener_order_with_filters():
    universe_rows = {
        "AAA": {"symbol": "AAA", "name": "AAA", "exchange": "NYSE", "country": "US", "cik": 1, "company_key": "cik:1"},
        "GOOGL": {"symbol": "GOOGL", "name": "G", "exchange": "Nasdaq", "country": "US", "cik": 2, "company_key": "cik:2"},
        "GOOG": {"symbol": "GOOG", "name": "G", "exchange": "Nasdaq", "country": "US", "cik": 2, "company_key": "cik:2"},
        "OLD": {"symbol": "OLD", "name": "O", "exchange": "NYSE", "country": "US", "cik": 3, "company_key": "cik:3"},
        "BBB": {"symbol": "BBB", "name": "B", "exchange": "NYSE", "country": "US", "cik": 4, "company_key": "cik:4"},
        "RY.TO": {"symbol": "RY.TO", "name": "RBC", "exchange": "TSX", "country": "CA", "cik": None,
                  "company_key": "tmx:tsx:RY"},
        "AAPL.TO": {"symbol": "AAPL.TO", "name": "Apple CDR", "exchange": "TSX", "country": "CA", "cik": None,
                    "company_key": "tmx:tsx:AAPL"},
    }
    screens = {
        "us_actions": {"quotes": [_quote("NOTLISTED"), _quote("AAA"), _quote("GOOGL"), _quote("GOOG"),
                                  _quote("OLD", days_ago=12), _quote("BBB")]},
        "ca_actions": {"quotes": [_quote("AAPL.TO", name="APPLE CDR (CAD HEDGED)"), _quote("RY.TO")]},
    }
    chosen, counts = titres.select(universe_rows, screens, {"us_actions": 2, "ca_actions": 1}, date(2026, 11, 14))
    assert [r["symbol"] for r in chosen] == ["AAA", "GOOGL", "RY.TO"]
    assert counts["hors_univers"] == 1 and counts["cdr"] == 1
    assert chosen[0]["asset_type"] == "action" and chosen[0]["popularity_rank"] == 1
    _chosen, counts = titres.select(universe_rows, screens, {"us_actions": 5}, date(2026, 11, 14))
    assert counts["doublons_societe"] == 1 and counts["inactifs"] == 1
    brk = {"BRK-A": {**universe_rows["AAA"], "symbol": "BRK-A", "company_key": "cik:9"},
           "BRK-B": {**universe_rows["AAA"], "symbol": "BRK-B", "company_key": "cik:9"}}
    by_volume = {"us_actions": {"quotes": [_quote("BRK-A", volume=1_000), _quote("BRK-B", volume=5_000_000)]}}
    chosen, _counts = titres.select(brk, by_volume, {"us_actions": 1}, date(2026, 11, 14))
    assert [r["symbol"] for r in chosen] == ["BRK-B"]  # the most traded class stands for the company


def test_parse_tmx_converts_symbols_and_drops_preferred_shares():
    body = {"results": [{"symbol": "BBD", "name": "Bombardier", "instruments": [
        {"symbol": "BBD.B", "name": "Cl B"}, {"symbol": "BBD.PR.B", "name": "Pref"}]}]}
    rows = titres.parse_tmx("tsx", body)
    assert [r["symbol"] for r in rows] == ["BBD-B.TO"]
    assert rows[0]["company_key"] == "tmx:tsx:BBD"


# --- Statements ----------------------------------------------------------------------------------------

def _fact(start, end, val, filed, form="10-Q", fp="Q1"):
    row = {"end": end, "val": val, "filed": filed, "form": form, "fp": fp, "accn": "x"}
    if start:
        row["start"] = start
    return row


def test_edgar_rows_take_first_publication_and_derive_q4():
    ni = [
        _fact("2025-01-01", "2025-03-31", 10, "2025-05-01"),
        _fact("2025-01-01", "2025-03-31", 11, "2026-05-01"),  # restated a year later: first publication kept
        _fact("2025-04-01", "2025-06-30", 20, "2025-08-01"),
        _fact("2025-01-01", "2025-06-30", 30, "2025-08-01"),
        _fact("2025-07-01", "2025-09-30", 30, "2025-11-01"),
        _fact("2025-01-01", "2025-09-30", 60, "2025-11-01"),
        _fact("2025-01-01", "2025-12-31", 100, "2026-02-15", form="10-K", fp="FY"),
    ]
    equity = [_fact(None, "2025-12-31", 500, "2026-02-15", form="10-K", fp="FY")]
    facts = {"facts": {"us-gaap": {"NetIncomeLoss": {"units": {"USD": ni}},
                                   "StockholdersEquity": {"units": {"USD": equity}},
                                   "LongTermDebt": {"units": {"USD": equity}}}}}
    rows = releves.edgar_rows("TEST", facts)
    quarters = [r for r in rows if r["period_type"] == "Q"]
    assert [r["period_end"] for r in quarters] == ["2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"]
    assert quarters[0]["net_income"] == 10 and quarters[0]["published"] == "2025-05-01"
    assert quarters[3]["net_income"] == 40  # FY 100 − 9 months 60
    assert quarters[3]["published"] == "2026-02-15" and quarters[3]["equity"] == 500
    fy = [r for r in rows if r["period_type"] == "FY"]
    assert fy[0]["net_income"] == 100 and fy[0]["total_debt"] == 500


def test_yahoo_rows_date_publication_by_filing_deadline():
    payload = {"currency": "CAD",
               "quarterly": {"income": {"2026-06-30": {"Total Revenue": 50.0, "Net Income": 5.0, "Diluted EPS": 0.5}},
                             "balance": {"2026-06-30": {"Stockholders Equity": 80.0, "Total Debt": 40.0}}},
               "annual": {"income": {"2025-12-31": {"Total Revenue": 190.0, "Net Income": 18.0}}, "balance": {}}}
    rows = releves.yahoo_rows("ABC.TO", payload)
    q = next(r for r in rows if r["period_type"] == "Q")
    assert q["published"] == "2026-08-14" and q["equity"] == 80.0 and q["eps"] == 0.5 and q["currency"] == "CAD"
    fy = next(r for r in rows if r["period_type"] == "FY")
    assert fy["published"] == "2026-03-31" and fy["revenue"] == 190.0


# --- Prices --------------------------------------------------------------------------------------------

def test_clean_prices_fills_short_gaps_and_drops_inactive_titles():
    days = pd.bdate_range("2026-10-01", "2026-11-13")
    rows = []
    for d in days:
        rows.append({"date": d.date().isoformat(), "symbol": "AAA", "close": 10, "adj_close": 9, "volume": 5})
        if d != days[5]:
            rows.append({"date": d.date().isoformat(), "symbol": "BBB", "close": 20, "adj_close": None, "volume": 5})
        if d < days[10]:
            rows.append({"date": d.date().isoformat(), "symbol": "DEAD", "close": 1, "adj_close": 1, "volume": 1})
    frame, counts = cours.clean(pd.DataFrame(rows), {"AAA": "US", "BBB": "US", "DEAD": "US"}, date(2026, 11, 14))
    assert set(frame["symbol"]) == {"AAA", "BBB"}
    assert counts["inactifs"] == 1 and counts["valeurs_comblees"] == 1
    bbb = frame[frame["symbol"] == "BBB"]
    assert len(bbb) == len(days) and bbb["adj_close"].eq(20).all()  # no adjusted close: raw close used
    assert frame[frame["symbol"] == "AAA"]["adj_close"].eq(9).all()


# --- Events (Bedrock stubbed) --------------------------------------------------------------------------

ARTICLES = [{"id": "AAA#0", "symbol": "AAA", "company": "Aaa Inc.", "date": "2026-11-10", "source": "gdelt",
             "title": "Aaa beats earnings estimates", "text": "Aaa raised its outlook for 2027.", "url": "u1"},
            {"id": "AAA#1", "symbol": "AAA", "company": "Aaa Inc.", "date": "2026-11-01", "source": "yahoo",
             "title": "Market wrap", "text": "", "url": "u2"}]


def _converse_reply(events):
    return {"output": {"message": {"content": [{"toolUse": {"name": "record_events", "input": {"events": events}}}]}},
            "usage": {"inputTokens": 100, "outputTokens": 40}}


def test_parse_response_checks_excerpts_and_clamps_values():
    reply = _converse_reply([
        {"article_id": "AAA#0", "event_type": "resultats", "impact": 1.7, "relevance": 0.9,
         "excerpt": "raised its outlook", "rationale": "Hausse des prévisions"},
        {"article_id": "AAA#1", "event_type": "invented", "impact": -0.2, "relevance": 0.1,
         "excerpt": "a phrase the article never says", "rationale": "Hors sujet"},
        {"article_id": "ZZZ#9", "event_type": "autre", "impact": 0, "relevance": 0, "excerpt": "x", "rationale": ""},
    ])
    rows, replaced = evenements.parse_response(reply, ARTICLES)
    assert len(rows) == 2 and replaced == 1
    assert rows[0]["impact"] == 1.0 and rows[0]["excerpt"] == "raised its outlook" and rows[0]["date"] == "2026-11-10"
    assert rows[1]["event_type"] == "autre" and rows[1]["excerpt"] == "Market wrap"


def test_cap_articles_round_robins_over_titles():
    index = {"A": {"name": "A", "articles": [{"id": f"A#{i}", "date": "2026-11-01"} for i in range(5)]},
             "B": {"name": "B", "articles": [{"id": "B#0", "date": "2026-11-01"}]}}
    picked = evenements.cap_articles(index, 3)
    assert [a["id"] for a in picked] == ["A#0", "B#0", "A#1"]


def test_events_stage_batches_articles_and_records_coverage():
    store = st.MemoryStore()
    ctx = new_context("run-1", "test", {"max_titles": 5})
    index = {"AAA": {"name": "Aaa Inc.", "status": "ok", "sources": {}, "articles": [
                {k: v for k, v in a.items() if k not in {"symbol", "company"}} for a in ARTICLES]},
             "BBB": {"name": "Bbb", "status": "failed", "sources": {}, "articles": []}}
    st.put_json(store, ctx.key("bronze", "articles_bruts", "articles_par_titre.json.gz"), index)
    calls = []

    def fake_converse(request):
        calls.append(request)
        assert request["toolConfig"]["toolChoice"] == {"tool": {"name": "record_events"}}
        return _converse_reply([{"article_id": "AAA#0", "event_type": "resultats", "impact": 0.6,
                                 "relevance": 1, "excerpt": "beats earnings", "rationale": "ok"}])

    rec = StageRecorder(store, ctx, "silver_evenements")
    evenements.silver(ctx, store, rec, deadline=float("inf"), converse=fake_converse)
    assert len(calls) == 1
    coverage = st.get_json(store, ctx.key("silver", "evenements_structures", "couverture.json"))
    assert coverage == {"AAA": "ok", "BBB": "failed"}
    assert rec.metrics["bedrock_calls"] == 1 and rec.metrics["input_tokens"] == 100
    frame = st.get_csv(store, ctx.key("silver", "evenements_structures", "evenements_structures.csv"))
    assert list(frame["symbol"]) == ["AAA"]


def test_run_params_are_bounded():
    assert RunParams().max_titles == 200
    with pytest.raises(ValueError):
        RunParams(max_titles=5000)
