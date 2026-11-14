"""GDELT DOC 2.0 API: news volume and tone around a company.

One `tonechart` request gives both the article count (sum of bins) and the average tone
(count-weighted bin mean), plus a few top articles used as sources. GDELT asks for at most one
request every 5 seconds; a process-wide throttle enforces it.
"""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from urllib.parse import urlencode

from app.config import get_settings
from app.data import cache
from app.data.cache import ExternalUnavailable
from app.data.http import get_json

SOURCE = "GDELT DOC 2.0"
API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
MIN_INTERVAL_S = 5.5
COOLDOWN_S = 60.0  # after a refusal, fail fast instead of waiting ~15 s for another 429

_lock = threading.Lock()
_last_call = 0.0
_cooldown_until = 0.0

# Short, unambiguous names used in news text.
NAME_OVERRIDES = {
    "GOOGL": "Alphabet",
    "RY.TO": "Royal Bank of Canada",
    "TD.TO": "TD Bank",
    "MFC.TO": "Manulife",
    "CNQ.TO": "Canadian Natural Resources",
    "CNR.TO": "Canadian National Railway",
    "ATD.TO": "Couche-Tard",
    "CSU.TO": "Constellation Software",
    "JPM": "JPMorgan",
    "JNJ": "Johnson & Johnson",
    "PG": "Procter & Gamble",
    "XOM": "Exxon",
    "BTC-USD": "Bitcoin",
    "ETH-USD": "Ethereum",
}


@dataclass
class NewsSummary:
    query: str
    start: date
    end: date
    article_count: int
    avg_tone: float | None
    top_articles: list[dict] = field(default_factory=list)
    from_cache: bool = False
    url: str = ""


def query_for(ticker: str, name: str) -> str:
    base = NAME_OVERRIDES.get(ticker) or re.sub(r"\s*\(.*?\)", "", name).strip()
    if ticker in {"BTC-USD", "ETH-USD"}:
        return f'"{base}" (price OR market OR investors) sourcelang:english'
    return f'"{base}" (stock OR shares OR earnings OR investors) sourcelang:english'


def summarize_tonechart(payload: dict) -> tuple[int, float | None, list[dict]]:
    bins = payload.get("tonechart", []) or []
    total = sum(int(b.get("count", 0)) for b in bins)
    tone = (sum(float(b["bin"]) * int(b.get("count", 0)) for b in bins) / total) if total else None
    tops: list[dict] = []
    for b in sorted(bins, key=lambda x: int(x.get("count", 0)), reverse=True)[:3]:
        for art in (b.get("toparts") or [])[:1]:
            tops.append({"title": art.get("title", "").strip(), "url": art.get("url"), "tone_bin": b["bin"]})
    return total, tone, tops


def _throttled_get(params: dict[str, str]) -> dict:
    global _last_call, _cooldown_until
    with _lock:
        remaining = _cooldown_until - time.monotonic()
        if remaining > 0:
            raise ExternalUnavailable(SOURCE, f"en pause après un refus récent, nouvel essai possible dans "
                                              f"{remaining:.0f} s")
        wait = MIN_INTERVAL_S - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        try:
            return get_json(SOURCE, API_URL, params=params, timeout_s=get_settings().gdelt_timeout_s,
                            headers={"User-Agent": "StockLock datathon research"})
        except ExternalUnavailable:
            _cooldown_until = time.monotonic() + COOLDOWN_S
            raise
        finally:
            _last_call = time.monotonic()


def news_summary(ticker: str, name: str, start: date, end: date) -> NewsSummary:
    """Raises cache.ExternalUnavailable when GDELT cannot answer."""
    query = query_for(ticker, name)
    params = {
        "query": query,
        "mode": "tonechart",
        "format": "json",
        "startdatetime": datetime.combine(start, datetime.min.time()).strftime("%Y%m%d%H%M%S"),
        "enddatetime": datetime.combine(end + timedelta(days=1), datetime.min.time()).strftime("%Y%m%d%H%M%S"),
    }
    key = "|".join(f"{k}={params[k]}" for k in sorted(params))
    payload, hit = cache.cached("gdelt", key, 12 * 3600, lambda: _throttled_get(params))
    total, tone, tops = summarize_tonechart(payload)
    return NewsSummary(query, start, end, total, tone, tops, hit, API_URL + "?" + urlencode(params))


@dataclass
class Timeline:
    query: str
    points: list[dict]          # {"date": "YYYY-MM-DD", "value": intensity, "articles": [...]}
    from_cache: bool
    url: str


def parse_timeline(payload: dict) -> list[dict]:
    series = (payload.get("timeline") or [{}])[0].get("data", []) if payload.get("timeline") else []
    points = []
    for p in series:
        raw = str(p.get("date", ""))
        day = f"{raw[0:4]}-{raw[4:6]}-{raw[6:8]}" if len(raw) >= 8 else raw
        arts = [{"title": (a.get("title") or "").strip(), "url": a.get("url")} for a in (p.get("toparts") or [])]
        points.append({"date": day, "value": float(p.get("value", 0) or 0), "articles": arts})
    return points


def timeline(ticker: str, name: str, start: date, end: date) -> Timeline:
    """Daily coverage intensity (% of all monitored articles) with top articles per day."""
    query = query_for(ticker, name)
    params = {
        "query": query,
        "mode": "timelinevolinfo",
        "format": "json",
        "startdatetime": datetime.combine(start, datetime.min.time()).strftime("%Y%m%d%H%M%S"),
        "enddatetime": datetime.combine(end + timedelta(days=1), datetime.min.time()).strftime("%Y%m%d%H%M%S"),
    }
    key = "|".join(f"{k}={params[k]}" for k in sorted(params))
    payload, hit = cache.cached("gdelt", key, 12 * 3600, lambda: _throttled_get(params))
    return Timeline(query, parse_timeline(payload), hit, API_URL + "?" + urlencode(params))
