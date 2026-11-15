"""Hype signal « tendance » of a title, from three measurable signs of a frenzy.

Each component scores 0 (normal), 1 (notable) or 2 (strong):
- volume: max(last session's volume, 10-day average) ÷ 3-month average (Yahoo quote);
  ≥ 1,5× notable, ≥ 3× strong.
- run_up: the stronger of the last month's and the last 5 sessions' returns, each in units of its own
  σ (daily σ of one year of closes × √sessions), so a one-day jump counts as well as a month-long climb;
  only rises count; ≥ 1 σ notable, ≥ 2 σ strong.
- news: GDELT DOC 2.0 article count per day over the last 7 days ÷ the 83 days before; ≥ 1,5×
  notable, ≥ 3× strong. When GDELT cannot answer (it allows one request every 5 s and often refuses),
  Yahoo Finance's latest 50 headlines: the last 2 days' rate ÷ the rest of the list's, at most 1 point
  (≥ 1,5×); a list too dense to span 4 days is reported without points. In a batch, news comes from
  the GDELT cache only and is otherwise not evaluated.
Level: 0-1 point « faible », 2 « modéré », 3 or more « élevé ».
"""

from __future__ import annotations

import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
import pandas as pd

from app.data import gdelt, yf_live, yf_market
from app.data.cache import ExternalUnavailable
from app.services import market

VOLUME_NOTABLE, VOLUME_STRONG = 1.5, 3.0
RUN_UP_NOTABLE, RUN_UP_STRONG = 1.0, 2.0
NEWS_NOTABLE, NEWS_STRONG = 1.5, 3.0
NEWS_RECENT_DAYS = 7
NEWS_WINDOW_DAYS = 90
NEWS_MIN_DAYS = 30
WEEK_SESSIONS = 5
# GDELT often takes ~10 s just to refuse (HTTP 429): a stock page waits at most this long, then falls back
# on Yahoo; the refusal pauses GDELT for 5 minutes (app.data.gdelt), so later pages do not wait at all.
GDELT_TIMEOUT_S = 3.5
YAHOO_COUNT = 50
YAHOO_RECENT_DAYS = 2
YAHOO_MIN_SPAN = 4
LABELS = {"volume": "Volume échangé", "run_up": "Hausse sur un mois", "news": "Attention médiatique"}
SUFFIXES = re.compile(r"[,.]?\s+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|holdings?|group|"
                      r"sa|ag|nv|se|usd|class [a-z]|cl [a-z])\.?$", re.IGNORECASE)


def fr(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}".replace(".", ",")


def short_name(name: str) -> str:
    """« Palantir Technologies Inc. » -> « Palantir Technologies », « Bitcoin USD » -> « Bitcoin »."""
    out = re.sub(r"\s*\(.*?\)", "", name or "").strip()
    while True:
        trimmed = SUFFIXES.sub("", out).strip(" ,.")
        if trimmed == out or not trimmed:
            return out
        out = trimmed


def _move(series: pd.Series, sessions: int, sigma_daily: float | None) -> tuple[float | None, float | None]:
    """(return over the last `sessions` observations, that return in units of its own σ)."""
    if len(series) <= sessions or not series.iloc[-1 - sessions]:
        return None, None
    ret = float(series.iloc[-1] / series.iloc[-1 - sessions] - 1)
    return ret, (ret / (sigma_daily * math.sqrt(sessions)) if sigma_daily else None)


def price_metrics(rows: list[list[Any]] | None) -> dict[str, Any]:
    """From [[date, close], ...]: one-year annualised volatility, the last month's and last 5 sessions'
    returns with each one in units of its own σ (daily σ × √sessions), and the last date."""
    empty = {"volatility_1y": None, "return_1m": None, "z_1m": None, "return_1w": None, "z_1w": None,
             "as_of": None}
    if not rows:
        return empty
    series = pd.Series([float(c) for _, c in rows], index=pd.to_datetime([d for d, _ in rows])).sort_index()
    series = series[~series.index.duplicated(keep="last")]
    last = series.index[-1]
    year = market.window(series, last - pd.DateOffset(years=1), last)
    vol = market.annualized_volatility(year)
    log_returns = np.log(year / year.shift(1)).dropna()
    sigma_daily = float(log_returns.std(ddof=1)) if len(log_returns) >= 20 else None
    month_sessions = int((series.index > last - pd.DateOffset(months=1)).sum())
    ret_1m, z_1m = _move(series, month_sessions, sigma_daily) if series.index[0] <= last - pd.DateOffset(days=25) \
        else (None, None)
    ret_1w, z_1w = _move(series, WEEK_SESSIONS, sigma_daily)
    return {**empty, "volatility_1y": vol, "return_1m": ret_1m, "z_1m": z_1m, "return_1w": ret_1w, "z_1w": z_1w,
            "as_of": last.date().isoformat()}


