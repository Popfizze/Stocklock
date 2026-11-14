"""Sections of the « Tableau de bord »: live lists of titles, each from a Yahoo screener or the score table.

A section never holds a ticker list: its titles come from a Yahoo Finance screener run when the
section is asked for (cached 5 min), kept only when they belong to the universe (SEC + TMX), or from
the gold table `score_par_titre` for « Meilleurs scores ». Every card gets its last-month sparkline
and its score when the table has one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.data import universe, yf_market
from app.data.cache import ExternalUnavailable
from app.data.yf_market import Screen
from app.services import score_table

US_EXCHANGES = ("NMS", "NYQ", "NGM", "NCM", "ASE")
YAHOO_SCREENER = "Yahoo Finance (filtre de titres)"
MAX_LIMIT = 96


@dataclass(frozen=True)
class Section:
    id: str
    title: str
    description: str
    source: str
    screen: Screen | None = None  # None: « Meilleurs scores », from the score table


SECTIONS: tuple[Section, ...] = (
    Section("populaires", "Les plus populaires",
            "Les actions américaines les plus échangées de la séance (volume), capitalisation d'au moins 2 G$ US.",
            YAHOO_SCREENER, Screen("most_actives", predefined="most_actives")),
    Section("meilleurs-scores", "Meilleurs scores",
            "Les titres les mieux notés par le score StockLock (0 à 100), calculé par le pipeline de score.",
            "Table gold score_par_titre"),
    Section("hausses", "Plus fortes hausses",
            "Les actions américaines qui montent le plus sur la séance (capitalisation d'au moins 2 G$ US).",
            YAHOO_SCREENER, Screen("day_gainers", predefined="day_gainers")),
    Section("baisses", "Plus fortes baisses",
            "Les actions américaines qui baissent le plus sur la séance (capitalisation d'au moins 2 G$ US).",
            YAHOO_SCREENER, Screen("day_losers", predefined="day_losers")),
    Section("canada-populaires", "Populaires au Canada",
            "Les actions de la Bourse de Toronto les plus échangées de la séance, capitalisation d'au moins 1 G$.",
            YAHOO_SCREENER, Screen("ca_most_active", region="ca", exchanges=("TOR",), min_market_cap=1e9,
                                   sort_field="dayvolume")),
    Section("canada-hausses", "Hausses au Canada",
            "Les actions de la Bourse de Toronto qui montent le plus sur la séance (capitalisation d'au moins 1 G$).",
            YAHOO_SCREENER, Screen("ca_gainers", region="ca", exchanges=("TOR",), min_market_cap=1e9,
                                   sort_field="percentchange")),
    Section("canada-baisses", "Baisses au Canada",
            "Les actions de la Bourse de Toronto qui baissent le plus sur la séance (capitalisation d'au moins 1 G$).",
            YAHOO_SCREENER, Screen("ca_losers", region="ca", exchanges=("TOR",), min_market_cap=1e9,
                                   sort_field="percentchange", sort_asc=True)),
    Section("grandes-capitalisations", "Les plus grandes capitalisations",
            "Les plus grandes entreprises cotées aux États-Unis, par capitalisation boursière.",
            YAHOO_SCREENER, Screen("us_largest", region="us", exchanges=US_EXCHANGES, min_market_cap=1e10,
                                   sort_field="intradaymarketcap")),
    Section("fnb-canada", "FNB canadiens populaires",
            "Les fonds négociés en bourse de Toronto les plus échangés de la séance.",
            YAHOO_SCREENER, Screen("ca_etf_most_active", kind="etf", region="ca", exchanges=("TOR",),
                                   sort_field="dayvolume")),
)
BY_ID = {s.id: s for s in SECTIONS}


def catalog() -> list[dict[str, str]]:
    return [{"id": s.id, "title": s.title, "description": s.description, "source": s.source} for s in SECTIONS]


def _is_cdr(quote: dict[str, Any]) -> bool:
    """Canadian depositary receipts (a US stock traded in CAD) are not Canadian titles."""
    names = f"{quote.get('name') or ''} {quote.get('short_name') or ''}".upper()
    return " CDR" in f" {names}"


def _card(quote: dict[str, Any], listing: universe.Listing | None, spark: list[float] | None,
          score: tuple[float, bool] | None) -> dict[str, Any]:
    return {
        "ticker": quote["symbol"],
        "name": quote.get("name") or (listing.name if listing else quote["symbol"]),
        "exchange": listing.exchange if listing else None,
        "currency": quote.get("currency"),
        "price": quote.get("price"),
        "change_abs": quote.get("change_abs"),
        "change_pct": quote.get("change_pct"),
        "volume": quote.get("volume"),
        "market_cap": quote.get("market_cap"),
        "as_of": quote.get("as_of"),
        "sparkline": spark or [],
        "score": score[0] if score else None,
        "score_partiel": score[1] if score else None,
    }


def _cards(quotes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    symbols = [q["symbol"] for q in quotes]
    try:
        sparks = yf_market.sparklines(symbols)
    except ExternalUnavailable:
        sparks = {}  # the cards still show price and change
    scores = score_table.summaries()
    listings = universe.listings()
    return [_card(q, listings.get(q["symbol"]), sparks.get(q["symbol"]), scores.get(q["symbol"])) for q in quotes]


def _screened(section: Section, limit: int) -> list[dict[str, Any]]:
    assert section.screen is not None
    listings = universe.listings()
    size = min(250, limit * 2 + 20)  # over-fetch: some titles are outside the universe
    kept = []
    for quote in yf_market.screen(section.screen, size):
        symbol = quote["symbol"]
        if symbol in listings and quote.get("price") is not None and not _is_cdr(quote):
            kept.append(quote)
        if len(kept) == limit:
            break
    return kept


def _best_scored(limit: int) -> tuple[list[dict[str, Any]], str | None]:
    table = score_table.load()
    if table["status"] != "available":
        return [], (table["message"] or "") + " Les meilleurs scores apparaîtront ici une fois le pipeline exécuté."
    rows = score_table.best(limit)
    quotes = yf_market.quotes(row.symbol for row in rows)
    return [quotes[row.symbol.upper()] for row in rows if row.symbol.upper() in quotes], None


def build(section_id: str, limit: int = 24) -> dict[str, Any]:
    """One section with its cards (KeyError if the section is unknown)."""
    section = BY_ID[section_id]
    limit = max(1, min(limit, MAX_LIMIT))
    message = None
    if section.screen is None:
        quotes, message = _best_scored(limit)
    else:
        quotes = _screened(section, limit)
    items = _cards(quotes) if quotes else []
    if not items and message is None:
        message = "Aucun titre pour le moment dans cette section."
    dates = [i["as_of"] for i in items if i["as_of"]]
    return {"id": section.id, "title": section.title, "description": section.description, "source": section.source,
            "status": "ok" if items else "empty", "message": message, "as_of": max(dates) if dates else None,
            "limit": limit, "items": items}
