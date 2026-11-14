"""The user's own score: the gold table `score_par_titre` rescored with the user's weights, live.

What can be recomputed from the gold table alone, without a new pipeline run:
- the six sub-score weights (any non-negative numbers, normalised to 100);
- leaving indicators out: a sub-score is the mean of its indicators' ranks, and every row keeps each
  indicator's rank, so a sub-score without, say, the 12-1 momentum is the mean of the other ranks.
What cannot, and why:
- the events' half-life (30 days) and window (90 days): the table keeps the events score, not the
  dated events it was computed from (they are in the pipeline's silver data);
- the price window (1 year) or a 3-year momentum: the table keeps one-year indicators only;
- the capping percentiles and the comparison sets: ranks are computed over a run's whole comparison
  set (by sector for valuation) and merged with earlier runs; re-ranking would not match the table.

The score follows the gold computation exactly, through its own functions
(app.score_pipeline.indicators: `mean` of the ranks, `combine` with redistribution of missing
sub-scores' weights, `final_score`): with the default weights it gives back the stored scores. A row
keeps its `partiel` flag (missing data), whatever the weights.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np

from app.score_pipeline import indicators as ind
from app.services import score_table

SUB_IDS = tuple(s.id for s in ind.SUBSCORES)
LABELS = {s.id: s.label for s in ind.SUBSCORES}
DEFAULT_WEIGHTS = {s.id: round(s.weight * 100, 6) for s in ind.SUBSCORES}
INDICATORS_OF = {s.id: tuple(i.id for i in s.indicators) for s in ind.SUBSCORES}
SLIDER_STEPS = tuple(range(0, 101, 5))
MAX_LIMIT = 500
MAX_TICKERS = 200


class ScoringError(ValueError):
    """An invalid choice of weights or factors (answered as HTTP 422 with this French message)."""


@dataclass(frozen=True)
class Choice:
    weights: dict[str, float]          # normalised, percent, sum 100
    excluded: frozenset[str]

    @property
    def custom(self) -> bool:
        same = all(abs(self.weights[k] - DEFAULT_WEIGHTS[k]) < 1e-6 for k in SUB_IDS)
        return not (same and not self.excluded)

    def fractions(self) -> dict[str, float]:
        return {k: self.weights[k] / 100 for k in SUB_IDS}

    def applied(self) -> dict[str, Any]:
        return {"weights": {k: round(self.weights[k], 4) for k in SUB_IDS}, "default_weights": dict(DEFAULT_WEIGHTS),
                "excluded_indicators": sorted(self.excluded), "custom": self.custom}


def choice(weights: dict[str, Any] | None = None, factors: dict[str, Any] | None = None) -> Choice:
    """Validated choice; omitted weights keep their default. Raises ScoringError (French message)."""
    merged = dict(DEFAULT_WEIGHTS)
    for key, value in (weights or {}).items():
        if key not in LABELS:
            raise ScoringError(f"Sous-score inconnu « {key} » ; sous-scores : {', '.join(SUB_IDS)}.")
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ScoringError(f"Le poids de « {LABELS[key]} » doit être un nombre positif ou nul (reçu : {value!r}).")
        merged[key] = float(value)
    total = sum(merged.values())
    if total <= 0:
        raise ScoringError("Au moins un sous-score doit avoir un poids supérieur à 0.")
    excluded = list((factors or {}).get("excluded_indicators") or [])
    unknown = [i for i in excluded if i not in ind.INDICATORS]
    if unknown:
        raise ScoringError(f"Indicateur inconnu « {unknown[0]} » ; indicateurs : {', '.join(ind.INDICATORS)}.")
    kept = [k for k in SUB_IDS if merged[k] > 0 and any(i not in excluded for i in INDICATORS_OF[k])]
    if not kept:
        raise ScoringError("Aucun sous-score pondéré ne garde d'indicateur : réintégrez un indicateur ou "
                           "donnez du poids à un autre sous-score.")
    return Choice({k: merged[k] / total * 100 for k in SUB_IDS}, frozenset(excluded))


DEFAULT = choice()


# --- One row ------------------------------------------------------------------------------------------

def sub_values(row: score_table.ScoreRow, excluded: frozenset[str]) -> dict[str, float | None]:
    """Each sub-score as the mean of its kept indicators' ranks (the gold computation's `mean`)."""
    stored = {s.id: s for s in row.sub_scores}
    out: dict[str, float | None] = {}
    for sub_id in SUB_IDS:
        sub = stored.get(sub_id)
        if sub is None or all(i in excluded for i in INDICATORS_OF[sub_id]):
            out[sub_id] = None
        elif sub.indicators:
            out[sub_id] = ind.mean(i.rank for i in sub.indicators if i.id not in excluded)
        else:
            out[sub_id] = sub.score  # a row without its indicators' ranks: the stored sub-score
    return out


def rescore(row: score_table.ScoreRow, c: Choice) -> tuple[float | None, list[dict[str, Any]]]:
    """(custom score, sub-scores with weights and contributions) of one row."""
    values = sub_values(row, c.excluded)
    score, effective, _ = ind.combine(values, c.fractions())
    stored = {s.id: s for s in row.sub_scores}
    subs = []
    for sub_id in SUB_IDS:
        value = values[sub_id]
        subs.append({"id": sub_id, "label": stored[sub_id].label if sub_id in stored else LABELS[sub_id],
                     "score": None if value is None else round(value, 2),
                     "default_weight": DEFAULT_WEIGHTS[sub_id], "weight": round(c.weights[sub_id], 4),
                     "effective_weight": round(effective[sub_id], 4),
                     "contribution": round((value or 0.0) * effective[sub_id], 2),
                     "default_contribution": stored[sub_id].contribution if sub_id in stored else 0.0})
    return (None if score is None else ind.final_score(score)), subs


def ranks(scores: dict[str, float | None]) -> dict[str, int | None]:
    """1 for the best score; ties by symbol; no rank without a score."""
    ordered = sorted((s for s, v in scores.items() if v is not None), key=lambda s: (-scores[s], s))
    out: dict[str, int | None] = {s: None for s in scores}
    out.update({s: i + 1 for i, s in enumerate(ordered)})
    return out


def comparison(default: float, custom: float | None, default_rank: int, custom_rank: int | None,
               partiel: bool) -> dict[str, Any]:
    return {"default_score": default, "custom_score": custom,
            "delta": None if custom is None else round(custom - default, 2),
            "default_rank": default_rank, "custom_rank": custom_rank,
            "rank_change": None if custom_rank is None else default_rank - custom_rank, "partiel": partiel}


# --- The whole table ------------------------------------------------------------------------------------

def rescore_table(c: Choice) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    """(table state, {symbol: ReweightedRow}) for every row of the gold table."""
    table = score_table.load()
    rows: dict[str, score_table.ScoreRow] = table["rows"] if table["status"] == "available" else {}
    rescored = {symbol: rescore(row, c) for symbol, row in rows.items()}
    default_ranks = ranks({s: r.score for s, r in rows.items()})
    custom_ranks = ranks({s: v[0] for s, v in rescored.items()})
    out = {}
    for symbol, row in rows.items():
        custom, subs = rescored[symbol]
        out[symbol] = {"symbol": symbol, "date": row.date.isoformat(), "comparison_set": row.comparison_set,
                       **comparison(row.score, custom, default_ranks[symbol], custom_ranks[symbol], row.partiel),
                       "sub_scores": subs}
    return table, out


def reweight(c: Choice, tickers: list[str] | None = None, limit: int = 50) -> dict[str, Any]:
    """The `ReweightResponse`: requested rows in order, or the `limit` best by custom score."""
    table, rows = rescore_table(c)
    if tickers:
        items = [rows[t] for t in tickers if t in rows]
        missing = [t for t in tickers if t not in rows]
    else:
        items = sorted((r for r in rows.values() if r["custom_rank"] is not None),
                       key=lambda r: r["custom_rank"])[:limit]
        missing = []
    return {"status": table["status"], "message": table["message"], "generated_at": table["generated_at"],
            "applied": c.applied(), "total": len(rows), "items": items, "missing": missing}


# --- Sensitivity ----------------------------------------------------------------------------------------

def _scores(matrix: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Vectorised `combine` + `final_score` over rows: Σ w·s ÷ Σ w over each row's present sub-scores."""
    present = ~np.isnan(matrix)
    den = present @ weights
    num = np.nan_to_num(matrix) @ weights
    with np.errstate(invalid="ignore", divide="ignore"):
        raw = np.where(den > 0, num / np.where(den > 0, den, 1), np.nan)
    return np.round(np.clip(raw, 0, 100), 2)


