"""Routes of the user's own score: the gold table rescored with the user's weights, and its sensitivity."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.services import custom_score

router = APIRouter(prefix="/api/scores", tags=["score personnalisé"])


class ScoreFactors(BaseModel):
    excluded_indicators: list[str] = Field(default_factory=list, max_length=12)


class ScoringChoice(BaseModel):
    """Weights by sub-score (any non-negative scale, normalised to 100; omitted ones keep their default)."""
    weights: dict[str, float] | None = None
    factors: ScoreFactors | None = None

    def validated(self) -> custom_score.Choice:
        try:
            return custom_score.choice(self.weights, self.factors.model_dump() if self.factors else None)
        except custom_score.ScoringError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc


class ReweightRequest(ScoringChoice):
    tickers: list[str] | None = Field(default=None, max_length=custom_score.MAX_TICKERS)
    limit: int = Field(default=50, ge=1, le=custom_score.MAX_LIMIT)

    @field_validator("tickers")
    @classmethod
    def _clean(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return list(dict.fromkeys(t.strip().upper() for t in value if t and t.strip()))


class SimulateRequest(ScoringChoice):
    ticker: str = Field(min_length=1, max_length=20)


@router.post("/reweight")
def reweight(request: ReweightRequest) -> dict[str, Any]:
    """Rows of `score_par_titre` rescored: default and custom score, rank change, sub-score contributions."""
    return custom_score.reweight(request.validated(), request.tickers or None, request.limit)


@router.post("/simulate")
def simulate(request: SimulateRequest) -> dict[str, Any]:
    """One title's custom score and rank along each weight's slider (0 to 100, step 5)."""
    return custom_score.simulate(request.ticker.strip().upper(), request.validated())
