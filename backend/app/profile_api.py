"""Routes of the profile-adapted decision support: fit verdict, hype signal, ESG, portfolio analysis."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from app.data.cache import ExternalUnavailable
from app.personas import get_persona, persona_ids
from app.services import esg, fit, hype, portfolio

router = APIRouter(prefix="/api", tags=["profil"])


def _unavailable(exc: ExternalUnavailable) -> HTTPException:
    return HTTPException(status_code=503, detail=f"{exc.source} indisponible : {exc.reason}")


def _symbol(ticker: str) -> str:
    symbol = ticker.strip().upper()
    if not symbol or len(symbol) > 20:
        raise HTTPException(status_code=404, detail=f"titre inconnu {ticker!r}")
    return symbol


def _persona(persona_id: str) -> dict[str, Any]:
    try:
        return get_persona(persona_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=f"profil inconnu {persona_id!r}") from exc


def _symbols(values: list[str]) -> list[str]:
    out = list(dict.fromkeys(v.strip().upper() for v in values if v and v.strip()))
    if any(len(s) > 20 for s in out):
        raise ValueError("symbole trop long (20 caractères au plus)")
    return out


class _Persona(BaseModel):
    persona_id: str

    @field_validator("persona_id")
    @classmethod
    def _known(cls, value: str) -> str:
        if value not in persona_ids():
            raise ValueError(f"profil inconnu {value!r} ; profils : {sorted(persona_ids())}")
        return value


class TickersRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=fit.MAX_BATCH)

    @field_validator("tickers")
    @classmethod
    def _clean(cls, value: list[str]) -> list[str]:
        return _symbols(value)


class FitBatchRequest(_Persona, TickersRequest):
    pass


class Holding(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    weight: float = Field(gt=0)


class PortfolioRequest(_Persona):
    holdings: list[Holding] = Field(min_length=1, max_length=portfolio.MAX_HOLDINGS)


@router.get("/fit/{ticker}")
def fit_one(ticker: str, persona: str = Query(..., min_length=1, max_length=40)) -> dict[str, Any]:
    """Verdict of one title for a profile, with its reasons, hype (news live) and ESG."""
    symbol = _symbol(ticker)
    try:
        result = fit.evaluate(_persona(persona), [symbol], single=True)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    if not result["items"]:
        raise HTTPException(status_code=404, detail=f"Aucun cours pour {symbol} chez Yahoo Finance : titre inconnu "
                                                    "ou radié.")
    return result["items"][0]


@router.post("/fit")
def fit_batch(request: FitBatchRequest) -> dict[str, Any]:
    """Verdicts of up to 100 titles (dashboard cards); news attention from the GDELT cache only."""
    try:
        return fit.evaluate(get_persona(request.persona_id), request.tickers)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/hype/{ticker}")
def hype_one(ticker: str) -> dict[str, Any]:
    symbol = _symbol(ticker)
    try:
        result = hype.for_symbols([symbol], live_news=True)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    if not result["items"]:
        raise HTTPException(status_code=404, detail=f"Aucun cours pour {symbol} chez Yahoo Finance.")
    return result["items"][0]


@router.post("/hype")
def hype_batch(request: TickersRequest) -> dict[str, Any]:
    try:
        return hype.for_symbols(request.tickers, live_news=False)
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc


@router.get("/esg/{ticker}")
def esg_one(ticker: str) -> dict[str, Any]:
    return esg.report(_symbol(ticker))


@router.post("/portfolio/analyze")
def analyze_portfolio(request: PortfolioRequest) -> dict[str, Any]:
    """Diversification, per-holding verdicts and suggestions for holdings the client keeps."""
    try:
        result = portfolio.analyze(get_persona(request.persona_id), [h.model_dump() for h in request.holdings])
    except ExternalUnavailable as exc:
        raise _unavailable(exc) from exc
    if not result["holdings"]:
        raise HTTPException(status_code=422, detail="Aucun titre du portefeuille n'est connu de Yahoo Finance : "
                                                    f"{', '.join(result['missing'])}.")
    return result
