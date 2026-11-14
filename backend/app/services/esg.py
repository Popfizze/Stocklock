"""ESG risk and controversies of a title, for display and for the ESG rules of the fit verdict.

Sources (see app.data.yf_facts): Yahoo's equity screener gives the Sustainalytics ESG risk band (5
points wide) and the highest controversy level (0-5) of most large companies; quoteSummary `esgScores`
adds the exact total and the product-involvement flags when Yahoo still serves them. Recent
controversy-type events are Yahoo Finance headlines matching a controversy keyword. ETFs, cryptos and
many small caps have no ESG data: `esg` is then null and `message` says so in French.
"""

from __future__ import annotations

import re
from typing import Any

from app.data import yf_facts, yf_live
from app.data.cache import ExternalUnavailable
from app.services import profile

SOURCE = "Yahoo Finance (filtre de titres, données ESG Sustainalytics)"
SOURCES = {
    "screener": {"id": "yahoo_screener_esg", "title": SOURCE, "url": "https://finance.yahoo.com/research-hub/screener/"},
    "summary": {"id": "yahoo_esg_scores", "title": "Yahoo Finance (quoteSummary esgScores)",
                "url": "https://finance.yahoo.com/"},
    "news": {"id": "yahoo_news", "title": "Yahoo Finance (actualités récentes)", "url": "https://finance.yahoo.com/"},
}
# Sustainalytics risk categories by the band's low end.
CATEGORIES = ((40, "grave", "grave"), (30, "eleve", "élevé"), (20, "moyen", "moyen"), (10, "faible", "faible"),
              (0, "negligeable", "négligeable"))
CONTROVERSY_WORDS = re.compile(
    r"\b(lawsuits?|sued|sues|class action|fined?|fines|penalt(?:y|ies)|probes?|investigations?|recalls?|fraud|"
    r"scandals?|antitrust|settlements?|violations?|data breach|breach|spill|boycotts?|allegations?|accused|"
    r"indicted|charges|misconduct|brib(?:e|ery)|corruption|pollution|sanctions?|whistleblower)\b", re.IGNORECASE)
MAX_EVENTS = 8


def scores_from_facts(facts: dict[str, Any] | None) -> dict[str, Any] | None:
    """The `EsgScores` payload from the screener's facts, or None without an ESG risk band."""
    if not facts or not facts.get("listed") or facts.get("esg_low") is None:
        return None
    low, high = facts["esg_low"], facts.get("esg_high")
    key, label = next((k, lab) for lo, k, lab in CATEGORIES if low >= lo)
    level = facts.get("controversy")
    span = f"{low} à {high}" if high is not None else f"{low} et plus"
    return {"risk_low": low, "risk_high": high, "risk_category": key, "risk_label": f"Risque ESG {label} ({span})",
            "controversy_level": level,
            "controversy_label": profile.controversy_label(level) if level is not None else None,
            "total_esg": None, "involvement": [], "source": SOURCE}


def scores(symbols: list[str]) -> dict[str, dict[str, Any] | None]:
    """ESG scores by symbol (None when unknown); {} when Yahoo cannot be reached."""
    try:
        known = yf_facts.facts(symbols)
    except ExternalUnavailable:
        return {}
    return {s: scores_from_facts(known.get(s)) for s in symbols}


def controversy_events(symbol: str) -> list[dict[str, Any]]:
    try:
        items, _ = yf_live.recent_news(symbol)
    except ExternalUnavailable:
        return []
    events = []
    for item in items:
        match = CONTROVERSY_WORDS.search(item.get("title") or "")
        if match:
            events.append({"title": item["title"], "date": item["date"], "url": item.get("url"),
                           "publisher": item.get("publisher"), "keyword": match.group(1).lower()})
    return events[:MAX_EVENTS]


def report(symbol: str) -> dict[str, Any]:
    try:
        facts = yf_facts.facts([symbol]).get(symbol)
        failure = None
    except ExternalUnavailable as exc:
        facts, failure = None, exc.reason
    esg = scores_from_facts(facts)
    detail = yf_facts.esg_detail(symbol)
    sources = []
    if esg:
        sources.append(SOURCES["screener"])
    if detail:
        esg = esg or {"risk_low": int(detail["total_esg"] // 5 * 5), "risk_high": int(detail["total_esg"] // 5 * 5) + 5,
                      "risk_category": "", "risk_label": "", "controversy_level": None, "controversy_label": None,
                      "source": SOURCES["summary"]["title"]}
        level = detail["controversy"]
        if esg["controversy_level"] is None and level is not None:
            esg["controversy_level"] = int(level)
            esg["controversy_label"] = profile.controversy_label(int(level))
        key, label = next((k, lab) for lo, k, lab in CATEGORIES if detail["total_esg"] >= lo)
        esg.update(total_esg=detail["total_esg"], involvement=detail["involvement"], risk_category=key,
                   risk_label=f"Risque ESG {label} ({detail['total_esg']:.1f})".replace(".", ","))
        sources.append(SOURCES["summary"])
    events = controversy_events(symbol)
    if events:
        sources.append(SOURCES["news"])
    message = None
    if esg is None:
        message = (f"Données ESG de {symbol} momentanément indisponibles (Yahoo Finance : {failure})." if failure else
                   f"Aucune donnée ESG chez Yahoo Finance pour {symbol} : c'est fréquent pour les FNB, les "
                   "cryptoactifs et les petites capitalisations.")
    return {"ticker": symbol, "esg": esg, "message": message, "events": events, "sources": sources}
