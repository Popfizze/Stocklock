"""A fake Yahoo Finance for the profile features: quotes with volumes, one year of closes, the raw
screener (evaluated on a small table of companies), predefined screens, headlines and GDELT."""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.data import gdelt, universe, yf_live, yf_market
from app.data.cache import ExternalUnavailable
from tests.market_fakes import business_days, install_universe, raw_quote

END = datetime(2026, 11, 13, 21, 0, tzinfo=timezone.utc)

# Facts the fake screener knows: sector, ESG risk score, highest controversy level.
COMPANIES = {
    "AAPL": {"sector": "Technology", "esg_score": 17.2, "highest_controversy": 3},
    "NVDA": {"sector": "Technology", "esg_score": 12.5, "highest_controversy": 2},
    "XOM": {"sector": "Energy", "esg_score": 36.1, "highest_controversy": 2},
    "BAD": {"sector": "Financial Services", "esg_score": 28.0, "highest_controversy": 5},
    "JNJ": {"sector": "Healthcare", "esg_score": 22.4, "highest_controversy": 4},
    "RY": {"sector": "Financial Services", "esg_score": 21.0, "highest_controversy": 2},
    "BRK-B": {"sector": "Financial Services", "esg_score": 24.0, "highest_controversy": 1},
}


def steady(start: float, n: int = 252, wiggle: float = 0.01, drift: float = 0.0) -> list[float]:
    """Closes alternating ±wiggle around a slow drift: a daily σ close to `wiggle`."""
    out, price = [], start
    for i in range(n):
        price *= 1 + drift + (wiggle if i % 2 else -wiggle)
        out.append(round(price, 4))
    return out


def surge(start: float, n: int = 252, wiggle: float = 0.01, jump: float = 0.35) -> list[float]:
    """Steady closes, then a rise of `jump` over the last 5 sessions."""
    closes = steady(start, n - 5, wiggle)
    step = (1 + jump) ** (1 / 5)
    for _ in range(5):
        closes.append(round(closes[-1] * step, 4))
    return closes


def _match(row: dict[str, Any], q: dict[str, Any]) -> bool:
    op, args = q["operator"], q["operands"]
    if op == "and":
        return all(_match(row, a) for a in args)
    if op == "or":
        return any(_match(row, a) for a in args)
    value = row.get(args[0])
    if value is None:
        return False
    return {"eq": lambda: value == args[1], "gte": lambda: value >= args[1], "lte": lambda: value <= args[1],
            "lt": lambda: value < args[1], "gt": lambda: value > args[1],
            "btwn": lambda: args[1] <= value <= args[2], "is-in": lambda: value in args[1:]}[op]()


def install(monkeypatch, *, closes: dict[str, list[float]] | None = None, quotes: dict[str, dict] | None = None,
            screens: dict[str, list[dict]] | None = None, news: dict[str, list[dict]] | None = None,
            gdelt_counts: dict[str, list[float]] | None = None, companies: dict[str, dict] | None = None,
            screener_down: bool = False) -> list[tuple[str, Any]]:
    """Patch every Yahoo / GDELT access; returns the calls made."""
    install_universe(monkeypatch)
    calls: list[tuple[str, Any]] = []
    closes, quotes, companies = closes or {}, quotes or {}, companies if companies is not None else COMPANIES

    def fake_get(url: str, params: dict[str, str]):
        calls.append((url, params))
        if "/v7/finance/spark" in url:
            result = []
            for s in params["symbols"].split(","):
                if s not in closes:
                    continue
                series = closes[s] if params["range"] == "1y" else closes[s][-22:]
                days = business_days(END, len(series))
                result.append({"symbol": s, "response": [{
                    "meta": {"symbol": s, "exchangeTimezoneName": "America/New_York"},
                    "timestamp": [int(d.timestamp()) for d in days],
                    "indicators": {"quote": [{"close": series}]}}]})
            return 200, {"spark": {"result": result}}
        if "/v7/finance/quote" in url:
            return 200, {"quoteResponse": {"result": [quotes[s] for s in params["symbols"].split(",") if s in quotes]}}
        if "/quoteSummary/" in url:
            symbol = url.rsplit("/", 1)[1]
            if params.get("modules") == "esgScores":
                return 404, {"quoteSummary": {"result": None, "error": {"code": "Not Found"}}}
            return 200, {"quoteSummary": {"result": [{"assetProfile": {
                "sector": (companies.get(symbol) or {}).get("sector")}}]}}
        raise AssertionError(f"unexpected Yahoo URL {url}")

    def fake_post(url: str, body: dict[str, Any], params: dict[str, str]):
        calls.append((url, body))
        if screener_down:
            raise ExternalUnavailable(yf_market.SOURCE, "erreur réseau (ConnectError)")
        rows = [{"symbol": s} for s, facts in companies.items() if _match({"ticker": s, **facts}, body["query"])]
        return 200, {"finance": {"result": [{"total": len(rows), "quotes": rows[:body["size"]]}], "error": None}}

    def fake_screen(spec, size):
        calls.append((f"screen:{spec.key}", {"size": size, "filters": spec.filters}))
        return (screens or {}).get(spec.key.split("|")[0], [])

    def fake_news(symbol, count=None):
        if news is None or symbol not in news:
            raise ExternalUnavailable(yf_live.SOURCE, "réseau désactivé pendant les tests")
        return news[symbol], False

    def fake_timeline(ticker, name, start, end, *, cache_only=False, mode="timelinevolinfo", timeout_s=None):
        calls.append(("gdelt", {"ticker": ticker, "name": name, "cache_only": cache_only, "mode": mode}))
        if cache_only or not gdelt_counts or ticker not in gdelt_counts:
            raise ExternalUnavailable(gdelt.SOURCE, "limite de débit atteinte (HTTP 429)")
        values = gdelt_counts[ticker]
        first = end - timedelta(days=len(values) - 1)
        points = [{"date": (first + timedelta(days=i)).isoformat(), "value": v, "articles": []}
                  for i, v in enumerate(values)]
        return gdelt.Timeline(name, points, False, "https://api.gdeltproject.org/api/v2/doc/doc")

    monkeypatch.setattr(yf_market, "_get", fake_get)
    monkeypatch.setattr(yf_market, "_post", fake_post)
    monkeypatch.setattr(yf_market, "_run_screen", fake_screen)
    monkeypatch.setattr(yf_live, "recent_news", fake_news)
    monkeypatch.setattr(gdelt, "timeline", fake_timeline)
    universe.reset()
    return calls


def quote(symbol: str, price: float = 100.0, *, volume: float = 1e6, avg3m: float = 1e6, avg10d: float = 1e6,
          kind: str = "EQUITY", name: str | None = None, **extra: Any) -> dict[str, Any]:
    return raw_quote(symbol, price, 0.5, name, regularMarketVolume=volume, averageDailyVolume3Month=avg3m,
                     averageDailyVolume10Day=avg10d, quoteType=kind, **extra)


def headlines(per_day: dict[int, int], title: str = "Company update") -> list[dict[str, Any]]:
    """Headlines `per_day[k]` times on the day k days before 2026-11-14 (newest first)."""
    today = date(2026, 11, 14)
    return [{"title": f"{title} {k}-{i}", "date": (today - timedelta(days=k)).isoformat(), "url": None,
             "publisher": "Reuters"} for k in sorted(per_day) for i in range(per_day[k])]


def annual_vol(wiggle: float) -> float:
    return wiggle * math.sqrt(252)
