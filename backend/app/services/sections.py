"""Sections of the « Tableau de bord »: live lists of titles, each from a Yahoo screener or the score table.

A section never holds a ticker list: its titles come from a Yahoo Finance screener run when the
section is asked for (cached 5 min), kept only when they belong to the universe (SEC + TMX) — or, for
« Cryptomonnaies », when Yahoo lists them as cryptocurrencies — or from the gold table
`score_par_titre` for « Meilleurs scores ». Every card gets its last-month sparkline and its score
when the table has one.

Profile sections come first on the dashboard of a persona; they are chosen from the persona's own
preferences and constraints (personas.json), never by its id:
- « IA » in the preferences → « IA et semi-conducteurs » (industries Semiconductors, Semiconductor
  Equipment & Materials, Software—Infrastructure);
- crypto allowed → « Cryptomonnaies » (Yahoo's crypto screener, stablecoins left out);
- « ESG » in the preferences → « Faible risque ESG » (ESG risk < 20, highest controversy ≤ 2);
- « revenu de retraite » → « Dividendes réguliers » (forward yield 2,5 % to 8 %, 5 years of growth);
- « préservation du capital » or risk level ≤ 2 → « Faible volatilité » (beta 0 to 0,8).
With a persona, a custom screen also leaves out the persona's excluded sectors.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Literal

from app.data import universe, yf_facts, yf_market
from app.data.cache import ExternalUnavailable
from app.data.yf_market import Screen
from app.services import score_table
from app.services.profile import of_name

US_EXCHANGES = ("NMS", "NYQ", "NGM", "NCM", "ASE")
NORTH_AMERICA = US_EXCHANGES + ("TOR",)
AI_INDUSTRIES = ("Semiconductors", "Semiconductor Equipment & Materials", "Software—Infrastructure")
YAHOO_SCREENER = "Yahoo Finance (filtre de titres)"
CRYPTO_SOURCE = "Yahoo Finance (filtre des cryptomonnaies)"
CRYPTO_EXCHANGE = "Crypto"
MAX_LIMIT = 96


@dataclass(frozen=True)
class Section:
    id: str
    title: str
    description: str
    source: str
    screen: Screen | None = None  # None: « Meilleurs scores », from the score table
    kind: Literal["stocks", "crypto"] = "stocks"


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

PERSONA_SECTIONS: tuple[Section, ...] = (
    Section("ia-semis", "IA et semi-conducteurs",
            "Semi-conducteurs, équipements et logiciels d'infrastructure cotés aux États-Unis, capitalisation "
            "d'au moins 10 G$ US.",
            YAHOO_SCREENER, Screen("ai_semis", region="us", exchanges=US_EXCHANGES, min_market_cap=1e10,
                                   sort_field="intradaymarketcap", filters=(("is-in", "industry", *AI_INDUSTRIES),))),
    Section("cryptos", "Cryptomonnaies",
            "Les cryptomonnaies les plus capitalisées, hors cryptomonnaies stables (arrimées au dollar).",
            CRYPTO_SOURCE, Screen("cryptos", predefined="all_cryptocurrencies_us"), kind="crypto"),
    Section("esg-faible-risque", "Faible risque ESG",
            "Grandes entreprises américaines et canadiennes au risque ESG faible (moins de 20) sans controverse "
            "élevée (niveau 2 sur 5 au plus), capitalisation d'au moins 10 G$.",
            YAHOO_SCREENER, Screen("esg_low_risk", exchanges=NORTH_AMERICA, min_market_cap=1e10,
                                   sort_field="intradaymarketcap",
                                   filters=(("lt", "esg_score", 20), ("lte", "highest_controversy", 2)))),
    Section("dividendes", "Dividendes réguliers",
            "Grandes entreprises américaines et canadiennes au rendement du dividende de 2,5 % à 8 %, en hausse "
            "depuis au moins 5 ans, capitalisation d'au moins 10 G$.",
            YAHOO_SCREENER, Screen("dividends", exchanges=NORTH_AMERICA, min_market_cap=1e10,
                                   sort_field="intradaymarketcap",
                                   filters=(("btwn", "forward_dividend_yield", 2.5, 8),
                                            ("gte", "consecutive_years_of_dividend_growth_count", 5)))),
    Section("faible-volatilite", "Faible volatilité",
            "Grandes entreprises américaines et canadiennes au bêta inférieur à 0,8 (moins sensibles au marché), "
            "capitalisation d'au moins 20 G$.",
            YAHOO_SCREENER, Screen("low_beta", exchanges=NORTH_AMERICA, min_market_cap=2e10,
                                   sort_field="intradaymarketcap", filters=(("btwn", "beta", 0, 0.8),))),
)
BY_ID = {s.id: s for s in SECTIONS + PERSONA_SECTIONS}


def _info(section: Section) -> dict[str, str]:
    return {"id": section.id, "title": section.title, "description": section.description, "source": section.source}


def persona_sections(persona: dict[str, Any]) -> list[tuple[Section, str]]:
    """The persona's own sections with why each one is shown (see the module docstring)."""
    prefs, c, name = persona.get("preferences", []), persona["constraints"], persona["name"]
    out = []
    if "IA" in prefs:
        out.append(("ia-semis", f"Préférence « IA » du profil {of_name(name)}."))
    if c["allow_crypto"]:
        out.append(("cryptos", f"Le profil {of_name(name)} accepte les cryptoactifs."))
    if "ESG" in prefs:
        excluded = c["excluded_sectors"]
        out.append(("esg-faible-risque", f"Préférence « ESG » de {name}"
                    + (f" ; secteur(s) exclu(s) : {', '.join(excluded)}." if excluded else ".")))
    if "revenu de retraite" in prefs:
        out.append(("dividendes", f"Objectif « revenu de retraite » de {name}."))
    if "préservation du capital" in prefs or c["risk_level"] <= 2:
        out.append(("faible-volatilite", f"Objectif « préservation du capital » de {name} "
                    f"(risque {persona['risk_tolerance']})."))
    return [(BY_ID[sid], why) for sid, why in out]