def _points(value: float | None, notable: float, strong: float) -> int | None:
    if value is None:
        return None
    return 2 if value >= strong else (1 if value >= notable else 0)


def _volume(quote: dict[str, Any]) -> dict[str, Any]:
    last, avg10, avg3m = quote.get("volume"), quote.get("avg_volume_10d"), quote.get("avg_volume_3m")
    ratios = [v / avg3m for v in (last, avg10) if v and avg3m]
    ratio = max(ratios) if ratios else None
    points = _points(ratio, VOLUME_NOTABLE, VOLUME_STRONG)
    if ratio is None:
        message = "Volume moyen de 3 mois indisponible : critère de volume non évalué."
    else:
        which = "de la dernière séance" if last and avg3m and last / avg3m == ratio else "des 10 dernières séances"
        verdict = {0: "habituel", 1: "≥ 1,5 : notable", 2: "≥ 3 : fort"}[points or 0]
        message = f"Volume {which} à {fr(ratio)} × sa moyenne de 3 mois ({verdict})."
    return {"id": "volume", "label": LABELS["volume"], "points": points, "ratio": ratio, "message": message}


def _run_up(metrics: dict[str, Any]) -> dict[str, Any]:
    """The stronger of the month's and the week's rise, each in units of its own σ; falls never count."""
    moves = [(z, ret, period) for z, ret, period in ((metrics["z_1m"], metrics["return_1m"], "un mois"),
                                                     (metrics["z_1w"], metrics["return_1w"], "5 séances"))
             if z is not None]
    if not moves:
        return {"id": "run_up", "label": LABELS["run_up"], "points": None, "ratio": None,
                "message": "Historique d'un an insuffisant : hausse récente non comparée à la volatilité."}
    z, ret, period = max(moves)
    points = _points(z, RUN_UP_NOTABLE, RUN_UP_STRONG) if ret > 0 else 0
    move = "Hausse" if ret >= 0 else "Baisse"
    verdict = ({0: "dans sa fourchette habituelle", 1: "≥ 1 : notable", 2: "≥ 2 : forte"}[points or 0] if ret >= 0
               else "une baisse ne compte pas dans la tendance")
    message = (f"{move} de {fr(abs(ret) * 100)} % sur {period}, soit {fr(z)} σ de sa variation habituelle sur "
               f"{period} ({verdict}).")
    return {"id": "run_up", "label": LABELS["run_up"], "points": points, "ratio": z, "message": message}


def _gdelt_news(symbol: str, name: str, cache_only: bool) -> dict[str, Any]:
    today = datetime.now(tz=timezone.utc).date()
    tl = gdelt.timeline(symbol, short_name(name), today - timedelta(days=NEWS_WINDOW_DAYS), today,
                        cache_only=cache_only, mode="timelinevolraw", timeout_s=GDELT_TIMEOUT_S)
    values = pd.Series({p["date"]: p["value"] for p in tl.points}).sort_index()
    if len(values) < NEWS_MIN_DAYS:
        raise ExternalUnavailable(gdelt.SOURCE, f"seulement {len(values)} jours de couverture")
    recent, base = values.iloc[-NEWS_RECENT_DAYS:].mean(), values.iloc[:-NEWS_RECENT_DAYS].mean()
    if not base > 0:
        raise ExternalUnavailable(gdelt.SOURCE, "couverture trop faible pour comparer")
    ratio = float(recent / base)
    points = _points(ratio, NEWS_NOTABLE, NEWS_STRONG)
    verdict = {0: "habituelle", 1: "≥ 1,5 : notable", 2: "≥ 3 : forte"}[points or 0]
    return {"source": "gdelt", "ratio": ratio, "points": points,
            "coverage": {
                "label": "GDELT DOC 2.0",
                "as_of": str(values.index.max()),
                "window_days": len(values),
                "scope": "Articles en anglais, couverture internationale indexée par GDELT.",
                "is_fallback": False,
            },
            "message": f"Articles GDELT des {NEWS_RECENT_DAYS} derniers jours : {fr(recent)} par jour, soit "
                       f"{fr(ratio)} × la moyenne des {len(values) - NEWS_RECENT_DAYS} jours précédents ({verdict})."}


