"""Groups of titles for the Labo's group runs: explicit lists, dashboard sections, sectors.

A section is resolved by the dashboard's own screener (`app.services.sections`), in its order. A sector
comes from the score pipeline's latest silver `univers` table (Yahoo Finance profile sectors, read from
the data bucket), largest market capitalisations first; without that table (local runs, tests) the
starter kit's 31 assets and their sectors are used, and the response says which.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any

import pandas as pd

from app.config import get_settings
from app.data import starter
from app.data.cache import ExternalUnavailable
from app.schemas import clean_ticker
from app.services import sections

MAX_TITLES = 25
SECTORS_TTL_S = 10 * 60
SILVER_UNIVERSE_PREFIX = "silver/univers/"
SCORED_SOURCE = "Univers du pipeline de score (secteurs du profil Yahoo Finance)"
STARTER_SOURCE = "Kit de départ AlphaForge (assets_universe.csv, 31 actifs)"


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


# --- sectors ---------------------------------------------------------------------------------------

_lock = threading.Lock()
_memo: dict[str, Any] = {}


def _scored_universe() -> pd.DataFrame | None:
    """Latest silver `univers.csv` of the score pipeline (symbol, name, sector, market_cap), or None."""
    bucket = get_settings().data_bucket
    if not bucket:
        return None
    from app.score_pipeline import store as st

    try:
        store = st.S3Store(bucket)
        keys = [k for k in store.list_keys(SILVER_UNIVERSE_PREFIX) if k.endswith("univers.csv")]
        if not keys:
            return None
        frame = st.get_csv(store, max(keys))  # keys are silver/univers/<date>/<run id>/univers.csv
    except Exception:  # bucket unreachable, object missing, unreadable CSV: fall back to the kit
        return None
    if not {"symbol", "sector"} <= set(frame.columns):
        return None
    return frame


def _starter_universe() -> pd.DataFrame:
    u = starter.universe()
    return pd.DataFrame({"symbol": u["ticker"], "name": u["name"], "sector": u["sector"], "market_cap": None})


def sector_table() -> tuple[pd.DataFrame, str]:
    """(symbol, name, sector, market_cap) and the source label; re-read at most every 10 minutes."""
    with _lock:
        if not _memo or time.time() - _memo["loaded_at"] > SECTORS_TTL_S:
            scored = _scored_universe()
            table, source = (scored, SCORED_SOURCE) if scored is not None else (_starter_universe(), STARTER_SOURCE)
            table = table.dropna(subset=["symbol", "sector"])
            _memo.update(table=table, source=source, loaded_at=time.time())
        return _memo["table"], _memo["source"]


def reset() -> None:
    with _lock:
        _memo.clear()


def catalog() -> dict[str, Any]:
    table, source = sector_table()
    counts = table.groupby("sector").size().sort_values(ascending=False)
    return {
        "max_titles": MAX_TITLES,
        "sections": [{"id": s.id, "title": s.title} for s in sections.BY_ID.values()],  # general + profile sections
        "sectors": [{"name": str(name), "count": int(n)} for name, n in counts.items()],
        "sectors_source": source,
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


def _sector(ref: str, limit: int) -> ResolvedGroup:
    table, source = sector_table()
    rows = table.loc[table["sector"].astype(str).str.casefold() == ref.strip().casefold()]
    if rows.empty:
        known = ", ".join(sorted(table["sector"].astype(str).unique()))
        raise GroupError(f"Secteur inconnu {ref!r} ; secteurs : {known}.")
    if "market_cap" in rows and rows["market_cap"].notna().any():
        rows = rows.sort_values("market_cap", ascending=False, na_position="last")
    tickers = [str(s) for s in rows["symbol"]]
    names = {str(s): str(n) for s, n in zip(rows["symbol"], rows.get("name", rows["symbol"]), strict=True)}
    return ResolvedGroup("sector", str(rows["sector"].iloc[0]), f"Secteur {rows['sector'].iloc[0]}", source,
                         tickers[:limit], len(tickers), names)


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
