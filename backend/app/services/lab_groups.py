"""Groups of titles for the Labo's group runs: explicit lists, dashboard sections, sectors.

A section is resolved by the dashboard's own screener (`app.services.sections`), in its order. A sector
is one of Yahoo Finance's sectors, resolved as the score pipeline does (`app.score_pipeline.groups` and
`titres`): the sector's stock screeners for the United States and the TSX, largest market
capitalisations first, keeping the titles of the universe (SEC + TMX) and leaving out Canadian
depositary receipts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.data import universe
from app.data.cache import ExternalUnavailable
from app.schemas import clean_ticker
from app.score_pipeline import groups as score_groups
from app.score_pipeline import titres
from app.services import sections

MAX_TITLES = 25
SECTORS_SOURCE = ("Filtres Yahoo Finance par secteur (États-Unis et TSX, plus grandes capitalisations), "
                  "titres de l'univers SEC + TMX")


class GroupError(ValueError):
    """The group cannot be resolved (HTTP 422), with a French explanation."""


@dataclass
class ResolvedGroup:
    kind: str
    ref: str | None
    label: str
    source: str
    tickers: list[str]
    total: int
    names: dict[str, str] = field(default_factory=dict)

    @property
    def truncated(self) -> bool:
        return self.total > len(self.tickers)

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "ref": self.ref, "label": self.label, "source": self.source,
                "tickers": self.tickers, "total": self.total, "truncated": self.truncated}


def catalog() -> dict[str, Any]:
    return {
        "max_titles": MAX_TITLES,
        "sections": [{"id": s.id, "title": s.title} for s in sections.BY_ID.values()],  # general + profile sections
        # resolved live when a run asks for them: their size is not known in advance
        "sectors": [{"name": name, "label": label, "count": None} for name, label in score_groups.SECTORS.items()],
        "sectors_source": SECTORS_SOURCE,
    }


# --- resolution ------------------------------------------------------------------------------------

def _explicit(kind: str, tickers: list[str] | None) -> ResolvedGroup:
    try:
        cleaned = list(dict.fromkeys(clean_ticker(t) for t in tickers or [] if str(t).strip()))
    except ValueError as exc:
        raise GroupError(f"Symbole invalide dans le groupe : {exc}.") from exc
    if not cleaned:
        raise GroupError("Le groupe ne contient aucun titre.")
    if len(cleaned) > MAX_TITLES:
        raise GroupError(f"{len(cleaned)} titres demandés : un groupe en compte {MAX_TITLES} au plus. "
                         "Retirez des titres ou lancez plusieurs groupes.")
    label = "Portefeuille du profil" if kind == "portfolio" else "Titres choisis"
    return ResolvedGroup(kind, None, label, "liste envoyée par le client", cleaned, len(cleaned))


def _section(ref: str, limit: int) -> ResolvedGroup:
    if ref not in sections.BY_ID:
        known = ", ".join(sections.BY_ID)
        raise GroupError(f"Section inconnue {ref!r} ; sections : {known}.")
    try:  # a section is a ranked screener cut at a limit: its first `limit` titles, as on the dashboard
        built = sections.build(ref, limit)
    except ExternalUnavailable as exc:
        raise GroupError(f"Section « {sections.BY_ID[ref].title} » indisponible ({exc.source} : {exc.reason}).") \
            from exc
    items = built["items"]
    if not items:
        raise GroupError(f"La section « {built['title']} » est vide pour le moment"
                         + (f" : {built['message']}" if built.get("message") else "."))
    tickers = [i["ticker"] for i in items]
    return ResolvedGroup("section", ref, built["title"], built["source"], tickers[:limit], len(tickers),
                         {i["ticker"]: i["name"] for i in items})


def _sector_name(ref: str) -> str:
    wanted = ref.strip().casefold()
    for name, label in score_groups.SECTORS.items():
        if wanted in (name.casefold(), label.casefold()):
            return name
    raise GroupError(f"Secteur inconnu {ref!r} ; secteurs : {', '.join(score_groups.SECTORS.values())}.")


def _sector(ref: str, limit: int) -> ResolvedGroup:
    name = _sector_name(ref)
    label = score_groups.SECTORS[name]
    try:
        listings = universe.listings()
        quotes = []
        for key in ("us_actions", "ca_actions"):  # one screener per market, each sorted by market cap
            quotes += titres.fetch_screen({**titres.SCREENS[key], "sector": name}, limit + 10)
    except ExternalUnavailable as exc:
        raise GroupError(f"Secteur « {label} » indisponible ({exc.source} : {exc.reason}).") from exc
    except Exception as exc:  # yfinance raises unrelated types on network issues
        raise GroupError(f"Secteur « {label} » indisponible (filtre Yahoo Finance : {type(exc).__name__}).") from exc
    kept: dict[str, dict[str, Any]] = {}
    for q in sorted(quotes, key=lambda q: -(q.get("marketCap") or 0)):
        symbol = q.get("symbol")
        if symbol in listings and symbol not in kept and not titres.is_cdr(q):
            kept[symbol] = q
    if not kept:
        raise GroupError(f"Aucun titre de l'univers dans le secteur « {label} » pour le moment.")
    tickers = list(kept)
    names = {s: q.get("longName") or q.get("shortName") or listings[s].name for s, q in kept.items()}
    return ResolvedGroup("sector", name, f"Secteur {label}", SECTORS_SOURCE, tickers[:limit], len(tickers), names)


def resolve(kind: str, tickers: list[str] | None = None, ref: str | None = None,
            limit: int | None = None) -> ResolvedGroup:
    """The group's titles, at most `limit` (≤ MAX_TITLES); GroupError when it cannot be resolved."""
    limit = MAX_TITLES if limit is None else max(1, min(int(limit), MAX_TITLES))
    if kind in {"tickers", "portfolio"}:
        group = _explicit(kind, tickers)
        group.tickers = group.tickers[:limit]
        return group
    if not ref or not ref.strip():
        raise GroupError(f"Un groupe « {kind} » demande une référence (ref).")
    if kind == "section":
        return _section(ref.strip(), limit)
    if kind == "sector":
        return _sector(ref, limit)
    raise GroupError(f"Type de groupe inconnu {kind!r} ; types : tickers, portfolio, section, sector.")
