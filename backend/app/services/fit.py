"""Profile fit verdict of titles for a persona: « compatible », « à surveiller » or « hors profil ».

The rules are in app.services.profile (`checks`). The data behind them, fetched in batches so that a
hundred dashboard cards cost a handful of requests:
- identity and volumes: Yahoo v7 quotes (50 per request, cached 5 min);
- one-year volatility and one-month return: one year of daily closes (spark, 20 per request, 6 h);
- sector, ESG risk band and controversy level: Yahoo's screener facts (app.data.yf_facts, 7 days);
- hype: app.services.hype (price/volume trend immediately; media attention is completed separately for one title).
"""

from __future__ import annotations

from typing import Any

from app.data import yf_facts, yf_market
from app.data.cache import ExternalUnavailable
from app.services import esg, hype, profile
from app.services.stocks import ASSET_CLASSES

MAX_BATCH = 100


def asset_class(quote: dict[str, Any]) -> str:
    kind = str(quote.get("quote_type") or "").upper()
    return ASSET_CLASSES.get(kind, kind.lower() or "unknown")


def screener_facts(symbols: list[str]) -> dict[str, dict[str, Any]]:
    """Screener facts by symbol; {} when Yahoo's screener cannot be reached (sector and ESG then unknown)."""
    if not symbols:
        return {}
    try:
        return yf_facts.facts(symbols)
    except ExternalUnavailable:
        return {}


def evaluate(persona: dict[str, Any], symbols: list[str], *, single: bool = False) -> dict[str, Any]:
    """{"persona_id", "items": [FitResult...] in the requested order, "missing": [...]}.

    `single`: one stock page; media attention is deferred and the sector falls back on Yahoo's profile.
    Raises ExternalUnavailable when Yahoo's quotes cannot be reached at all."""
    if single:
        snapshot = hype.market_data_one(symbols[0])
        quotes, metrics = (
            ({symbols[0]: snapshot[0]}, {symbols[0]: snapshot[1]}) if snapshot else ({}, {})
        )
    else:
        quotes, metrics = hype.market_data(symbols)
    present = [s for s in symbols if s in quotes]
    facts = screener_facts([s for s in present if asset_class(quotes[s]) == "equity"])
    c = persona["constraints"]
    items = []
    for symbol in present:
        quote, m = quotes[symbol], metrics[symbol]
        kind = asset_class(quote)
        sector = (facts.get(symbol) or {}).get("sector")
        if sector is None and single and kind == "equity":
            sector = yf_market.profile(symbol).get("sector")  # one title: Yahoo's profile (cached 7 days)
        scores = esg.scores_from_facts(facts.get(symbol))
        signal = hype.build(
            symbol, quote, m,
            hype.deferred_news() if single else hype.news_attention(symbol, quote.get("name") or symbol, live=False),
        )
        reasons = profile.checks(persona, {"ticker": symbol, "asset_class": kind, "sector": sector},
                                 m["volatility_1y"], scores, signal)
        items.append({"ticker": symbol, "name": quote.get("name") or symbol, "persona_id": persona["id"],
                      "verdict": profile.verdict(reasons), "summary": profile.summary(persona, reasons),
                      "reasons": profile.public(reasons), "asset_class": kind, "sector": sector,
                      "volatility_1y": m["volatility_1y"], "return_1m": m["return_1m"],
                      "max_volatility": c["max_volatility"], "max_position": c["max_single_position"],
                      "hype": signal, "esg": scores})
    return {"persona_id": persona["id"], "items": items, "missing": [s for s in symbols if s not in quotes]}
