"""Deterministic price metrics on starter-kit adjusted closes."""

from __future__ import annotations

import math
from datetime import date

import numpy as np
import pandas as pd


def window(series: pd.Series, start: date | pd.Timestamp, end: date | pd.Timestamp) -> pd.Series:
    return series.loc[(series.index >= pd.Timestamp(start)) & (series.index <= pd.Timestamp(end))]


def total_return(series: pd.Series) -> float | None:
    s = series.dropna()
    if len(s) < 2:
        return None
    return float(s.iloc[-1] / s.iloc[0] - 1)


def periods_per_year(series: pd.Series) -> float:
    """Observed rows per year (≈252 for equities, ≈365 for crypto)."""
    if len(series) < 2:
        return 252.0
    span_years = (series.index[-1] - series.index[0]).days / 365.25
    return (len(series) - 1) / span_years if span_years > 0 else 252.0


def annualized_volatility(series: pd.Series) -> float | None:
    s = series.dropna()
    if len(s) < 20:
        return None
    rets = np.log(s / s.shift(1)).dropna()
    return float(rets.std(ddof=1) * math.sqrt(periods_per_year(s)))


def max_drawdown(series: pd.Series) -> float | None:
    s = series.dropna()
    if len(s) < 2:
        return None
    return float((s / s.cummax() - 1).min())


def value_asof(series: pd.Series, when: pd.Timestamp) -> float | None:
    s = series.loc[series.index <= when]
    return float(s.iloc[-1]) if not s.empty else None


def momentum_12_1(series: pd.Series, as_of: pd.Timestamp) -> float | None:
    """Return from t-12 months to t-1 month (skips the last month, standard 12-1 momentum)."""
    p_start = value_asof(series, as_of - pd.DateOffset(months=12))
    p_end = value_asof(series, as_of - pd.DateOffset(months=1))
    if p_start is None or p_end is None or p_start <= 0:
        return None
    return p_end / p_start - 1


def aligned(a: pd.Series, b: pd.Series) -> pd.DataFrame:
    """Inner join on common dates (each market keeps only days both traded)."""
    return pd.concat({"a": a, "b": b}, axis=1, join="inner").dropna()


def beta_corr(asset: pd.Series, bench: pd.Series) -> dict[str, float | int] | None:
    df = aligned(asset, bench)
    rets = df.pct_change().dropna()
    if len(rets) < 10:
        return None
    var_b = rets["b"].var(ddof=1)
    beta = rets["a"].cov(rets["b"]) / var_b if var_b > 0 else float("nan")
    corr = rets["a"].corr(rets["b"])
    return {"beta": float(beta), "corr": float(corr), "r2": float(corr**2), "n": int(len(rets))}


def weekly_returns(series: pd.Series) -> pd.Series:
    """Friday-close weekly returns: removes TSX/US holiday and crypto weekend misalignment."""
    return series.resample("W-FRI").last().pct_change().dropna()


def largest_moves(series: pd.Series, k: int = 3) -> list[tuple[str, float]]:
    rets = series.pct_change().dropna()
    top = rets.reindex(rets.abs().sort_values(ascending=False).index[:k])
    return [(d.date().isoformat(), float(r)) for d, r in top.items()]


def scale(x: float | None, lo: float, hi: float) -> float | None:
    """Linear map of x to 0-100 (lo -> 0, hi -> 100, clamped). lo > hi inverts the scale."""
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    t = (x - lo) / (hi - lo)
    return float(min(1.0, max(0.0, t)) * 100)
