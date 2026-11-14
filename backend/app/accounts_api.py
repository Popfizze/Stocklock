"""Routes of the « Comptes » tab: tax rules, the asset universe and the per-account projection."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import Field, field_validator

from app.personas import get_persona
from app.schemas import _PersonaRequest, clean_ticker
from app.services import account_guide, tax_calc

router = APIRouter(prefix="/api/accounts", tags=["comptes"])


class ProjectionRequest(_PersonaRequest):
    ticker: str | None = Field(default=None, description="Asset of the starter kit; none for a generic saving")
    annual_contribution: float = Field(default=7000, gt=0, le=1_000_000, description="Pre-tax amount per year")
    years: int = Field(default=15, ge=1, le=50)
    expected_return: float | None = Field(default=None, ge=-0.5, le=0.5,
                                          description="Total annual return; default: the asset's assumption")
    income: float | None = Field(default=None, gt=0, le=10_000_000, description="Default: the profile's")
    retirement_income: float | None = Field(default=None, ge=0, le=10_000_000,
                                            description="Default: 70 % of the income")
    first_home_buyer: bool | None = Field(default=None, description="Default: the profile's")

    @field_validator("ticker", mode="before")
    @classmethod
    def _ticker(cls, value: object) -> str | None:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return clean_ticker(str(value))


@router.get("/rules")
def rules() -> dict[str, Any]:
    """The versioned 2026 tax rules and the long-term return assumptions, with their sources."""
    r = tax_calc.rules()
    a = account_guide.assumptions()
    return {**r, "tfsa_total_since_2009": sum(r["tfsa"]["annual_limits"].values()),
            "projection_returns": a["returns"], "projection_source_id": a["source_id"],
            "sources": r["sources"] + a["sources"]}


@router.get("/assets")
def assets() -> list[dict[str, str]]:
    return account_guide.list_assets()


@router.post("/projection")
def projection(request: ProjectionRequest) -> dict[str, Any]:
    persona = get_persona(request.persona_id)
    try:
        return account_guide.build(
            persona, ticker=request.ticker, annual_contribution=request.annual_contribution, years=request.years,
            total_return=request.expected_return, income=request.income,
            retirement_income=request.retirement_income, first_home_buyer=request.first_home_buyer)
    except KeyError as exc:
        raise HTTPException(status_code=422,
                            detail=f"Titre {request.ticker!r} absent du jeu de départ AlphaForge.") from exc
