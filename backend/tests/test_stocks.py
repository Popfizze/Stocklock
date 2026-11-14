"""Routes of the « Tableau de bord »: quote list and per-ticker detail, on the starter-kit prices."""

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
    from app.services import stocks

    stocks.list_stocks.cache_clear()
    client.get("/api/stocks")
    client.get("/api/stocks")
    assert stocks.list_stocks.cache_info().misses == 1


# --- GET /api/stocks/{ticker} -------------------------------------------------------------------

@pytest.mark.parametrize("ticker", ["RY.TO", "BTC-USD", "NVDA"])
def test_detail_accepts_dots_and_dashes_in_the_path(client, ticker):
    r = client.get(f"/api/stocks/{ticker}")
    assert r.status_code == 200
    body = r.json()
    assert body["ticker"] == ticker
    assert {"name", "asset_class", "market", "currency", "sector", "last_close", "change_abs", "change_pct",
            "as_of", "points", "stats"} <= set(body)


def test_detail_defaults_to_one_month_of_closes(client):
    body = client.get("/api/stocks/NVDA").json()
    rows = _rows("NVDA")
    end = rows["date"].iloc[-1]
    expected = rows.loc[rows["date"] >= end - pd.DateOffset(months=1)]
    assert [p["date"] for p in body["points"]] == [d.date().isoformat() for d in expected["date"]]
    assert [p["close"] for p in body["points"]] == pytest.approx(expected["close"].tolist(), abs=1e-4)


@pytest.mark.parametrize("range_, offset", [
    ("1W", pd.DateOffset(weeks=1)),
    ("3M", pd.DateOffset(months=3)),
    ("1Y", pd.DateOffset(years=1)),
])
def test_detail_ranges_window_the_closes(client, range_, offset):
    body = client.get(f"/api/stocks/RY.TO?range={range_}").json()
    rows = _rows("RY.TO")
    start = rows["date"].iloc[-1] - offset
    assert len(body["points"]) == int((rows["date"] >= start).sum())
    assert body["points"][-1]["date"] == "2026-11-12"


def test_detail_max_range_is_the_whole_history(client):
    body = client.get("/api/stocks/ETH-USD?range=MAX").json()
    assert len(body["points"]) == len(_rows("ETH-USD"))
    assert body["points"][0]["date"] == "2021-11-12"


def test_detail_stats(client):
    stats = client.get("/api/stocks/RY.TO").json()["stats"]
    rows = _rows("RY.TO")
    last = rows.iloc[-1]
    end = last["date"]
    assert stats["open"] == pytest.approx(last["open"], abs=1e-4)
    assert stats["high"] == pytest.approx(last["high"], abs=1e-4)
    assert stats["low"] == pytest.approx(last["low"], abs=1e-4)
    assert stats["volume"] == int(last["volume"])
    three_months = rows.loc[rows["date"] > end - pd.DateOffset(months=3), "volume"]
    assert stats["avg_volume_3m"] == pytest.approx(three_months.mean(), abs=1)
    year = rows.loc[rows["date"] > end - pd.Timedelta(weeks=52)]
    assert stats["high_52w"] == pytest.approx(year["high"].max(), abs=1e-4)
    assert stats["low_52w"] == pytest.approx(year["low"].min(), abs=1e-4)


def test_detail_dividends_most_recent_first_at_most_12_and_ttm_yield(client):
    body = client.get("/api/stocks/RY.TO").json()
    stats = body["stats"]
    a = starter.corporate_actions()
    divs = a.loc[(a["ticker"] == "RY.TO") & (a["action"] == "dividend")].sort_values("ex_date", ascending=False)
    assert len(stats["dividends"]) == 12
    assert [d["ex_date"] for d in stats["dividends"]] == [d.date().isoformat() for d in divs["ex_date"].iloc[:12]]
    assert stats["dividends"][0]["value"] == pytest.approx(divs["value"].iloc[0])
    end = pd.Timestamp(body["as_of"])
    ttm = divs.loc[(divs["ex_date"] > end - pd.DateOffset(years=1)) & (divs["ex_date"] <= end), "value"].sum()
    assert ttm > 0
    assert stats["dividend_yield_ttm"] == pytest.approx(ttm / body["last_close"])


def test_detail_without_dividends_has_null_yield_and_empty_list(client):
    stats = client.get("/api/stocks/BTC-USD").json()["stats"]
    assert stats["dividend_yield_ttm"] is None
    assert stats["dividends"] == []


def test_unknown_ticker_is_404(client):
    r = client.get("/api/stocks/NOPE.TO")
    assert r.status_code == 404


@pytest.mark.parametrize("range_", ["2Y", "1m", "", "ALL"])
def test_invalid_range_is_422(client, range_):
    r = client.get(f"/api/stocks/NVDA?range={range_}")
    assert r.status_code == 422
