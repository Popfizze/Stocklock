"""The group of titles a score run covers (`group` of POST /api/pipeline/score/runs).

    {"kind": "auto", "max_titles": 200, "ca_share": 0.3, "etf_share": 0.1}   default: the most valuable titles
    {"kind": "tickers", "tickers": ["AAPL", "RY.TO", ...]}                     up to 100 symbols
    {"kind": "section", "id": "populaires", "limit": 30}                      a dashboard section, resolved live
    {"kind": "sector", "name": "Technology", "max_titles": 50, "ca_share": 0.3} a sector of the live universe

Symbols are Yahoo Finance's, as in the universe (AAPL, BRK-B, RY.TO, ONE.V). A requested symbol is
matched as written, then with a dash for a share class (BRK.B -> BRK-B), then on the TSX or the TSX Venture
(RY -> RY.TO) when it is not a US listing; the rest is reported as unknown, never silently dropped.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.services import sections

MAX_TICKERS = 100
SYMBOL = re.compile(r"^[A-Z0-9][A-Z0-9.\-=^]{0,19}$")
# Yahoo Finance's sectors (screener values) and their French labels.
SECTORS: dict[str, str] = {
    "Technology": "Technologie",
    "Financial Services": "Services financiers",
    "Healthcare": "Santé",
    "Energy": "Énergie",
    "Industrials": "Industrie",
    "Consumer Cyclical": "Consommation cyclique",
    "Consumer Defensive": "Consommation de base",
    "Basic Materials": "Matériaux de base",
    "Real Estate": "Immobilier",
    "Utilities": "Services publics",
    "Communication Services": "Services de communication",
}


class AutoGroup(BaseModel):
    kind: Literal["auto"] = "auto"
    max_titles: int = Field(200, ge=5, le=600, description="Titles scored, most valuable first")
    ca_share: float = Field(0.3, ge=0, le=1, description="Share of Canadian (TSX) stocks among the stocks")
    etf_share: float = Field(0.1, ge=0, le=0.5, description="Share of ETFs among the titles")


class TickersGroup(BaseModel):
    kind: Literal["tickers"]
    tickers: list[str] = Field(min_length=1, description=f"Yahoo Finance symbols, {MAX_TICKERS} at most")

    @field_validator("tickers")
    @classmethod
    def _clean(cls, value: list[str]) -> list[str]:
        cleaned = list(dict.fromkeys(t.strip().upper() for t in value if t and t.strip()))
        bad = [t for t in cleaned if not SYMBOL.match(t)]
        if bad:
            raise ValueError(f"symboles mal formés : {', '.join(bad[:10])}")
        if not cleaned:
            raise ValueError("aucun symbole")
        if len(cleaned) > MAX_TICKERS:
            raise ValueError(f"{len(cleaned)} symboles : {MAX_TICKERS} au plus par run")
        return cleaned


class SectionGroup(BaseModel):
    kind: Literal["section"]
    id: str
    limit: int = Field(30, ge=1, le=100, description="Titles taken from the section, in its order")

    @field_validator("id")
    @classmethod
    def _known(cls, value: str) -> str:
        if value not in sections.BY_ID:
            raise ValueError(f"section inconnue {value!r} ; sections : {', '.join(sections.BY_ID)}")
        return value


class SectorGroup(BaseModel):
    kind: Literal["sector"]
    name: str
    max_titles: int = Field(50, ge=5, le=200, description="Largest titles of the sector")
    ca_share: float = Field(0.3, ge=0, le=1, description="Share of Canadian (TSX) stocks")

    @field_validator("name")
    @classmethod
    def _sector(cls, value: str) -> str:
        wanted = value.strip().casefold()
        for name, label in SECTORS.items():
            if wanted in (name.casefold(), label.casefold()):
                return name
        raise ValueError(f"secteur inconnu {value!r} ; secteurs : {', '.join(SECTORS)}")


Group = Annotated[AutoGroup | TickersGroup | SectionGroup | SectorGroup, Field(discriminator="kind")]


def label(group: Any) -> str:
    if group.kind == "tickers":
        return f"{len(group.tickers)} titre{'s' if len(group.tickers) > 1 else ''} choisi{'s' if len(group.tickers) > 1 else ''}"
    if group.kind == "section":
        return f"Section « {sections.BY_ID[group.id].title} » ({group.limit} titres au plus)"
    if group.kind == "sector":
        return f"Secteur {SECTORS[group.name]} ({group.max_titles} plus grandes capitalisations au plus)"
    return f"Sélection automatique : {group.max_titles} titres (actions américaines, TSX, FNB)"


def requested_size(group: Any) -> int:
    return {"tickers": lambda g: len(g.tickers), "section": lambda g: g.limit}.get(
        group.kind, lambda g: g.max_titles)(group)


def resolve_tickers(requested: list[str], known: Callable[[str], bool]
                    ) -> tuple[list[str], dict[str, str], list[str]]:
    """(universe symbols in request order, aliases {asked: symbol}, unknown symbols)."""
    resolved: list[str] = []
    aliases: dict[str, str] = {}
    unknown: list[str] = []
    for asked in requested:
        candidates = [asked]
        if "." in asked and not asked.endswith((".TO", ".V")):
            candidates.append(asked.replace(".", "-"))
        if "." not in asked:
            candidates += [asked + ".TO", asked + ".V"]
        match = next((c for c in candidates if known(c)), None)
        if match is None:
            unknown.append(asked)
            continue
        if match != asked:
            aliases[asked] = match
        if match not in resolved:
            resolved.append(match)
    return resolved, aliases, unknown


def preview(group: Any, unknown: list[str] | None = None, aliases: dict[str, str] | None = None) -> dict[str, Any]:
    """The group as known before its resolution by the run (stage silver_univers)."""
    return {"kind": group.kind, "label": label(group),
            "requested": list(group.tickers) if group.kind == "tickers" else None,
            "resolved": None, "unknown": unknown or [], "aliases": aliases or {}, "excluded": [],
            "comparison": None}


def options() -> dict[str, Any]:
    """What the Labo can offer: sections, sectors, ticker cap."""
    return {"sections": [{"id": s.id, "title": s.title} for s in sections.SECTIONS],
            "sectors": [{"name": n, "label": lbl} for n, lbl in SECTORS.items()],
            "max_tickers": MAX_TICKERS}
