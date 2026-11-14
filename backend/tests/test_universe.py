"""The live universe (SEC + TMX directories) and its search, on fake directories."""

from __future__ import annotations

import pytest

from app.data import universe
from tests.market_fakes import install_universe


@pytest.mark.parametrize("symbol, suffix, expected", [
    ("RY", ".TO", "RY.TO"),
    ("BBD.B", ".TO", "BBD-B.TO"),
    ("AP.UN", ".TO", "AP-UN.TO"),
    ("BTCQ.U", ".TO", "BTCQ-U.TO"),
    ("one", ".V", "ONE.V"),
])
def test_tmx_symbols_map_to_yahoo(symbol, suffix, expected):
    assert universe.tmx_to_yahoo(symbol, suffix) == expected


def test_universe_merges_sec_and_tmx_without_preferreds_debentures_or_warrants(monkeypatch):
    install_universe(monkeypatch)
    listings = universe.listings()
    assert {"AAPL", "NVDA", "BRK-B", "RY", "SCGLY", "RY.TO", "BBD-A.TO", "BBD-B.TO", "AP-UN.TO", "XIU.TO",
            "ONE.V"} <= set(listings)
    assert "DLST" not in listings  # no exchange in the SEC list
    assert not any(s.startswith(("RY-PR", "AP-DB", "ONE-WT")) for s in listings)
    assert listings["RY.TO"].exchange == "TSX" and listings["RY.TO"].country == "CA"
    assert listings["ONE.V"].exchange == "TSXV"
    assert listings["BBD-B.TO"].name == "Bombardier Inc."  # the company's main instrument
    assert listings["BBD-A.TO"].name == "Bombardier Inc. (Bombardier Cl A MV)"
    assert listings["AAPL"].exchange == "Nasdaq" and listings["AAPL"].source == "sec"


def test_universe_is_cached_on_disk_for_a_day(monkeypatch):
    calls = install_universe(monkeypatch)
    universe.listings()
    assert len(calls) == 3  # SEC, TSX, TSXV
    universe.reset()  # a new process: the disk cache answers
    universe.listings()
    assert len(calls) == 3


def test_one_source_down_still_serves_the_other_with_a_warning(monkeypatch, client):
    install_universe(monkeypatch, tmx=False)
    body = client.get("/api/universe").json()
    assert body["by_source"] == {"sec": 5}
    assert body["count"] == 5
    assert body["warnings"] and "TMX" in body["warnings"][0]


def test_both_sources_down_is_503(monkeypatch, client):
    install_universe(monkeypatch, sec=False, tmx=False)
    r = client.get("/api/universe/search?q=ry")
    assert r.status_code == 503


def _tickers(client, q, limit=20):
    r = client.get("/api/universe/search", params={"q": q, "limit": limit})
    assert r.status_code == 200
    return [x["ticker"] for x in r.json()["results"]]


def test_search_ranks_exact_symbols_first_major_exchanges_before_otc(monkeypatch, client):
    install_universe(monkeypatch)
    assert _tickers(client, "ry")[:2] == ["RY", "RY.TO"]
    assert _tickers(client, "RY.TO")[0] == "RY.TO"
    assert _tickers(client, "brk.b") == ["BRK-B"]
    assert _tickers(client, "bbd") == ["BBD-A.TO", "BBD-B.TO"]


def test_search_by_name_ignores_case_and_accents(monkeypatch, client):
    install_universe(monkeypatch)
    assert _tickers(client, "apple") == ["AAPL"]
    assert _tickers(client, "societe") == ["SCGLY"]
    assert _tickers(client, "quantum") == ["ONE.V"]
    assert "RY.TO" in _tickers(client, "royal bank")


def test_search_result_shape_and_limit(monkeypatch, client):
    install_universe(monkeypatch)
    body = client.get("/api/universe/search", params={"q": "b", "limit": 2}).json()
    assert len(body["results"]) == 2
    assert body["total"] >= 2
    assert set(body["results"][0]) == {"ticker", "name", "exchange", "country"}


def test_search_needs_a_query(client):
    assert client.get("/api/universe/search").status_code == 422
    assert client.get("/api/universe/search?q=").status_code == 422
