"""KPI strip of the « Tableau de bord »: three indices, USD/CAD, the universe's size, the scored titles.

Each tile stands alone: a source that fails turns its own tile into `status: "error"` with a French
message, never the whole answer. Market tiles come from one batched Yahoo Finance quote request
(cached 5 min per symbol); the symbols live in the settings (`KPI_SYMBOLS`), not in the frontend.
"""

from __future__ import annotations

from statistics import median
from typing import Any

from app.config import get_settings
from app.data import universe, yf_market
from app.data.cache import ExternalUnavailable
from app.services import score_table

# id -> (label, kind); the Yahoo symbol of each id comes from the settings.
MARKET_TILES: dict[str, tuple[str, str]] = {
    "sp500": ("S&P 500", "index"),
    "tsx": ("S&P/TSX composé", "index"),
    "nasdaq": ("Nasdaq composé", "index"),
    "usdcad": ("USD/CAD", "fx"),
}
QUOTE_SOURCE = "Yahoo Finance (cotations différées)"


def _fr_int(value: int) -> str:
    """14409 -> « 14 409 » (no-break spaces, as fr-CA groups thousands)."""
    return f"{value:,}".replace(",", " ")


def _fr_score(value: float) -> str:
    """61.25 -> « 61,3 »."""
    return f"{value:.1f}".replace(".", ",")


def _tile(tile_id: str, label: str, kind: str, source: str, **fields: Any) -> dict[str, Any]:
    return {"id": tile_id, "label": label, "kind": kind, "status": "ok", "value": None, "change_abs": None,
            "change_pct": None, "as_of": None, "detail": None, "message": None, "source": source, **fields}


def _market_tiles() -> list[dict[str, Any]]:
    symbols = {tile_id: symbol for tile_id, symbol in get_settings().kpi_symbols.items()
               if tile_id in MARKET_TILES}
    error: str | None = None
    quotes: dict[str, dict[str, Any]] = {}
    try:
        quotes = yf_market.quotes(symbols.values())
    except ExternalUnavailable as exc:
        error = f"{exc.source} indisponible : {exc.reason}"
    tiles = []
    for tile_id, symbol in symbols.items():
        label, kind = MARKET_TILES[tile_id]
        quote = quotes.get(symbol.upper())
        if quote is None or quote.get("price") is None:
            tiles.append(_tile(tile_id, label, kind, QUOTE_SOURCE, status="error",
                               message=error or f"Aucune cotation reçue pour {symbol}."))
            continue
        tiles.append(_tile(tile_id, label, kind, QUOTE_SOURCE, value=quote["price"],
                           change_abs=quote["change_abs"], change_pct=quote["change_pct"],
                           as_of=quote["as_of"]))
    return tiles


def _universe_tile() -> dict[str, Any]:
    label, source = "Titres suivis", "Répertoires SEC et TMX"
    try:
        meta = universe.meta()
    except ExternalUnavailable as exc:
        return _tile("titres-suivis", label, "count", source, status="error",
                     message=f"{exc.source} indisponible : {exc.reason}")
    by_source = meta["by_source"]
    parts = [f"{name} {_fr_int(by_source[key])}" for key, name in (("sec", "SEC"), ("tmx", "TMX"))
             if key in by_source]
    return _tile("titres-suivis", label, "count", source, value=meta["count"],
                 detail=" · ".join(parts) or None)


def _scored_tile() -> dict[str, Any]:
    label, source = "Titres notés", "Table gold score_par_titre"
    table = score_table.load()
    if table["status"] == "unavailable":
        return _tile("titres-notes", label, "count", source, status="error", message=table["message"])
    if table["status"] != "available":
        return _tile("titres-notes", label, "count", source, status="empty",
                     detail="Pipeline pas encore exécuté", message=table["message"])
    scores = [row.score for row in table["rows"].values()]
    detail = f"Score médian {_fr_score(median(scores))}" if scores else "Aucun titre noté"
    return _tile("titres-notes", label, "count", source, value=len(scores), detail=detail,
                 as_of=(table["generated_at"] or "")[:10] or None)


def build() -> dict[str, Any]:
    """{"items": [tile, ...]} in display order; always answers, each tile carrying its own status."""
    return {"items": [*_market_tiles(), _universe_tile(), _scored_tile()]}
