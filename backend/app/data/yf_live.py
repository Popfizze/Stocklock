"""Live Yahoo Finance access via yfinance: identification, daily prices, recent news."""

from __future__ import annotations

from datetime import date, datetime, timezone

import pandas as pd

from app.data import cache
from app.data.cache import ExternalUnavailable

SOURCE = "Yahoo Finance (yfinance)"


class NoQuotes(LookupError):
    """Yahoo answered and knows the symbol, but it has no session in the period asked (listed later,
    or no longer traded): not an outage. `first` is the symbol's first trading day when Yahoo gives it."""

    def __init__(self, symbol: str, start: date, end: date, first: date | None) -> None:
        super().__init__(f"aucune cotation de {symbol} entre {start} et {end}")
        self.symbol, self.start, self.end, self.first = symbol, start, end, first


def _first_trade_date(ticker) -> date | None:
    """The symbol's first trading day: from the metadata Yahoo sends with a history answer, else from its
    whole history at a coarse step (one more request, only made when a period came back empty). None when
    Yahoo does not know the symbol or cannot be reached."""
    try:
        value = (ticker.history_metadata or {}).get("firstTradeDate")
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(int(value), tz=timezone.utc).date()
        if value is not None:
            return pd.Timestamp(value).date()
    except Exception:
        pass
    try:
        whole = ticker.history(period="max", interval="3mo", auto_adjust=False, actions=False)
        if whole is None or whole.empty:
            return None
        bar = pd.Timestamp(whole.index[0]).date()  # the first quarterly bar: its start, not the first session
    except Exception:
        return None
    try:
        days = ticker.history(start=bar.isoformat(), end=(pd.Timestamp(bar) + pd.Timedelta(days=100)).date().isoformat(),
                              auto_adjust=False, actions=False)
        if days is not None and not days.empty:
            return pd.Timestamp(days.index[0]).date()
    except Exception:
        pass
    return bar


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
        ticker = _ticker(symbol)
        try:
            frame = ticker.history(start=start.isoformat(), end=end.isoformat(),
                                   auto_adjust=False, actions=False)
        except Exception as exc:
            raise ExternalUnavailable(SOURCE, f"téléchargement des prix impossible ({type(exc).__name__})") from exc
        if frame is None or frame.empty:
            # Yahoo knows the symbol (it dates its first session): the period is empty, the source is fine.
            first = _first_trade_date(ticker)
            if first is not None:
                raise NoQuotes(symbol, start, end, first)
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


def recent_news(symbol: str, count: int | None = None) -> tuple[list[dict], bool]:
    """Recent headlines (Yahoo keeps only a short recent list; no tone, no history); `count` asks for more."""
    def _fetch() -> list[dict]:
        try:
            ticker = _ticker(symbol)
            items = (ticker.get_news(count=count) if count else ticker.news) or []
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

    value, hit = cache.cached("yfinance", f"news|{symbol}" + (f"|{count}" if count else ""), 3 * 3600, _fetch)
    return value, hit
