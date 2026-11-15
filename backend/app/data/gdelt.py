"""GDELT DOC 2.0 API: news volume and tone around a company.

One `tonechart` request gives both the article count (sum of bins) and the average tone
(count-weighted bin mean), plus a few top articles used as sources. GDELT asks for at most one
request every 5 seconds; a process-wide throttle enforces it. Inside `deadline_scope(deadline)` (the
stock page's time budget) a call never waits beyond the deadline: when GDELT is busy or its next slot
comes too late, it gives up at once (OverBudget), without counting as a refusal.
"""

from __future__ import annotations

import re
import threading
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from urllib.parse import urlencode

from app.config import get_settings
from app.data import cache
from app.data.cache import ExternalUnavailable, OverBudget
from app.data.http import get_json

SOURCE = "GDELT DOC 2.0"
API_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
MIN_INTERVAL_S = 5.5
COOLDOWN_S = 300.0  # after a refusal, fail fast instead of waiting ~15 s for another 429
COOLDOWN_MAX_S = 1800.0  # refusals in a row double the pause, up to 30 min; an answer resets it
TIMELINE_TTL_S = 12 * 3600

_lock = threading.Lock()
_local = threading.local()  # this thread's deadline (deadline_scope)
_last_call = 0.0
_cooldown_until = 0.0
_refusals = 0  # in a row

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
    bins: list[dict] = field(default_factory=list)  # raw tonechart bins: bin, count, toparts


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


@contextmanager
def deadline_scope(deadline: float | None) -> Iterator[None]:
    """Within the block, this thread's GDELT requests never wait past `deadline` (time.monotonic())."""
    previous = getattr(_local, "deadline", None)
    _local.deadline = deadline
    try:
        yield
    finally:
        _local.deadline = previous


def _throttled_get(params: dict[str, str], timeout_s: float | None = None) -> dict:
    """Gives up at once (OverBudget) rather than wait for the lock or the next slot past the thread's deadline."""
    global _last_call, _cooldown_until, _refusals
    deadline = getattr(_local, "deadline", None)
    budget = None if deadline is None else deadline - time.monotonic()
    if not _lock.acquire(timeout=-1 if budget is None else max(0.0, budget)):
        raise OverBudget(SOURCE, "une autre requête GDELT occupe le créneau au-delà du budget de temps")
    try:
        remaining = _cooldown_until - time.monotonic()
        if remaining > 0:
            raise ExternalUnavailable(SOURCE, f"en pause après un refus récent, nouvel essai possible dans "
                                              f"{remaining:.0f} s")
        wait = MIN_INTERVAL_S - (time.monotonic() - _last_call)
        if deadline is not None and max(wait, 0.0) >= deadline - time.monotonic():
            raise OverBudget(SOURCE, "budget de temps écoulé avant la requête" if wait <= 0 else
                             f"prochain créneau dans {max(1, round(wait))} s (une requête toutes les "
                             f"{MIN_INTERVAL_S:g} s), au-delà du budget de temps")
        if wait > 0:
            time.sleep(wait)
        try:
            payload = get_json(SOURCE, API_URL, params=params, timeout_s=timeout_s or get_settings().gdelt_timeout_s,
                               headers={"User-Agent": "StockLock datathon research"})
        except ExternalUnavailable:
            _refusals += 1
            _cooldown_until = time.monotonic() + min(COOLDOWN_S * 2 ** (_refusals - 1), COOLDOWN_MAX_S)
            raise
        finally:
            _last_call = time.monotonic()
        _refusals = 0
        return payload
    finally:
        _lock.release()


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
    return NewsSummary(query, start, end, total, tone, tops, hit, API_URL + "?" + urlencode(params),
                       payload.get("tonechart", []) or [])


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


def timeline(ticker: str, name: str, start: date, end: date, *, cache_only: bool = False,
             mode: str = "timelinevolinfo", timeout_s: float | None = None) -> Timeline:
    """Daily coverage intensity (% of all monitored articles) with top articles per day.

    `mode="timelinevolraw"` gives daily article counts instead (no top articles); `cache_only` answers
    from the disk cache or raises ExternalUnavailable, never calling GDELT (batches)."""
    return timeline_for_query(query_for(ticker, name), start, end, cache_only=cache_only, mode=mode,
                              timeout_s=timeout_s)


# World coverage of trade and sanctions policy (not tied to one company): its peaks date the political
# events the whole market talks about (tariff announcements, trade wars, sanctions, export controls).
POLITICAL_QUERY = '(tariff OR tariffs OR "trade war" OR sanctions OR "export controls") sourcelang:english'


def timeline_for_query(query: str, start: date, end: date, *, cache_only: bool = False,
                       mode: str = "timelinevolinfo", timeout_s: float | None = None) -> Timeline:
    """Daily coverage intensity of any GDELT query, with top articles per day (see `timeline`)."""
    params = {
        "query": query,
        "mode": mode,
        "format": "json",
        "startdatetime": datetime.combine(start, datetime.min.time()).strftime("%Y%m%d%H%M%S"),
        "enddatetime": datetime.combine(end + timedelta(days=1), datetime.min.time()).strftime("%Y%m%d%H%M%S"),
    }
    key = "|".join(f"{k}={params[k]}" for k in sorted(params))
    if cache_only:
        payload, hit = cache.read("gdelt", key, TIMELINE_TTL_S), True
        if payload is None:
            raise ExternalUnavailable(SOURCE, "couverture pas encore calculée pour ce titre")
    else:
        payload, hit = cache.cached("gdelt", key, TIMELINE_TTL_S, lambda: _throttled_get(params, timeout_s))
    return Timeline(query, parse_timeline(payload), hit, API_URL + "?" + urlencode(params))