def _yahoo_news(symbol: str, reason: str) -> dict[str, Any]:
    """Yahoo's latest headlines: the last 2 days' rate against the rest of the list, at most 1 point.

    Yahoo keeps only the latest articles (50 asked), so a much-covered title's list spans a day or two
    and leaves nothing to compare to: the count is then reported without points."""
    items, _ = yf_live.recent_news(symbol, YAHOO_COUNT)
    dates = sorted(datetime.fromisoformat(i["date"]).date() for i in items if i.get("date"))
    if not dates:
        return {"source": "yahoo", "ratio": None, "points": None,
                "coverage": {
                    "label": "Yahoo Finance",
                    "as_of": None,
                    "window_days": 0,
                    "scope": "Dernières manchettes proposées par Yahoo Finance ; couverture non exhaustive.",
                    "is_fallback": True,
                },
                "message": f"Aucun article récent chez Yahoo Finance (GDELT : {reason})."}
    newest, span = dates[-1], (dates[-1] - dates[0]).days + 1
    if span < YAHOO_MIN_SPAN:
        return {"source": "yahoo", "ratio": None, "points": None,
                "coverage": {
                    "label": "Yahoo Finance",
                    "as_of": newest.isoformat(),
                    "window_days": span,
                    "scope": "Dernières manchettes proposées par Yahoo Finance ; couverture non exhaustive.",
                    "is_fallback": True,
                },
                "message": f"Yahoo Finance : {len(dates)} articles en {span} jour(s), couverture dense mais sans "
                           f"historique pour comparer (GDELT : {reason})."}
    recent = sum(1 for d in dates if (newest - d).days < YAHOO_RECENT_DAYS) / YAHOO_RECENT_DAYS
    older = sum(1 for d in dates if (newest - d).days >= YAHOO_RECENT_DAYS) / (span - YAHOO_RECENT_DAYS)
    ratio = recent / older if older else None
    points = 1 if ratio is not None and ratio >= NEWS_NOTABLE else 0
    shown = f"{fr(ratio)} ×" if ratio is not None else "sans comparaison possible avec"
    return {"source": "yahoo", "ratio": ratio, "points": points,
            "coverage": {
                "label": "Yahoo Finance",
                "as_of": newest.isoformat(),
                "window_days": span,
                "scope": "Dernières manchettes proposées par Yahoo Finance ; couverture non exhaustive.",
                "is_fallback": True,
            },
            "message": f"Articles Yahoo Finance des {YAHOO_RECENT_DAYS} derniers jours : {fr(recent)} par jour, "
                       f"{shown} les {span - YAHOO_RECENT_DAYS} jours précédents "
                       f"({'≥ 1,5 : notable' if points else 'habituel'}) ; GDELT : {reason}."}


def news_attention(symbol: str, name: str, *, live: bool) -> dict[str, Any]:
    """{"source": gdelt | yahoo | None, "ratio", "points", "message"}; never raises."""
    try:
        return _gdelt_news(symbol, name, cache_only=not live)
    except ExternalUnavailable as exc:
        if not live:
            return {"source": None, "ratio": None, "points": None, "coverage": None,
                    "message": "Attention médiatique non évaluée dans un calcul groupé (ouvrir la fiche du titre)."}
        reason = exc.reason
    try:
        return _yahoo_news(symbol, reason)
    except ExternalUnavailable as exc:
        return {"source": None, "ratio": None, "points": None, "coverage": None,
                "message": f"Attention médiatique non évaluée : GDELT ({reason}) et Yahoo ({exc.reason}) indisponibles."}


def build(symbol: str, quote: dict[str, Any], metrics: dict[str, Any], news: dict[str, Any]) -> dict[str, Any]:
    news_component = {"id": "news", "label": LABELS["news"], "points": news["points"], "ratio": news["ratio"],
                      "message": news["message"]}
    components = [_volume(quote), _run_up(metrics), news_component]
    points = sum(c["points"] or 0 for c in components)
    level = "eleve" if points >= 3 else ("modere" if points == 2 else "faible")
    return {"ticker": symbol, "level": level, "points": points, "components": components,
            "reasons": [c["message"] for c in components if c["points"]],
            "volume_last": quote.get("volume"), "volume_avg_10d": quote.get("avg_volume_10d"),
            "volume_avg_3m": quote.get("avg_volume_3m"), "return_1m": metrics["return_1m"],
            "volatility_1y": metrics["volatility_1y"], "news_source": news["source"],
            "news_coverage": news["coverage"],
            "as_of": metrics["as_of"] or quote.get("as_of")}


def market_data(symbols: list[str]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    """(quotes, price metrics) by symbol; raises ExternalUnavailable when no quote can be had."""
    quotes = yf_market.quotes(symbols)
    try:
        closes = yf_market.closes_1y([s for s in symbols if s in quotes])
    except ExternalUnavailable:
        closes = {}
    return quotes, {s: price_metrics(closes.get(s)) for s in quotes}


def for_symbols(symbols: list[str], *, live_news: bool) -> dict[str, Any]:
    """{"items": [signal, ...] in the requested order, "missing": [...]}."""
    quotes, metrics = market_data(symbols)
    items = [build(s, quotes[s], metrics[s], news_attention(s, quotes[s].get("name") or s, live=live_news))
             for s in symbols if s in quotes]
    return {"items": items, "missing": [s for s in symbols if s not in quotes]}
