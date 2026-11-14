"""A stock's page on live data (`GET /api/stocks/{ticker}`), from a fake Yahoo Finance chart."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from tests.market_fakes import chart, install_universe, install_yahoo

END = datetime(2026, 11, 13, 14, 30, tzinfo=timezone.utc)
CLOSES = [100.0 + i for i in range(300)]  # 300 business days, up 1 $ a day
DIVIDENDS = [(datetime(2026, 8, 11, 14, 30, tzinfo=timezone.utc), 0.26),
             (datetime(2026, 11, 10, 14, 30, tzinfo=timezone.utc), 0.27),
             (datetime(2025, 8, 11, 14, 30, tzinfo=timezone.utc), 0.25)]


@pytest.fixture
def yahoo(monkeypatch):
    install_universe(monkeypatch)
    return install_yahoo(monkeypatch, charts={
        "AAPL": chart(CLOSES, dividends=DIVIDENDS),
        "XIU.TO": chart([50.0, 51.0, 52.0], instrument="ETF", currency="CAD", name="iShares S&P/TSX 60 Index ETF",
                        tz="America/Toronto"),
        "BTC-USD": chart([70000.0, 68000.0], instrument="CRYPTOCURRENCY", name="Bitcoin USD", tz="UTC"),
    }, profiles={"AAPL": "Technology"})


def test_detail_has_identity_quote_and_live_source(yahoo, client):
    r = client.get("/api/stocks/aapl")
    assert r.status_code == 200
    body = r.json()
    assert body["ticker"] == "AAPL"
    assert body["name"] == "Apple Inc."
    assert body["asset_class"] == "equity"
    assert body["market"] == "Nasdaq"
    assert body["currency"] == "USD"
    assert body["sector"] == "Technology"
    assert body["in_universe"] is True
    assert body["starter_kit"] is True  # AAPL is one of the datathon's 31 assets
    assert body["last_close"] == 399.0
    assert body["change_abs"] == 1.0
    assert body["change_pct"] == pytest.approx(1 / 398 * 100, abs=1e-4)
    assert body["as_of"] == "2026-11-13"
    assert body["source"]["id"] == "yahoo_finance"


def test_detail_defaults_to_one_month_and_ranges_window_the_closes(yahoo, client):
    month = client.get("/api/stocks/AAPL").json()["points"]
    assert month[-1] == {"date": "2026-11-13", "close": 399.0}
    assert month[0]["date"] >= "2026-10-13"
    assert len(month) == 24  # business days from 13 Oct to 13 Nov
    week = client.get("/api/stocks/AAPL?range=1W").json()["points"]
    assert [p["date"] for p in week] == ["2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12",
                                         "2026-11-13"]
    assert len(client.get("/api/stocks/AAPL?range=MAX").json()["points"]) == 300


def test_switching_range_does_not_refetch_the_history(yahoo, client):
    client.get("/api/stocks/AAPL?range=1M")
    client.get("/api/stocks/AAPL?range=1Y")
    assert sum("/v8/finance/chart/" in url for url, _ in yahoo) == 1


def test_detail_stats_and_dividends(yahoo, client):
    stats = client.get("/api/stocks/AAPL").json()["stats"]
    assert stats["open"] == 398.0 and stats["high"] == 401.0 and stats["low"] == 397.0
    assert stats["volume"] == 300_000
    assert stats["high_52w"] == 401.0
    assert [d["ex_date"] for d in stats["dividends"]] == ["2026-11-10", "2026-08-11", "2025-08-11"]
    assert stats["dividend_yield_ttm"] == pytest.approx((0.26 + 0.27) / 399.0)


def test_an_etf_has_no_sector_and_a_crypto_outside_the_universe_is_still_served(yahoo, client):
    etf = client.get("/api/stocks/XIU.TO").json()
    assert etf["asset_class"] == "etf" and etf["sector"] == "Non applicable (FNB)" and etf["market"] == "TSX"
    assert etf["currency"] == "CAD"
    assert etf["stats"]["dividends"] == [] and etf["stats"]["dividend_yield_ttm"] is None
    btc = client.get("/api/stocks/BTC-USD").json()
    assert btc["in_universe"] is False and btc["asset_class"] == "crypto"
    assert btc["change_pct"] == pytest.approx(-2000 / 70000 * 100, abs=1e-4)


def test_unknown_to_yahoo_is_404(yahoo, client):
    r = client.get("/api/stocks/NOPE.TO")
    assert r.status_code == 404
    assert "Aucun cours" in r.json()["detail"]


def test_yahoo_down_is_503(monkeypatch, client):
    install_universe(monkeypatch)
    install_yahoo(monkeypatch, down=True)
    r = client.get("/api/stocks/AAPL")
    assert r.status_code == 503
    assert r.json()["detail"].startswith("Yahoo Finance indisponible")


def test_universe_down_still_serves_the_page_from_yahoo(monkeypatch, client):
    install_universe(monkeypatch, sec=False, tmx=False)
    install_yahoo(monkeypatch, charts={"AAPL": chart(CLOSES)})
    body = client.get("/api/stocks/AAPL").json()
    assert body["in_universe"] is False and body["market"] == "NasdaqGS"


@pytest.mark.parametrize("range_", ["2Y", "1m", "", "ALL"])
def test_invalid_range_is_422(yahoo, client, range_):
    assert client.get(f"/api/stocks/AAPL?range={range_}").status_code == 422


def test_a_company_yahoo_has_no_sector_for_says_so(monkeypatch, client):
    install_universe(monkeypatch)
    install_yahoo(monkeypatch, charts={"ONE.V": chart([0.4, 0.37], currency="CAD", tz="America/Toronto")})
    assert client.get("/api/stocks/ONE.V").json()["sector"] == "Non disponible"
