"""Sections of the « Tableau de bord »: screened live, filtered on the universe, with sparklines and scores."""

from __future__ import annotations

import pytest

from app.services import sections
from tests.market_fakes import install_universe, install_yahoo, raw_quote
from tests.test_scores import install_table, score_row


@pytest.fixture
def market(monkeypatch):
    install_universe(monkeypatch)

    def install(**kwargs):
        return install_yahoo(monkeypatch, **kwargs)

    return install


def test_catalog_lists_the_sections_in_display_order(client):
    body = client.get("/api/market/sections").json()
    assert [s["id"] for s in body][:4] == ["populaires", "meilleurs-scores", "hausses", "baisses"]
    assert all(set(s) == {"id", "title", "description", "source"} for s in body)
    assert "canada-populaires" in {s["id"] for s in body}


def test_screened_section_keeps_universe_titles_with_their_sparkline(market, client):
    calls = market(
        screens={"most_actives": [raw_quote("NVDA", 162.85, -2.01, "NVIDIA Corporation"),
                                  raw_quote("TCEHY", 60.0, 1.0),  # not in the universe (no SEC filing)
                                  raw_quote("AAPL", 356.27, 0.39, "Apple Inc.")]},
        sparks={"NVDA": [170.0, 165.0, 162.85], "AAPL": [350.0, 356.27]},
    )
    r = client.get("/api/market/sections/populaires")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok" and body["message"] is None
    assert body["title"] == "Les plus populaires"
    assert [i["ticker"] for i in body["items"]] == ["NVDA", "AAPL"]
    nvda = body["items"][0]
    assert nvda["name"] == "NVIDIA Corporation"
    assert nvda["exchange"] == "Nasdaq"
    assert nvda["price"] == 162.85
    assert nvda["change_pct"] == pytest.approx(-2.01)
    assert nvda["sparkline"] == [170.0, 165.0, 162.85]
    assert nvda["score"] is None and nvda["score_partiel"] is None
    assert body["as_of"] == "2026-11-13"
    spark_calls = [params for url, params in calls if "spark" in url]
    assert spark_calls == [{"symbols": "NVDA,AAPL", "range": "1mo", "interval": "1d"}]


def test_canadian_sections_leave_out_depositary_receipts(market, client):
    market(screens={"ca_most_active": [raw_quote("NVDA.TO", 36.15, -2.0, shortName="NVIDIA CDR (CAD HEDGED)"),
                                       raw_quote("RY.TO", 288.37, -0.35, "Royal Bank of Canada")]},
           sparks={})
    body = client.get("/api/market/sections/canada-populaires").json()
    assert [i["ticker"] for i in body["items"]] == ["RY.TO"]
    assert body["items"][0]["sparkline"] == []
    assert body["items"][0]["exchange"] == "TSX"


def test_limit_caps_the_cards(market, client):
    market(screens={"day_gainers": [raw_quote(s, 10.0, 5.0) for s in ("AAPL", "NVDA", "BRK-B", "RY")]})
    body = client.get("/api/market/sections/hausses?limit=2").json()
    assert [i["ticker"] for i in body["items"]] == ["AAPL", "NVDA"]
    assert client.get("/api/market/sections/hausses?limit=0").status_code == 422
    assert client.get(f"/api/market/sections/hausses?limit={sections.MAX_LIMIT + 1}").status_code == 422


def test_section_cards_carry_the_score_when_the_table_has_one(market, monkeypatch, client):
    install_table(monkeypatch, [score_row("AAPL", 72.4), score_row("NVDA", 55.0, partiel=True)])
    market(screens={"most_actives": [raw_quote("NVDA", 162.85, -2.01), raw_quote("BRK-B", 500.0, 0.1)]})
    items = client.get("/api/market/sections/populaires").json()["items"]
    assert [(i["ticker"], i["score"], i["score_partiel"]) for i in items] == [("NVDA", 55.0, True),
                                                                            ("BRK-B", None, None)]


def test_best_scores_section_is_empty_and_says_why_without_the_table(market, client):
    market()
    body = client.get("/api/market/sections/meilleurs-scores").json()
    assert body["status"] == "empty"
    assert body["items"] == []
    assert "pipeline" in body["message"]


def test_best_scores_section_lists_the_table_by_score(market, monkeypatch, client):
    install_table(monkeypatch, [score_row("AAPL", 72.4), score_row("NVDA", 81.0), score_row("RY.TO", 64.0)])
    market(quotes={"AAPL": raw_quote("AAPL", 356.27, 0.39), "NVDA": raw_quote("NVDA", 162.85, -2.01),
                   "RY.TO": raw_quote("RY.TO", 288.37, -0.35)},
           sparks={"NVDA": [1.0, 2.0]})
    body = client.get("/api/market/sections/meilleurs-scores?limit=2").json()
    assert body["status"] == "ok"
    assert [(i["ticker"], i["score"]) for i in body["items"]] == [("NVDA", 81.0), ("AAPL", 72.4)]


def test_screener_down_is_503_in_french(market, client):
    market(down=True)
    r = client.get("/api/market/sections/populaires")
    assert r.status_code == 503
    assert r.json()["detail"].startswith("Yahoo Finance indisponible")


def test_screener_results_are_cached(market, client):
    calls = market(screens={"day_losers": [raw_quote("AAPL", 10.0, -5.0)]}, sparks={"AAPL": [11.0, 10.0]})
    client.get("/api/market/sections/baisses")
    client.get("/api/market/sections/baisses")
    assert [url for url, _ in calls] == ["screen:day_losers", "https://query1.finance.yahoo.com/v7/finance/spark"]


def test_unknown_section_is_404(client):
    assert client.get("/api/market/sections/nope").status_code == 404