def catalog(persona: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """The general sections; with a persona, its own sections first (with `persona_reason`)."""
    if persona is None:
        return [_info(s) for s in SECTIONS]
    return ([{**_info(s), "persona_reason": why} for s, why in persona_sections(persona)]
            + [{**_info(s), "persona_reason": None} for s in SECTIONS])


def _is_cdr(quote: dict[str, Any]) -> bool:
    """Canadian depositary receipts (a US stock traded in CAD) are not Canadian titles."""
    names = f"{quote.get('name') or ''} {quote.get('short_name') or ''}".upper()
    return " CDR" in f" {names}"


def is_stablecoin(quote: dict[str, Any]) -> bool:
    """A cryptocurrency pegged to the dollar: priced within 3 % of 1 USD and nearly still over the day."""
    price, change = quote.get("price"), quote.get("change_pct")
    return price is not None and abs(price - 1) <= 0.03 and abs(change or 0) < 0.5


def _card(quote: dict[str, Any], listing: universe.Listing | None, spark: list[float] | None,
          score: tuple[float, bool] | None) -> dict[str, Any]:
    crypto = quote.get("quote_type") == "CRYPTOCURRENCY"
    return {
        "ticker": quote["symbol"],
        "name": quote.get("name") or (listing.name if listing else quote["symbol"]),
        "exchange": listing.exchange if listing else (CRYPTO_EXCHANGE if crypto else None),
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


def _screen_for(section: Section, persona: dict[str, Any] | None) -> Screen:
    """The section's screen; with a persona, a custom equity screen leaves out its excluded sectors."""
    assert section.screen is not None
    excluded = persona["constraints"]["excluded_sectors"] if persona else []
    screen = section.screen
    if not excluded or screen.predefined or screen.kind != "equity":
        return screen
    allowed = tuple(s for s in yf_facts.SECTORS if s not in excluded)
    return replace(screen, key=f"{screen.key}|sans:{','.join(sorted(excluded))}",
                   filters=screen.filters + (("is-in", "sector", *allowed),))


def _keep(section: Section, quote: dict[str, Any], listings: dict[str, universe.Listing]) -> bool:
    if quote.get("price") is None:
        return False
    if section.kind == "crypto":
        return quote.get("quote_type") == "CRYPTOCURRENCY" and not is_stablecoin(quote)
    return quote["symbol"] in listings and not _is_cdr(quote)


def screened(section: Section, limit: int, persona: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Quotes of a screened section, at most `limit`, in the screener's order."""
    listings = universe.listings()
    size = min(250, limit * 2 + 20)  # over-fetch: some titles are outside the universe
    kept = []
    for quote in yf_market.screen(_screen_for(section, persona), size):
        if _keep(section, quote, listings):
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


def build(section_id: str, limit: int = 24, persona: dict[str, Any] | None = None) -> dict[str, Any]:
    """One section with its cards (KeyError if the section is unknown)."""
    section = BY_ID[section_id]
    limit = max(1, min(limit, MAX_LIMIT))
    message = None
    if section.screen is None:
        quotes, message = _best_scored(limit)
    else:
        quotes = screened(section, limit, persona)
    items = _cards(quotes) if quotes else []
    if not items and message is None:
        message = "Aucun titre pour le moment dans cette section."
    dates = [i["as_of"] for i in items if i["as_of"]]
    return {"id": section.id, "title": section.title, "description": section.description, "source": section.source,
            "status": "ok" if items else "empty", "message": message, "as_of": max(dates) if dates else None,
            "limit": limit, "items": items}
