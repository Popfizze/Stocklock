"""Pure maths of the score: indicators, capping, ranks, sub-scores and weight redistribution."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date
from typing import Iterable

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class IndicatorDef:
    id: str
    label: str
    unit: str      # ratio | multiple | number
    better: str    # higher | lower


@dataclass(frozen=True)
class SubScoreDef:
    id: str
    label: str
    weight: float
    indicators: tuple[IndicatorDef, ...]


SUBSCORES: tuple[SubScoreDef, ...] = (
    SubScoreDef("rentabilite", "Rentabilité", 0.25, (
        IndicatorDef("roe", "Rendement des capitaux propres (ROE, 12 mois)", "ratio", "higher"),
        IndicatorDef("net_margin", "Marge nette (12 mois)", "ratio", "higher"),
    )),
    SubScoreDef("solidite", "Solidité financière", 0.20, (
        IndicatorDef("debt_to_equity", "Dette / capitaux propres", "multiple", "lower"),
        IndicatorDef("interest_coverage", "Couverture des intérêts (résultat d'exploitation / intérêts)",
                     "multiple", "higher"),
    )),
    SubScoreDef("croissance", "Croissance", 0.15, (
        IndicatorDef("revenue_cagr_3y", "Croissance annuelle composée du chiffre d'affaires (3 ans)", "ratio",
                     "higher"),
        IndicatorDef("eps_cagr_3y", "Croissance annuelle composée du BPA (3 ans)", "ratio", "higher"),
    )),
    SubScoreDef("valorisation", "Valorisation", 0.15, (
        IndicatorDef("pe", "Cours / bénéfice (C/B)", "multiple", "lower"),
        IndicatorDef("pb", "Cours / valeur comptable (C/VC)", "multiple", "lower"),
    )),
    SubScoreDef("momentum_risque", "Momentum et risque", 0.15, (
        IndicatorDef("momentum_12_1", "Rendement sur 12 mois sauf le dernier mois", "ratio", "higher"),
        IndicatorDef("volatility_1y", "Volatilité annualisée (1 an)", "ratio", "lower"),
        IndicatorDef("max_drawdown_1y", "Repli maximal sur 1 an", "ratio", "lower"),
    )),
    SubScoreDef("evenements", "Événements récents", 0.10, (
        IndicatorDef("events_90d", "Événements des 90 derniers jours (50 = neutre)", "number", "higher"),
    )),
)
INDICATORS: dict[str, IndicatorDef] = {i.id: i for s in SUBSCORES for i in s.indicators}
SUBSCORE_OF: dict[str, str] = {i.id: s.id for s in SUBSCORES for i in s.indicators}
VALUATION = {"pe", "pb"}
ALREADY_0_100 = {"events_90d"}
EVENT_WINDOW_DAYS = 90
EVENT_HALF_LIFE_DAYS = 30


@dataclass
class Value:
    """A raw indicator: `worst` ranks it last (negative earnings for P/E, negative equity...)."""
    value: float | None
    worst: bool = False
    note: str | None = None

    @property
    def present(self) -> bool:
        return self.worst or self.value is not None


def missing(note: str) -> Value:
    return Value(None, False, note)


def finite(x: float | None) -> float | None:
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


# --- Fundamentals ------------------------------------------------------------------------------------

def ratio(num: float | None, den: float | None) -> float | None:
    num, den = finite(num), finite(den)
    if num is None or den is None or den == 0:
        return None
    return num / den


def cagr(start: float | None, end: float | None, years: float) -> Value:
    """Compound annual growth; undefined from a non-positive start, worst when it ends non-positive."""
    start, end = finite(start), finite(end)
    if start is None or end is None:
        return missing("Historique insuffisant (3 ans)")
    if start <= 0:
        return missing("Valeur de départ négative ou nulle : croissance composée non définie")
    if end <= 0:
        return Value(-1.0, True, "Valeur finale négative ou nulle : classé au dernier rang")
    return Value((end / start) ** (1 / years) - 1)


# --- Prices --------------------------------------------------------------------------------------------

def annualized_volatility(closes: pd.Series, periods_per_year: float) -> float | None:
    """Standard deviation of daily returns × √(periods per year): √252 for markets, √365 for crypto."""
    rets = closes.dropna().pct_change().dropna()
    if len(rets) < 20:
        return None
    return float(rets.std(ddof=1) * math.sqrt(periods_per_year))


def max_drawdown(closes: pd.Series) -> float | None:
    """Largest fall from a running peak, as a positive fraction (0.25 = -25 %)."""
    s = closes.dropna()
    if len(s) < 2:
        return None
    return float(-(s / s.cummax() - 1).min())


def value_asof(closes: pd.Series, when: pd.Timestamp) -> float | None:
    s = closes.loc[closes.index <= when].dropna()
    return float(s.iloc[-1]) if not s.empty else None


def momentum_12_1(closes: pd.Series, as_of: pd.Timestamp) -> float | None:
    """Return from 12 months ago to 1 month ago (the last month is skipped)."""
    if closes.empty or closes.index[0] > as_of - pd.DateOffset(months=12) + pd.Timedelta(days=7):
        return None
    start = value_asof(closes, as_of - pd.DateOffset(months=12))
    end = value_asof(closes, as_of - pd.DateOffset(months=1))
    if start is None or end is None or start <= 0:
        return None
    return end / start - 1


# --- Events --------------------------------------------------------------------------------------------

def event_weight(relevance: float, age_days: float) -> float:
    return max(0.0, min(1.0, relevance)) * 0.5 ** (max(0.0, age_days) / EVENT_HALF_LIFE_DAYS)


def events_value(events: Iterable[tuple[date, float, float]], as_of: date) -> tuple[float, int]:
    """(50 + 50 × weighted mean impact, events counted) over 90 days; 50 when there is none.

    events: (date, impact −1..+1, relevance 0..1); weight = relevance × 0.5^(age in days / 30).
    """
    total_w = total = 0.0
    n = 0
    for day, impact, relevance in events:
        age = (as_of - day).days
        if age < 0 or age > EVENT_WINDOW_DAYS:
            continue
        w = event_weight(relevance, age)
        total_w += w
        total += w * max(-1.0, min(1.0, impact))
        n += 1
    if total_w <= 0:
        return 50.0, n
    return 50.0 + 50.0 * total / total_w, n


# --- Ranks ---------------------------------------------------------------------------------------------

def cap(values: dict[str, float], lo_pct: float = 5, hi_pct: float = 95) -> dict[str, float]:
    """Each value clipped to the [5th, 95th] percentiles of the set."""
    if not values:
        return {}
    arr = np.array(list(values.values()), dtype=float)
    lo, hi = np.percentile(arr, lo_pct), np.percentile(arr, hi_pct)
    return {k: float(min(max(v, lo), hi)) for k, v in values.items()}


def percentile_ranks(values: dict[str, float], lower_is_better: bool) -> dict[str, float]:
    """0-100 rank in the set: 0 for the worst, 100 for the best, ties share their mean rank."""
    n = len(values)
    if n == 0:
        return {}
    if n == 1:
        return {k: 50.0 for k in values}
    series = pd.Series(values, dtype=float)
    ranks = (series.rank(method="average") - 1) / (n - 1) * 100
    if lower_is_better:
        ranks = 100 - ranks
    return {k: round(float(v), 2) for k, v in ranks.items()}


def rank_indicator(indicator: str, raw: dict[str, Value]) -> tuple[dict[str, float], dict[str, float]]:
    """(capped values, ranks) of one indicator over a comparison set; `worst` entries rank 0."""
    definition = INDICATORS[indicator]
    if indicator in ALREADY_0_100:
        vals = {k: float(v.value) for k, v in raw.items() if v.value is not None}
        return vals, {k: round(max(0.0, min(100.0, v)), 2) for k, v in vals.items()}
    usable = {k: float(v.value) for k, v in raw.items() if v.value is not None and not v.worst}
    capped = cap(usable)
    ranks = percentile_ranks(capped, definition.better == "lower")
    for k, v in raw.items():
        if v.worst:
            ranks[k] = 0.0
    return capped, ranks


# --- Sub-scores and the final score --------------------------------------------------------------------

def mean(values: Iterable[float | None]) -> float | None:
    kept = [v for v in values if v is not None]
    return sum(kept) / len(kept) if kept else None


def combine(subscores: dict[str, float | None], weights: dict[str, float] | None = None
            ) -> tuple[float | None, dict[str, float], bool]:
    """(score, effective weights, partiel): missing sub-scores give their weight to the present ones.

    `weights`: the nominal weights (default: SUBSCORES'); the API's custom score
    (app.services.custom_score) passes the user's, so both scores follow the same rule."""
    weights = weights if weights is not None else {s.id: s.weight for s in SUBSCORES}
    present = {k: v for k, v in subscores.items() if v is not None}
    total = sum(weights[k] for k in present)
    if total <= 0:
        return None, {k: 0.0 for k in weights}, True
    effective = {k: (weights[k] / total if k in present else 0.0) for k in weights}
    score = sum(present[k] * effective[k] for k in present)
    return score, effective, len(present) < len(weights)


def final_score(score: float) -> float:
    """The published score: clamped to 0-100, two decimals."""
    return round(min(100.0, max(0.0, score)), 2)
