"""Fake SEC / TMX / Yahoo Finance answers for the market tests (no network)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.data import http, universe, yf_market
from app.data.cache import ExternalUnavailable

SEC_BODY = {
    "fields": ["cik", "name", "ticker", "exchange"],
    "data": [
        [320193, "Apple Inc.", "AAPL", "Nasdaq"],
        [1045810, "NVIDIA CORP", "NVDA", "Nasdaq"],
        [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"],
        [1000275, "ROYAL BANK OF CANADA", "RY", "NYSE"],
        [999, "Société Générale ADR", "SCGLY", "OTC"],
        [998, "Delisted Corp", "DLST", None],
    ],
}

TSX_BODY = {"results": [
    {"symbol": "RY", "name": "Royal Bank of Canada",
     "instruments": [{"symbol": "RY", "name": "Royal Bank"}, {"symbol": "RY.PR.J", "name": "RBC Pr J"}]},
    {"symbol": "BBD.B", "name": "Bombardier Inc.",
     "instruments": [{"symbol": "BBD.A", "name": "Bombardier Cl A MV"},
                     {"symbol": "BBD.B", "name": "Bombardier Cl B SV"}]},
    {"symbol": "AP.UN", "name": "Allied Properties REIT",
     "instruments": [{"symbol": "AP.UN", "name": "Allied Un"}, {"symbol": "AP.DB.A", "name": "Allied Db"}]},
    {"symbol": "XIU", "name": "iShares S&P/TSX 60 Index ETF", "instruments": [{"symbol": "XIU", "name": "XIU"}]},
    {"symbol": "NVDA", "name": "NVIDIA CDR (CAD Hedged)", "instruments": [{"symbol": "NVDA", "name": "NVDA CDR"}]},
]}

TSXV_BODY = {"results": [
    {"symbol": "ONE", "name": "01 Quantum Inc.",
     "instruments": [{"symbol": "ONE", "name": "01 Quantum"}, {"symbol": "ONE.WT", "name": "01 Quantum Wt"}]},
]}


def install_universe(monkeypatch, *, sec: bool = True, tmx: bool = True) -> list[str]:
    """Serve the fake directories; returns the list of URLs fetched."""
    calls: list[str] = []

    def fake_get_json(source, url, **kwargs):
        calls.append(url)
        if "sec.gov" in url:
            if not sec:
                raise ExternalUnavailable(source, "HTTP 503")
            return SEC_BODY
        if not tmx:
            raise ExternalUnavailable(source, "HTTP 503")
        return TSXV_BODY if "/tsxv/" in url else TSX_BODY

    monkeypatch.setattr(http, "get_json", fake_get_json)
    universe.reset()
    return calls


def raw_quote(symbol: str, price: float, change_pct: float, name: str | None = None, **extra: Any) -> dict:
    change = price * change_pct / 100
    return {"symbol": symbol, "longName": name or f"{symbol} Inc.", "shortName": (name or symbol).upper(),
            "currency": "CAD" if symbol.endswith(".TO") else "USD", "regularMarketPrice": price,
            "regularMarketChange": change, "regularMarketChangePercent": change_pct,
            "regularMarketVolume": 1_000_000, "marketCap": 5e10, "quoteType": "EQUITY",
            "regularMarketTime": 1794603601, "exchangeTimezoneName": "America/New_York", **extra}


def business_days(end: datetime, count: int) -> list[datetime]:
    days, day = [], end
    while len(days) < count:
        if day.weekday() < 5:
            days.append(day)
        day -= timedelta(days=1)
    return sorted(days)


def chart(closes: list[float], *, end: datetime = datetime(2026, 11, 13, 14, 30, tzinfo=timezone.utc),
          dividends: list[tuple[datetime, float]] = (), instrument: str = "EQUITY", currency: str = "USD",
          name: str = "Apple Inc.", tz: str = "America/New_York") -> dict:
    """A v8 chart body with one bar per business day ending on `end` (14:30 UTC = 9:30 New York)."""
    days = business_days(end, len(closes))
    return {"chart": {"result": [{
        "meta": {"longName": name, "currency": currency, "fullExchangeName": "NasdaqGS",
                 "instrumentType": instrument, "exchangeTimezoneName": tz},
        "timestamp": [int(d.timestamp()) for d in days],
        "indicators": {"quote": [{"open": [c - 1 for c in closes], "high": [c + 2 for c in closes],
                                  "low": [c - 2 for c in closes], "close": list(closes),
                                  "volume": [1000 * (i + 1) for i in range(len(closes))]}]},
        "events": {"dividends": {str(int(d.timestamp())): {"amount": a, "date": int(d.timestamp())}
                                 for d, a in dividends}},
    }], "error": None}}


def spark(symbol: str, closes: list[float]) -> dict:
    return {"symbol": symbol, "response": [{"meta": {"symbol": symbol},
                                            "indicators": {"quote": [{"close": closes}]}}]}


def install_yahoo(monkeypatch, *, charts: dict[str, dict] | None = None, screens: dict[str, list[dict]] | None = None,
                  quotes: dict[str, dict] | None = None, sparks: dict[str, list[float]] | None = None,
                  profiles: dict[str, str] | None = None, down: bool = False) -> list[tuple[str, dict]]:
    """Answer yf_market's requests from the given tables; returns the (url, params) of each request."""
    calls: list[tuple[str, dict]] = []

    def fake_get(url: str, params: dict[str, str]):
        calls.append((url, params))
        if down:
            raise ExternalUnavailable(yf_market.SOURCE, "erreur réseau (ConnectError)")
        if "/v8/finance/chart/" in url:
            symbol = url.rsplit("/", 1)[1]
            if symbol in (charts or {}):
                return 200, charts[symbol]
            return 404, {"chart": {"result": None, "error": {"code": "Not Found"}}}
        if "/v7/finance/spark" in url:
            symbols = params["symbols"].split(",")
            return 200, {"spark": {"result": [spark(s, (sparks or {})[s]) for s in symbols if s in (sparks or {})]}}
        if "/v7/finance/quote" in url:
            symbols = params["symbols"].split(",")
            return 200, {"quoteResponse": {"result": [(quotes or {})[s] for s in symbols if s in (quotes or {})]}}
        if "/quoteSummary/" in url:
            symbol = url.rsplit("/", 1)[1]
            sector = (profiles or {}).get(symbol)
            return 200, {"quoteSummary": {"result": [{"assetProfile": {"sector": sector}}]}}
        raise AssertionError(f"unexpected Yahoo URL {url}")

    def fake_screen(spec, size):
        calls.append((f"screen:{spec.key}", {"size": size}))
        if down:
            raise ExternalUnavailable(yf_market.SOURCE, "filtre de titres indisponible (HTTPError)")
        return (screens or {}).get(spec.key, [])

    monkeypatch.setattr(yf_market, "_get", fake_get)
    monkeypatch.setattr(yf_market, "_run_screen", fake_screen)
    return calls
