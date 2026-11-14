"""KPI strip of the « Tableau de bord »: indices, USD/CAD, universe size, scored titles — one status per tile."""

from __future__ import annotations

import pytest

from app.config import get_settings
from tests.market_fakes import install_universe, install_yahoo, raw_quote
from tests.test_scores import install_table, score_row

INDEX_QUOTES = {
    "^GSPC": raw_quote("^GSPC", 6812.34, 0.52, "S&P 500"),
    "^GSPTSE": raw_quote("^GSPTSE", 30120.5, -0.31, "S&P/TSX Composite index"),
    "^IXIC": raw_quote("^IXIC", 22890.1, 0.0, "NASDAQ Composite"),
    "CAD=X": raw_quote("CAD=X", 1.4012, -0.12, "USD/CAD"),
}


def by_id(body: dict) -> dict[str, dict]:
    return {item["id"]: item for item in body["items"]}


def test_kpis_give_indices_fx_universe_and_the_unscored_state(monkeypatch, client):
    install_universe(monkeypatch)
    calls = install_yahoo(monkeypatch, quotes=INDEX_QUOTES)

    r = client.get("/api/market/kpis")
    assert r.status_code == 200
    body = r.json()
    assert [i["id"] for i in body["items"]] == ["sp500", "tsx", "nasdaq", "usdcad", "titres-suivis", "titres-notes"]
    tiles = by_id(body)

    sp = tiles["sp500"]
    assert sp["label"] == "S&P 500" and sp["kind"] == "index" and sp["status"] == "ok"
    assert sp["value"] == 6812.34
    assert sp["change_pct"] == pytest.approx(0.52)
    assert sp["change_abs"] == pytest.approx(6812.34 * 0.52 / 100)
    assert sp["as_of"] == "2026-11-13"
    assert tiles["tsx"]["label"] == "S&P/TSX composé" and tiles["tsx"]["change_pct"] == pytest.approx(-0.31)
    assert tiles["usdcad"]["kind"] == "fx" and tiles["usdcad"]["value"] == 1.4012

    universe_tile = tiles["titres-suivis"]
    assert universe_tile["status"] == "ok" and universe_tile["kind"] == "count"
    assert universe_tile["value"] > 0
    assert universe_tile["detail"].startswith("SEC ") and " · TMX " in universe_tile["detail"]

    scored = tiles["titres-notes"]
    assert scored["status"] == "empty" and scored["value"] is None
    assert scored["detail"] == "Pipeline pas encore exécuté"

    # One batched quote request for the four symbols.
    quote_calls = [params for url, params in calls if "/v7/finance/quote" in url]
    assert quote_calls == [{"symbols": "^GSPC,^GSPTSE,^IXIC,CAD=X"}]


def test_scored_tile_counts_the_table_and_gives_the_median(monkeypatch, client):
    install_universe(monkeypatch)
    install_yahoo(monkeypatch, quotes=INDEX_QUOTES)
    install_table(monkeypatch, [score_row("AAPL", 70.0), score_row("NVDA", 61.25), score_row("XIU.TO", 40.0, True)])

    scored = by_id(client.get("/api/market/kpis").json())["titres-notes"]
    assert scored["status"] == "ok"
    assert scored["value"] == 3
    assert scored["detail"] == "Score médian 61,2"
    assert scored["as_of"] == "2026-11-15"


def test_a_failing_source_only_breaks_its_own_tiles(monkeypatch, client):
    install_universe(monkeypatch)
    install_yahoo(monkeypatch, down=True)

    r = client.get("/api/market/kpis")
    assert r.status_code == 200
    tiles = by_id(r.json())
    for tile_id in ("sp500", "tsx", "nasdaq", "usdcad"):
        assert tiles[tile_id]["status"] == "error"
        assert tiles[tile_id]["value"] is None
        assert "Yahoo Finance indisponible" in tiles[tile_id]["message"]
    assert tiles["titres-suivis"]["status"] == "ok"


def test_a_missing_quote_and_a_down_universe_are_per_tile_errors(monkeypatch, client):
    # No universe installed: the offline fixture makes SEC and TMX unreachable.
    quotes = {k: v for k, v in INDEX_QUOTES.items() if k != "^IXIC"}
    install_yahoo(monkeypatch, quotes=quotes)

    tiles = by_id(client.get("/api/market/kpis").json())
    assert tiles["sp500"]["status"] == "ok"
    assert tiles["nasdaq"]["status"] == "error"
    assert tiles["nasdaq"]["message"] == "Aucune cotation reçue pour ^IXIC."
    assert tiles["titres-suivis"]["status"] == "error"
    assert "indisponible" in tiles["titres-suivis"]["message"]


def test_an_unreadable_score_table_is_an_error_tile(monkeypatch, client):
    install_universe(monkeypatch)
    install_yahoo(monkeypatch, quotes=INDEX_QUOTES)
    install_table(monkeypatch, raw=b"not json")

    scored = by_id(client.get("/api/market/kpis").json())["titres-notes"]
    assert scored["status"] == "error"
    assert "illisible" in scored["message"]


def test_kpi_symbols_come_from_the_settings(monkeypatch, client):
    monkeypatch.setenv("KPI_SYMBOLS", "sp500=^SPX, usdcad=CAD=X, inconnu=ZZZ")
    get_settings.cache_clear()
    assert get_settings().kpi_symbols == {"sp500": "^SPX", "usdcad": "CAD=X", "inconnu": "ZZZ"}
    install_universe(monkeypatch)
    calls = install_yahoo(monkeypatch, quotes={"^SPX": raw_quote("^SPX", 6800.0, 1.0), "CAD=X": INDEX_QUOTES["CAD=X"]})

    body = client.get("/api/market/kpis").json()
    # Only the tiles the backend knows a label for; the unknown id is ignored.
    assert [i["id"] for i in body["items"]] == ["sp500", "usdcad", "titres-suivis", "titres-notes"]
    assert [params for url, params in calls if "/v7/finance/quote" in url] == [{"symbols": "^SPX,CAD=X"}]
