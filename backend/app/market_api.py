"""Routes of the « Tableau de bord » and the stock pages: universe search, sections, stock, score."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.data import universe, yf_market
from app.data.cache import ExternalUnavailable
from app.services import score_table, sections, starter_quotes, stocks

router = APIRouter(prefix="/api", tags=["marché"])


def _unavailable(exc: ExternalUnavailable) -> HTTPException:
    return HTTPException(status_code=503, detail=f"{exc.source} indisponible : {exc.reason}")


@router.get("/universe")
def universe_meta() -> dict[str, Any]:
    """Size and sources of the universe (SEC + TMX), refreshed at most daily."""
    try:
        return universe.meta()
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/universe/search")
def universe_search(q: str = Query(..., min_length=1, max_length=60),
                    limit: int = Query(20, ge=1, le=50)) -> dict[str, Any]:
    try:
        return universe.search(q, limit)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/market/sections")
def section_catalog() -> list[dict[str, str]]:
    return sections.catalog()


@router.get("/market/sections/{section_id}")
def section(section_id: str, limit: int = Query(24, ge=1, le=sections.MAX_LIMIT)) -> dict[str, Any]:
    if section_id not in sections.BY_ID:
        raise HTTPException(status_code=404, detail=f"section inconnue {section_id!r}")
    try:
        return sections.build(section_id, limit)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/stocks")
def legacy_stock_list() -> list[dict[str, Any]]:
    """Legacy: the starter kit's 31 assets (first dashboard); the live grid uses /api/market/sections."""
    return starter_quotes.list_stocks()


@router.get("/stocks/{ticker}")
def stock_detail(ticker: str, range_: stocks.Range = Query("1M", alias="range")) -> dict[str, Any]:
    symbol = ticker.strip().upper()
    if not symbol or len(symbol) > 20:
        raise HTTPException(status_code=404, detail=f"titre inconnu {ticker!r}")
    try:
        return stocks.stock_detail(symbol, range_)
    except yf_market.NotFound as exc:
        raise HTTPException(status_code=404,
                            detail=f"Aucun cours pour {symbol} chez Yahoo Finance : titre inconnu ou radié.") from exc
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/scores")
def score_table_status() -> dict[str, Any]:
    """State of the gold table `score_par_titre` (absent until the score pipeline has run)."""
    return score_table.status()


@router.get("/scores/{ticker}")
def stock_score(ticker: str) -> dict[str, Any]:
    return score_table.for_symbol(ticker.strip().upper())