def _rank_of(scores: np.ndarray, symbols: list[str], index: int) -> int | None:
    mine = scores[index]
    if np.isnan(mine):
        return None
    better = (scores > mine) | ((scores == mine) & (np.array(symbols) < symbols[index]))
    return int(np.count_nonzero(better & ~np.isnan(scores))) + 1


def simulate(symbol: str, c: Choice) -> dict[str, Any]:
    """The `ScoreSimulation`: for each sub-score, the title's custom score and rank as that weight's slider
    goes from 0 to 100 (step 5) while the other weights stay as they are (then normalised to 100)."""
    table, rows = rescore_table(c)
    base = {"symbol": symbol, "status": table["status"], "message": table["message"], "applied": None,
            "comparison": None, "total": len(rows), "curves": []}
    if table["status"] != "available":
        return base
    if symbol not in rows:
        return {**base, "message": f"{symbol} ne figure pas dans la table des scores."}
    symbols = sorted(rows)
    matrix = np.array([[np.nan if (v := sub_values(table["rows"][s], c.excluded)[k]) is None else v
                        for k in SUB_IDS] for s in symbols], dtype=float)
    index = symbols.index(symbol)
    current = np.array([c.weights[k] for k in SUB_IDS])
    curves = []
    for j, sub_id in enumerate(SUB_IDS):
        points = []
        for step in SLIDER_STEPS:
            weights = current.copy()
            weights[j] = step
            if weights.sum() <= 0:
                points.append({"weight": step, "score": None, "rank": None})
                continue
            scores = _scores(matrix, weights / weights.sum())
            score = scores[index]
            points.append({"weight": step, "score": None if np.isnan(score) else float(score),
                           "rank": _rank_of(scores, symbols, index)})
        value = matrix[index, j]
        curves.append({"id": sub_id, "label": LABELS[sub_id], "weight": round(c.weights[sub_id], 4),
                       "sub_score": None if np.isnan(value) else round(float(value), 2), "points": points})
    row = rows[symbol]
    keys = ("default_score", "custom_score", "delta", "default_rank", "custom_rank", "rank_change", "partiel")
    return {**base, "applied": c.applied(), "comparison": {k: row[k] for k in keys}, "curves": curves}
