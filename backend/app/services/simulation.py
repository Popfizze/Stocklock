"""Step 4 maths (pure): panic sale during 2022 versus holding until the last available date."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass
class PanicResult:
    start: pd.Timestamp
    end: pd.Timestamp
    initial: float
    sell_date: pd.Timestamp | None
    sell_value: float | None
    drawdown_at_sale: float | None
    reentry_date: pd.Timestamp | None
    hold_final: float
    panic_final: float
    hold_path: pd.Series
    panic_path: pd.Series

    @property
    def difference(self) -> float:
        return self.hold_final - self.panic_final


def portfolio_value(prices: pd.DataFrame, weights: dict[str, float], start: pd.Timestamp,
                    initial: float) -> pd.Series:
    """Buy-and-hold value (no rebalancing) of `weights` bought on the first common date >= start."""
    df = prices[list(weights)].dropna()
    df = df.loc[df.index >= start]
    first = df.iloc[0]
    units = {t: initial * w / first[t] for t, w in weights.items()}
    return sum(df[t] * u for t, u in units.items())


def simulate_panic(value: pd.Series, cash: pd.Series, sell_point: str = "trough", reentry: str = "never",
                   year: int = 2022) -> PanicResult:
    """`value`: buy-and-hold portfolio value; `cash`: cash-proxy price series (forward-filled onto `value`)."""
    value = value.dropna()
    initial = float(value.iloc[0])
    cash = cash.reindex(cash.index.union(value.index)).sort_index().ffill().reindex(value.index).bfill()
    in_year = value.loc[value.index.year == year]
    sell_date = None
    if sell_point == "trough":
        sell_date = in_year.idxmin()
    else:  # first_minus_20: first day 20 % below the starting value
        below = in_year.loc[in_year <= initial * 0.8]
        sell_date = below.index[0] if not below.empty else None
    if sell_date is None:
        return PanicResult(value.index[0], value.index[-1], initial, None, None, None, None,
                           float(value.iloc[-1]), float(value.iloc[-1]), value, value.copy())
    sell_value = float(value.loc[sell_date])
    reentry_date = None
    if reentry == "after_recovery":
        after = value.loc[value.index > sell_date]
        recovered = after.loc[after >= initial]
        reentry_date = recovered.index[0] if not recovered.empty else None
    panic = value.copy()
    cash_units = sell_value / float(cash.loc[sell_date])
    post = value.index > sell_date
    if reentry_date is None:
        panic.loc[post] = cash.loc[post] * cash_units
    else:
        out_of_market = post & (value.index < reentry_date)
        panic.loc[out_of_market] = cash.loc[out_of_market] * cash_units
        cash_at_reentry = float(cash.loc[reentry_date]) * cash_units
        units = cash_at_reentry / float(value.loc[reentry_date])
        back = value.index >= reentry_date
        panic.loc[back] = value.loc[back] * units
    return PanicResult(value.index[0], value.index[-1], initial, sell_date, sell_value,
                       sell_value / initial - 1, reentry_date, float(value.iloc[-1]), float(panic.iloc[-1]),
                       value, panic)


def cagr(start_value: float, end_value: float, start: pd.Timestamp, end: pd.Timestamp) -> float:
    years = (end - start).days / 365.25
    return (end_value / start_value) ** (1 / years) - 1 if years > 0 and start_value > 0 else float("nan")
