"""Quotes of the starter-kit universe for the « Tableau de bord »: quote list and per-ticker detail.

Prices are the starter kit's daily closes (split-adjusted, with the CNQ.TO correction of
`app.data.starter`). The day change compares the last close with the previous close of the
same ticker, so crypto (24/7) and TSX/US holidays never mix calendars. Everything is built
from the in-memory tables and cached: the CSVs are read once per process.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

import pandas as pd

from app.data import starter

Range = Literal["1W", "1M", "3M", "1Y", "MAX"]

RANGE_OFFSETS: dict[str, pd.DateOffset | None] = {
    "1W": pd.DateOffset(weeks=1),
    "1M": pd.DateOffset(months=1),
    "3M": pd.DateOffset(months=3),
    "1Y": pd.DateOffset(years=1),
    "MAX": None,
}

SPARKLINE_POINTS = 30
MAX_DIVIDENDS = 12
IDENTITY_FIELDS = ("ticker", "name", "asset_class", "market", "currency", "sector")


def _price(value: float) -> float:
    return round(float(value), 4)


@lru_cache(maxsize=1)
def _identities() -> dict[str, dict[str, str]]:
    u = starter.universe()
    return {str(row["ticker"]): {f: str(row[f]) for f in IDENTITY_FIELDS} for _, row in u.iterrows()}


@lru_cache(maxsize=64)
def _ohlcv(ticker: str) -> pd.DataFrame:
    """Daily open/high/low/close/volume of one ticker, indexed by date, oldest first."""
    p = starter.prices()
    rows = p.loc[p["ticker"] == ticker, ["date", "open", "high", "low", "close", "volume"]]
    return rows.set_index("date").sort_index()


@lru_cache(maxsize=64)
def _dividends(ticker: str) -> pd.Series:
    """Dividend per share by ex-date, most recent first."""
    a = starter.corporate_actions()
    rows = a.loc[(a["ticker"] == ticker) & (a["action"] == "dividend")]
    return rows.set_index("ex_date")["value"].sort_index(ascending=False)


def _quote(ticker: str) -> dict[str, Any]:
    """Last close, day change against the same ticker's previous close, and its date."""
    closes = _ohlcv(ticker)["close"]
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) > 1 else last
    change = last - prev
    return {
        "last_close": _price(last),
        "change_abs": _price(change),
        "change_pct": round(change / prev * 100, 4) if prev else 0.0,
        "as_of": closes.index[-1].date().isoformat(),
    }


def known(ticker: str) -> bool:
    return ticker in _identities()


@lru_cache(maxsize=1)
def list_stocks() -> list[dict[str, Any]]:
    """The 31 assets in universe order, each with its quote and its last 30 closes."""
    out = []
    for ticker, identity in _identities().items():
        closes = _ohlcv(ticker)["close"]
        out.append({**identity, **_quote(ticker),
                    "sparkline": [_price(c) for c in closes.iloc[-SPARKLINE_POINTS:]]})
    return out


def _stats(ticker: str, last_close: float) -> dict[str, Any]:
    df = _ohlcv(ticker)
    end = df.index[-1]
    last = df.iloc[-1]
    three_months = df.loc[df.index > end - pd.DateOffset(months=3), "volume"]
    year = df.loc[df.index > end - pd.Timedelta(weeks=52)]
    divs = _dividends(ticker)
    ttm = float(divs.loc[(divs.index > end - pd.DateOffset(years=1)) & (divs.index <= end)].sum())
    return {
        "open": _price(last["open"]),
        "high": _price(last["high"]),
        "low": _price(last["low"]),
        "volume": int(last["volume"]),
        "avg_volume_3m": round(float(three_months.mean())) if not three_months.empty else None,
        "high_52w": _price(year["high"].max()),
        "low_52w": _price(year["low"].min()),
        "dividend_yield_ttm": ttm / last_close if ttm > 0 and last_close > 0 else None,
        "dividends": [{"ex_date": d.date().isoformat(), "value": float(v)}
                      for d, v in divs.iloc[:MAX_DIVIDENDS].items()],
    }


def stock_detail(ticker: str, range_: Range = "1M") -> dict[str, Any]:
    """Identity, quote, closes over `range_` and key figures of one asset (KeyError if unknown)."""
    identity = _identities()[ticker]
    quote = _quote(ticker)
    closes = _ohlcv(ticker)["close"]
    offset = RANGE_OFFSETS[range_]
    if offset is not None:
        closes = closes.loc[closes.index >= closes.index[-1] - offset]
    return {
        **identity,
        **quote,
        "points": [{"date": d.date().isoformat(), "close": _price(c)} for d, c in closes.items()],
        "stats": _stats(ticker, quote["last_close"]),
    }
