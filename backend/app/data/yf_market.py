"""Live Yahoo Finance market data: screeners, batched quotes and sparklines, full daily history, profile.

Requests go through yfinance's own session (browser impersonation; cookie and crumb handled by
yfinance). Results are cached on disk (`app.data.cache`): screeners and quotes 5 min, sparklines and
daily histories 15 min, one-year daily closes 6 h, company profiles (sector) 7 days. Sparklines, quotes
and one-year closes are cached per symbol, so a symbol shared by two sections is downloaded once.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal
from zoneinfo import ZoneInfo

from app.data import cache
from app.data.cache import ExternalUnavailable

SOURCE = "Yahoo Finance"
QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
SPARK_URL = "https://query1.finance.yahoo.com/v7/finance/spark"
CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
PROFILE_URL = "https://query2.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
SCREENER_URL = "https://query1.finance.yahoo.com/v1/finance/screener"
TIMEOUT_S = 15
SPARK_BATCH = 20   # Yahoo refuses more than 20 symbols per spark request
QUOTE_BATCH = 50
WORKERS = 4
SCREEN_TTL_S = 5 * 60
QUOTE_TTL_S = 5 * 60
SPARK_TTL_S = 15 * 60
HISTORY_TTL_S = 15 * 60
CLOSES_TTL_S = 6 * 3600
PROFILE_TTL_S = 7 * 86400


class NotFound(Exception):
    """Yahoo Finance has no data for this symbol."""


@dataclass(frozen=True)
class Screen:
    """A Yahoo screener: a predefined one (`most_actives`…) or a custom equity/ETF query.

    `filters` adds conditions as (operator, field, *values): ("is-in", "sector", "Utilities", ...),
    ("lt", "beta", 0.8), ("btwn", "esg_score", 0, 20)."""
    key: str
    predefined: str | None = None
    kind: Literal["equity", "etf"] = "equity"
    region: str | None = None
    exchanges: tuple[str, ...] = ()
    min_market_cap: float | None = None
    sort_field: str = "dayvolume"
    sort_asc: bool = False
    filters: tuple[tuple[Any, ...], ...] = ()


# --- Low-level access (patched in tests) -----------------------------------------------------------

def _get(url: str, params: dict[str, str]) -> tuple[int, Any]:
    """(HTTP status, JSON body) through yfinance's session."""
    from yfinance.data import YfData

    try:
        response = YfData().get(url=url, params=params, timeout=TIMEOUT_S)
    except Exception as exc:  # curl_cffi / yfinance raise their own types
        raise ExternalUnavailable(SOURCE, f"erreur réseau ({type(exc).__name__})") from exc
    if response.status_code == 429:
        raise ExternalUnavailable(SOURCE, "limite de débit atteinte (HTTP 429)")
    try:
        return response.status_code, response.json()
    except ValueError as exc:
        raise ExternalUnavailable(SOURCE, f"réponse non JSON (HTTP {response.status_code})") from exc


def _post(url: str, body: dict[str, Any], params: dict[str, str]) -> tuple[int, Any]:
    """(HTTP status, JSON body) of a POST through yfinance's session (the raw screener)."""
    from yfinance.data import YfData

    try:
        response = YfData().post(url, body=body, params=params, timeout=TIMEOUT_S)
    except Exception as exc:
        raise ExternalUnavailable(SOURCE, f"erreur réseau ({type(exc).__name__})") from exc
    if response.status_code == 429:
        raise ExternalUnavailable(SOURCE, "limite de débit atteinte (HTTP 429)")
    try:
        return response.status_code, response.json()
    except ValueError as exc:
        raise ExternalUnavailable(SOURCE, f"réponse non JSON (HTTP {response.status_code})") from exc


def _run_screen(screen: Screen, size: int) -> list[dict[str, Any]]:
    """Raw quotes of a screener (yfinance builds the query and its POST body)."""
    import yfinance as yf
    from yfinance import EquityQuery
    from yfinance.screener.query import ETFQuery

    try:
        if screen.predefined:
            result = yf.screen(screen.predefined, count=size)
        else:
            query_type = ETFQuery if screen.kind == "etf" else EquityQuery
            parts = []
            if screen.region:
                parts.append(query_type("eq", ["region", screen.region]))
            if screen.exchanges:
                parts.append(query_type("is-in", ["exchange", *screen.exchanges]))
            if screen.min_market_cap:
                parts.append(query_type("gte", ["intradaymarketcap", screen.min_market_cap]))
            for operator, field, *values in screen.filters:
                parts.append(query_type(operator, [field, *values]))
            query = parts[0] if len(parts) == 1 else query_type("and", parts)
            result = yf.screen(query, sortField=screen.sort_field, sortAsc=screen.sort_asc, size=size)
    except Exception as exc:
        raise ExternalUnavailable(SOURCE, f"filtre de titres indisponible ({type(exc).__name__})") from exc
    return list((result or {}).get("quotes") or [])


# --- Helpers -----------------------------------------------------------------------------------------

