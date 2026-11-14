"""Legacy `GET /api/stocks`: the starter kit's 31 assets at their last close, for the first dashboard.

Kept unchanged while the dashboard moves to the live sections (`GET /api/market/sections/{id}`);
remove it once no page calls it. Prices are the starter kit's daily closes (split-adjusted, with the
CNQ.TO correction of `app.data.starter`), read once per process.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Any

import pandas as pd

from app.data import starter

SPARKLINE_POINTS = 30
IDENTITY_FIELDS = ("ticker", "name", "asset_class", "market", "currency", "sector")


def _price(value: float) -> float:
    return round(float(value), 4)


@lru_cache(maxsize=1)
def _identities() -> dict[str, dict[str, str]]:
    u = starter.universe()
    return {str(row["ticker"]): {f: str(row[f]) for f in IDENTITY_FIELDS} for _, row in u.iterrows()}


def _closes(ticker: str) -> pd.Series:
    p = starter.prices()
    return p.loc[p["ticker"] == ticker].set_index("date").sort_index()["close"]


@lru_cache(maxsize=1)
def list_stocks() -> list[dict[str, Any]]:
    """The 31 assets in universe order, each with its last close, day change and last 30 closes."""
    out = []
    for ticker, identity in _identities().items():
        closes = _closes(ticker)
        last = float(closes.iloc[-1])
        prev = float(closes.iloc[-2]) if len(closes) > 1 else last
        change = last - prev
        out.append({**identity, "last_close": _price(last), "change_abs": _price(change),
                    "change_pct": round(change / prev * 100, 4) if prev else 0.0,
                    "as_of": closes.index[-1].date().isoformat(),
                    "sparkline": [_price(c) for c in closes.iloc[-SPARKLINE_POINTS:]]})
    return out
