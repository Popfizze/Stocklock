"""Live Yahoo Finance access via yfinance: identification, daily prices, recent news."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd

from app.data import cache
from app.data.cache import ExternalUnavailable

SOURCE = "Yahoo Finance (yfinance)"


def _ticker(symbol: str):
    import yfinance as yf

    return yf.Ticker(symbol)


def info(symbol: str) -> dict:
    """Name, exchange, currency, sector of a symbol outside the starter universe."""
    def _fetch() -> dict:
        try:
            raw = _ticker(symbol).info or {}
        except Exception as exc:
            raise ExternalUnavailable(SOURCE, f"identification impossible ({type(exc).__name__})") from exc
        if not raw.get("quoteType") or not (raw.get("longName") or raw.get("shortName")):
            raise ExternalUnavailable(SOURCE, f"symbole {symbol} inconnu de Yahoo Finance")
        return {
            "name": raw.get("longName") or raw.get("shortName"),
            "market": raw.get("exchange"),
            "currency": raw.get("currency"),
            "financial_currency": raw.get("financialCurrency"),
            "sector": raw.get("sector"),
            "quote_type": raw.get("quoteType"),
        }

    value, _ = cache.cached("yfinance", f"info|{symbol}", 7 * 86400, _fetch)
    return value


def daily_prices(symbol: str, start: date, end: date) -> tuple[pd.DataFrame, bool]:
    """Daily rows (date, close, adj_close, volume) downloaded live, cached 6 h."""
    def _fetch() -> list[dict]:
        try:
            frame = _ticker(symbol).history(start=start.isoformat(), end=end.isoformat(),
                                            auto_adjust=False, actions=False)
        except Exception as exc:
            raise ExternalUnavailable(SOURCE, f"téléchargement des prix impossible ({type(exc).__name__})") from exc
        if frame is None or frame.empty:
            raise ExternalUnavailable(SOURCE, f"aucun prix renvoyé pour {symbol}")
        adj_col = "Adj Close" if "Adj Close" in frame.columns else "Close"
        rows = []
        for ts, r in frame.iterrows():
            rows.append({"date": ts.date().isoformat() if hasattr(ts, "date") else str(ts)[:10],
                         "close": float(r["Close"]), "adj_close": float(r[adj_col]),
                         "volume": float(r.get("Volume", 0) or 0)})
        return rows

    rows, hit = cache.cached("yfinance", f"history|{symbol}|{start}|{end}", 6 * 3600, _fetch)
    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    return df, hit


def recent_news(symbol: str) -> tuple[list[dict], bool]:
    """Recent headlines (Yahoo keeps only a short recent list; no tone, no history)."""
    def _fetch() -> list[dict]:
        try:
            items = _ticker(symbol).news or []
        except Exception as exc:
            raise ExternalUnavailable(SOURCE, f"actualités indisponibles ({type(exc).__name__})") from exc
        out = []
        for it in items:
            content = it.get("content") if isinstance(it.get("content"), dict) else it
            title = content.get("title")
            when = content.get("pubDate") or content.get("displayTime")
            if not when and it.get("providerPublishTime"):
                when = datetime.fromtimestamp(int(it["providerPublishTime"]), tz=timezone.utc).isoformat()
            url = ((content.get("canonicalUrl") or {}).get("url") if isinstance(content.get("canonicalUrl"), dict)
                   else None) or content.get("link")
            provider = content.get("provider")
            publisher = provider.get("displayName") if isinstance(provider, dict) else it.get("publisher")
            if title and when:
                out.append({"title": title, "date": str(when)[:10], "url": url, "publisher": publisher})
        return out

    value, hit = cache.cached("yfinance", f"news|{symbol}", 3 * 3600, _fetch)
    return value, hit
