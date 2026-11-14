"""A stock's page, on live data: identity, last price and day change, closes over a range, key figures.

Any title of the universe (SEC + TMX) can be opened; a symbol outside it that Yahoo Finance knows (the
starter kit's cryptos, for instance) is served too, flagged `in_universe: false`. The whole daily
history comes from Yahoo Finance in one request (cached 15 min), so switching the chart's range does
not hit the network again. The day change compares the last close with the previous one of the same
symbol, so crypto (24/7) and exchange holidays never mix calendars.
"""

from __future__ import annotations

from typing import Any, Literal

import pandas as pd

from app.data import starter, universe, yf_market
from app.data.cache import ExternalUnavailable

Range = Literal["1W", "1M", "3M", "1Y", "MAX"]

RANGE_OFFSETS: dict[str, pd.DateOffset | None] = {
    "1W": pd.DateOffset(weeks=1),
    "1M": pd.DateOffset(months=1),
    "3M": pd.DateOffset(months=3),
    "1Y": pd.DateOffset(years=1),
    "MAX": None,
}

MAX_DIVIDENDS = 12
ASSET_CLASSES = {"EQUITY": "equity", "ETF": "etf", "CRYPTOCURRENCY": "crypto", "MUTUALFUND": "fund",
                 "INDEX": "index", "CURRENCY": "currency", "FUTURE": "future"}
# Shown in place of a sector: an ETF or a crypto has none, Yahoo may not know a small company's.
NO_SECTOR = {"ETF": "Non applicable (FNB)", "CRYPTOCURRENCY": "Non applicable (cryptoactif)",
             "MUTUALFUND": "Non applicable (fonds)"}
SOURCE = {"id": "yahoo_finance", "title": "Yahoo Finance (cours quotidiens, différés)",
          "url": "https://finance.yahoo.com/"}


def _price(value: float) -> float:
    return round(float(value), 4)


def _frame(history: dict[str, Any]) -> pd.DataFrame:
    """Daily open/high/low/close/volume indexed by date, oldest first, one row per day."""
    df = pd.DataFrame(history["rows"], columns=["date", "open", "high", "low", "close", "volume"])
    df["date"] = pd.to_datetime(df["date"])
    df = df.drop_duplicates("date", keep="last").set_index("date").sort_index()
    for col in ("open", "high", "low"):
        df[col] = df[col].fillna(df["close"])
    df["volume"] = df["volume"].fillna(0)
    return df


def _dividends(history: dict[str, Any]) -> pd.Series:
    """Dividend per share by ex-date, most recent first."""
    if not history.get("dividends"):
        return pd.Series(dtype=float, index=pd.DatetimeIndex([]))
    s = pd.Series({pd.Timestamp(d): float(v) for d, v in history["dividends"]})
    return s.sort_index(ascending=False)


def _quote(df: pd.DataFrame) -> dict[str, Any]:
    closes = df["close"]
    last = float(closes.iloc[-1])
    prev = float(closes.iloc[-2]) if len(closes) > 1 else last
    change = last - prev
    return {
        "last_close": _price(last),
        "change_abs": _price(change),
        "change_pct": round(change / prev * 100, 4) if prev else 0.0,
        "as_of": closes.index[-1].date().isoformat(),
    }


def _stats(df: pd.DataFrame, divs: pd.Series, last_close: float) -> dict[str, Any]:
    end = df.index[-1]
    last = df.iloc[-1]
    three_months = df.loc[df.index > end - pd.DateOffset(months=3), "volume"]
    year = df.loc[df.index > end - pd.Timedelta(weeks=52)]
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


def _market_label(instrument: str, exchange: str | None) -> str:
    return "Cryptoactif (24/7)" if instrument == "CRYPTOCURRENCY" else (exchange or "")


def _listing(symbol: str) -> universe.Listing | None:
    try:
        return universe.get(symbol)
    except ExternalUnavailable:
        return None  # the universe is down: the page still works from Yahoo's own identity


def stock_detail(ticker: str, range_: Range = "1M") -> dict[str, Any]:
    """Identity, quote, closes over `range_` and key figures of one title.

    Raises yf_market.NotFound when Yahoo Finance has no price for the symbol, ExternalUnavailable when
    it cannot be reached.
    """
    symbol = ticker.strip().upper()
    listing = _listing(symbol)
    history = yf_market.history(symbol)
    meta = history["meta"]
    df = _frame(history)
    quote = _quote(df)
    closes = df["close"]
    offset = RANGE_OFFSETS[range_]
    if offset is not None:
        closes = closes.loc[closes.index >= closes.index[-1] - offset]
    instrument = str(meta.get("instrument_type") or "").upper()
    sector = (yf_market.profile(symbol).get("sector") if instrument == "EQUITY" else None)         or NO_SECTOR.get(instrument, "Non disponible")
    return {
        "ticker": symbol,
        "name": meta.get("name") or (listing.name if listing else symbol),
        "asset_class": ASSET_CLASSES.get(instrument, instrument.lower() or "unknown"),
        "market": listing.exchange if listing else _market_label(instrument, meta.get("exchange")),
        "currency": meta.get("currency") or ("CAD" if symbol.endswith((".TO", ".V")) else "USD"),
        "sector": sector,
        "in_universe": listing is not None,
        "starter_kit": starter.in_starter(symbol),
        **quote,
        "points": [{"date": d.date().isoformat(), "close": _price(c)} for d, c in closes.items()],
        "stats": _stats(df, _dividends(history), quote["last_close"]),
        "source": SOURCE,
    }
