"""Request and response models shared by every route."""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

from app.personas import persona_ids


class Persona(BaseModel):
    id: str
    name: str
    age: int
    risk_tolerance: str
    horizon: str
    preferences: list[str]
    summary: str


class Factor(BaseModel):
    name: str
    value: float | str | None
    unit: str | None = None
    effect: str | None = None
    source_id: str | None = None


class Source(BaseModel):
    id: str
    title: str
    url: str | None = None
    as_of: str | None = None


class GovernanceCheck(BaseModel):
    name: str
    passed: bool
    note: str


class Governance(BaseModel):
    passed: bool
    checks: list[GovernanceCheck]


class AnalysisResponse(BaseModel):
    answer: str
    factors: list[Factor]
    sources: list[Source]
    assumptions: list[str]
    limits: list[str]
    trace: list[str]
    governance: Governance


class _PersonaRequest(BaseModel):
    persona_id: str

    @field_validator("persona_id")
    @classmethod
    def _known_persona(cls, value: str) -> str:
        if value not in persona_ids():
            raise ValueError(f"unknown persona_id {value!r}; expected one of {sorted(persona_ids())}")
        return value


def clean_ticker(value: str) -> str:
    cleaned = value.strip().upper()
    if not cleaned or len(cleaned) > 15:
        raise ValueError("ticker must be a non-empty symbol")
    return cleaned


# --- step inputs (shared by the business routes and the Lab) -------------------------------------

class ScoreInputs(BaseModel):
    ticker: str
    portfolio: list[str] | None = None
    as_of: date | None = Field(default=None, description="Analysis date (default: today)")

    @field_validator("ticker")
    @classmethod
    def _ticker(cls, value: str) -> str:
        return clean_ticker(value)

    @field_validator("portfolio", mode="before")
    @classmethod
    def _portfolio(cls, value: object) -> list[str] | None:
        if value is None or value == "":
            return None
        if isinstance(value, str):
            value = [v for v in value.replace(";", ",").split(",")]
        return [clean_ticker(v) for v in value if v and str(v).strip()]  # type: ignore[union-attr]

    @field_validator("as_of", mode="before")
    @classmethod
    def _as_of(cls, value: object) -> object:
        return None if value == "" else value


class ExplainMoveInputs(BaseModel):
    ticker: str
    start: date
    end: date

    @field_validator("ticker")
    @classmethod
    def _ticker(cls, value: str) -> str:
        return clean_ticker(value)

    @model_validator(mode="after")
    def _window(self) -> "ExplainMoveInputs":
        if self.end <= self.start:
            raise ValueError("end must be after start")
        return self


class TaxInputs(BaseModel):
    annual_contribution: float = Field(gt=0, le=1_000_000)
    years: int = Field(default=15, ge=1, le=50)
    expected_return: float = Field(ge=-0.5, le=0.5, description="Annual nominal return, e.g. 0.05")
    marginal_rate_now: float = Field(ge=0, lt=1)
    marginal_rate_retirement: float = Field(ge=0, lt=1)
    first_home_buyer: bool | None = None
    income: float | None = Field(default=None, gt=0, description="Earned income (RRSP 18 % rule, brackets)")

    @field_validator("income", "first_home_buyer", mode="before")
    @classmethod
    def _blank(cls, value: object) -> object:
        return None if value == "" else value


class BiasInputs(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    ticker: str | None = None

    @field_validator("ticker")
    @classmethod
    def _ticker(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return clean_ticker(value)


class ScoreRequest(_PersonaRequest, ScoreInputs):
    pass


class ExplainMoveRequest(_PersonaRequest, ExplainMoveInputs):
    pass


class TaxRequest(_PersonaRequest, TaxInputs):
    pass


class BiasRequest(_PersonaRequest, BiasInputs):
    pass


class StockBiasRequest(BiasRequest):
    ticker: str

    @field_validator("message")
    @classmethod
    def _message_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("message must not be blank")
        return value


class LabRunRequest(_PersonaRequest):
    step: str
    inputs: dict[str, Any] = Field(default_factory=dict)
    options: dict[str, Any] = Field(default_factory=dict)