def _num(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None  # NaN -> None


def market_date(epoch: Any, tz_name: str | None) -> str | None:
    """Calendar date of a Yahoo timestamp in the exchange's time zone."""
    seconds = _num(epoch)
    if seconds is None:
        return None
    try:
        tz = ZoneInfo(tz_name) if tz_name else timezone.utc
    except (KeyError, ValueError):
        tz = timezone.utc
    return datetime.fromtimestamp(seconds, tz=tz).date().isoformat()


def normalize_quote(raw: dict[str, Any]) -> dict[str, Any]:
    """The fields a stock card needs, from a v7 quote or a screener row."""
    return {
        "symbol": str(raw.get("symbol") or "").upper(),
        "name": raw.get("longName") or raw.get("shortName") or raw.get("displayName"),
        "short_name": raw.get("shortName"),
        "currency": raw.get("currency"),
        "price": _num(raw.get("regularMarketPrice")),
        "change_abs": _num(raw.get("regularMarketChange")),
        "change_pct": _num(raw.get("regularMarketChangePercent")),
        "volume": _num(raw.get("regularMarketVolume")),
        "market_cap": _num(raw.get("marketCap")),
        "as_of": market_date(raw.get("regularMarketTime"), raw.get("exchangeTimezoneName")),
        "quote_type": raw.get("quoteType"),
        "avg_volume_3m": _num(raw.get("averageDailyVolume3Month")),
        "avg_volume_10d": _num(raw.get("averageDailyVolume10Day")),
    }


def _batches(items: list[str], size: int) -> list[list[str]]:
    return [items[i:i + size] for i in range(0, len(items), size)]


def _per_symbol(namespace: str, ttl_s: float, symbols: Iterable[str], batch_size: int,
                fetch_batch: Callable[[list[str]], dict[str, Any]]) -> dict[str, Any]:
    """Cached values for `symbols`; the missing ones are fetched in parallel batches and cached one by one."""
    wanted = list(dict.fromkeys(s.upper() for s in symbols if s))
    out: dict[str, Any] = {}
    missing = []
    for symbol in wanted:
        hit = cache.read(namespace, symbol, ttl_s)
        if hit is not None:
            out[symbol] = hit
        else:
            missing.append(symbol)
    if not missing:
        return out
    batches = _batches(missing, batch_size)
    errors: list[ExternalUnavailable] = []

    def run(batch: list[str]) -> dict[str, Any]:
        try:
            return fetch_batch(batch)
        except ExternalUnavailable as exc:
            errors.append(exc)
            return {}

    with ThreadPoolExecutor(max_workers=min(WORKERS, len(batches))) as pool:
        for fetched in pool.map(run, batches):
            for symbol, value in fetched.items():
                cache.write(namespace, symbol, value)
                out[symbol] = value
    if errors and not out:
        raise errors[0]
    return out


# --- Public API --------------------------------------------------------------------------------------

def screen(spec: Screen, size: int) -> list[dict[str, Any]]:
    """Normalized quotes of a screener, in the screener's order (cached 5 min)."""
    def _fetch() -> list[dict[str, Any]]:
        return [normalize_quote(q) for q in _run_screen(spec, size)]

    value, _ = cache.cached("yahoo-screen", f"{spec.key}|{size}", SCREEN_TTL_S, _fetch)
    return value


def quotes(symbols: Iterable[str]) -> dict[str, dict[str, Any]]:
    """Normalized quotes by symbol (v7 quote, batches of 50, cached 5 min per symbol)."""
    def fetch_batch(batch: list[str]) -> dict[str, Any]:
        status, body = _get(QUOTE_URL, {"symbols": ",".join(batch)})
        if status >= 400:
            raise ExternalUnavailable(SOURCE, f"cotations indisponibles (HTTP {status})")
        rows = ((body or {}).get("quoteResponse") or {}).get("result") or []
        return {q["symbol"]: q for q in (normalize_quote(r) for r in rows) if q["symbol"]}

    return _per_symbol("yahoo-quote", QUOTE_TTL_S, symbols, QUOTE_BATCH, fetch_batch)


def sparklines(symbols: Iterable[str]) -> dict[str, list[float]]:
    """Daily closes over the last month by symbol (spark, batches of 20, cached 15 min per symbol)."""
    def fetch_batch(batch: list[str]) -> dict[str, Any]:
        status, body = _get(SPARK_URL, {"symbols": ",".join(batch), "range": "1mo", "interval": "1d"})
        if status >= 400:
            raise ExternalUnavailable(SOURCE, f"mini-graphiques indisponibles (HTTP {status})")
        out = {}
        for item in ((body or {}).get("spark") or {}).get("result") or []:
            response = (item.get("response") or [{}])[0]
            closes = (((response.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
            values = [round(c, 4) for c in (_num(v) for v in closes) if c is not None]
            if values:
                out[str(item.get("symbol")).upper()] = values
        return out

    return _per_symbol("yahoo-spark", SPARK_TTL_S, symbols, SPARK_BATCH, fetch_batch)


def closes_1y(symbols: Iterable[str]) -> dict[str, list[list[Any]]]:
    """One year of daily closes by symbol, [[date, close], ...] oldest first (spark, batches of 20, 6 h).

    Enough for a one-year volatility and a one-month return of up to a hundred titles in a few requests."""
    def fetch_batch(batch: list[str]) -> dict[str, Any]:
        status, body = _get(SPARK_URL, {"symbols": ",".join(batch), "range": "1y", "interval": "1d"})
        if status >= 400:
            raise ExternalUnavailable(SOURCE, f"cours d'un an indisponibles (HTTP {status})")
        out = {}
        for item in ((body or {}).get("spark") or {}).get("result") or []:
            response = (item.get("response") or [{}])[0]
            tz = (response.get("meta") or {}).get("exchangeTimezoneName")
            closes = (((response.get("indicators") or {}).get("quote") or [{}])[0]).get("close") or []
            rows = [[market_date(ts, tz), round(c, 6)]
                    for ts, c in zip(response.get("timestamp") or [], (_num(v) for v in closes)) if c is not None]
            if rows:
                out[str(item.get("symbol")).upper()] = rows
        return out

    return _per_symbol("yahoo-closes-1y", CLOSES_TTL_S, symbols, SPARK_BATCH, fetch_batch)


def screen_raw(query: dict[str, Any], size: int, *, quote_type: str = "EQUITY",
               sort_field: str = "intradaymarketcap") -> list[dict[str, Any]]:
    """Raw rows of a screener query given as Yahoo's own JSON (fields yfinance does not allow, as `ticker`)."""
    body = {"offset": 0, "size": size, "sortField": sort_field, "sortType": "DESC", "quoteType": quote_type,
            "query": query, "userId": "", "userIdType": "guid"}
    status, payload = _post(SCREENER_URL, body, {"corsDomain": "finance.yahoo.com", "formatted": "false",
                                                 "lang": "en-US", "region": "US"})
    finance = (payload or {}).get("finance") or {}
    if status >= 400 or finance.get("error"):
        raise ExternalUnavailable(SOURCE, f"filtre de titres indisponible (HTTP {status})")
    return list(((finance.get("result") or [{}])[0] or {}).get("quotes") or [])


def history(symbol: str) -> dict[str, Any]:
    """Whole daily history of a symbol, with its dividends and identity (cached 15 min).

    {"meta": {name, currency, exchange, instrument_type, timezone},
     "rows": [[date, open, high, low, close, volume], ...] oldest first,
     "dividends": [[ex_date, amount], ...] oldest first}
    Raises NotFound when Yahoo has no data for the symbol.
    """
    def _fetch() -> dict[str, Any]:
        now = int(datetime.now(tz=timezone.utc).timestamp())
        status, body = _get(CHART_URL.format(symbol=symbol),
                            {"period1": "-2208994789", "period2": str(now), "interval": "1d",
                             "events": "div,splits", "includePrePost": "false"})
        result = (((body or {}).get("chart") or {}).get("result") or [None])[0]
        if status == 404 or (status < 400 and not result):
            return {"not_found": True}
        if status >= 400:
            raise ExternalUnavailable(SOURCE, f"historique indisponible (HTTP {status})")
        return _parse_chart(result)

    value, _ = cache.cached("yahoo-history", symbol, HISTORY_TTL_S, _fetch)
    if value.get("not_found") or not value.get("rows"):
        raise NotFound(symbol)
    return value


def _parse_chart(result: dict[str, Any]) -> dict[str, Any]:
    meta = result.get("meta") or {}
    tz = meta.get("exchangeTimezoneName")
    quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    rows = []
    for i, ts in enumerate(result.get("timestamp") or []):
        def at(field: str) -> float | None:
            values = quote.get(field) or []
            return _num(values[i]) if i < len(values) else None

        close = at("close")
        if close is None:
            continue
        rows.append([market_date(ts, tz), at("open"), at("high"), at("low"), close, at("volume")])
    dividends = sorted(
        [market_date(d.get("date"), tz), _num(d.get("amount"))]
        for d in ((result.get("events") or {}).get("dividends") or {}).values()
        if _num(d.get("amount"))
    )
    return {"meta": {"name": meta.get("longName") or meta.get("shortName"), "currency": meta.get("currency"),
                     "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
                     "instrument_type": meta.get("instrumentType"), "timezone": tz},
            "rows": rows, "dividends": dividends}


def profile(symbol: str) -> dict[str, Any]:
    """Sector and industry (best effort: an empty dict when Yahoo has none or cannot be reached)."""
    def _fetch() -> dict[str, Any]:
        status, body = _get(PROFILE_URL.format(symbol=symbol), {"modules": "assetProfile"})
        if status >= 400 and status != 404:
            raise ExternalUnavailable(SOURCE, f"profil indisponible (HTTP {status})")
        result = (((body or {}).get("quoteSummary") or {}).get("result") or [{}])[0] or {}
        asset = result.get("assetProfile") or {}
        return {"sector": asset.get("sector"), "industry": asset.get("industry")}

    try:
        value, _ = cache.cached("yahoo-profile", symbol, PROFILE_TTL_S, _fetch)
    except ExternalUnavailable:
        return {}
    return value
