"""Legacy `GET /api/stocks`: the starter kit's 31 assets at their last close (first dashboard)."""

from __future__ import annotations

import pandas as pd
import pytest

from app.data import starter


def _rows(ticker: str) -> pd.DataFrame:
    p = starter.prices()
    return p.loc[p["ticker"] == ticker].sort_values("date").reset_index(drop=True)


# --- GET /api/stocks ----------------------------------------------------------------------------

def test_list_has_the_31_assets_with_identity_and_quote(client):
    r = client.get("/api/stocks")
    assert r.status_code == 200
    stocks = r.json()
    assert len(stocks) == 31
    assert {s["ticker"] for s in stocks} == set(starter.universe()["ticker"])
    keys = {"ticker", "name", "asset_class", "market", "currency", "sector", "last_close", "change_abs",
            "change_pct", "as_of", "sparkline"}
    assert all(set(s) == keys for s in stocks)


def test_list_day_change_is_against_the_same_tickers_previous_close(client):
    stocks = {s["ticker"]: s for s in client.get("/api/stocks").json()}
    for ticker in ("RY.TO", "NVDA", "BTC-USD"):
        rows = _rows(ticker)
        last, prev = float(rows["close"].iloc[-1]), float(rows["close"].iloc[-2])
        s = stocks[ticker]
        assert s["as_of"] == rows["date"].iloc[-1].date().isoformat()
        assert s["last_close"] == pytest.approx(last, abs=1e-4)
        assert s["change_abs"] == pytest.approx(last - prev, abs=1e-4)
        assert s["change_pct"] == pytest.approx((last / prev - 1) * 100, abs=1e-4)


def test_list_sparkline_is_the_last_30_closes(client):
    btc = next(s for s in client.get("/api/stocks").json() if s["ticker"] == "BTC-USD")
    expected = _rows("BTC-USD")["close"].iloc[-30:].tolist()
    assert btc["sparkline"] == pytest.approx(expected, abs=1e-4)


def test_list_is_computed_once(client):
    from app.services import starter_quotes as stocks

    stocks.list_stocks.cache_clear()
    client.get("/api/stocks")
    client.get("/api/stocks")
    assert stocks.list_stocks.cache_info().misses == 1

