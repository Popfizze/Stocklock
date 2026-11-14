"""Starter-kit CSV loading with the known data-quality corrections applied.

Corrections (all documented in the responses' `assumptions`/`limits`):
- CNQ.TO: the 1.021 "split" on 2022-08-22 is the special dividend counted a second time.
  Prices (OHLC, close, adj_close) and dividends before that date are multiplied back by 1.021
  and the split row is dropped.
- FX: the Bank of Canada series has no rate on Canadian holidays; the last known rate is carried
  forward (as-of lookup).
- Macro: monthly series are dated to the reference month; a value becomes usable one month later
  (available_date = date + 1 month) to avoid look-ahead.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

import pandas as pd

from app.config import get_settings

CNQ_TICKER = "CNQ.TO"
CNQ_SPURIOUS_SPLIT_DATE = pd.Timestamp("2022-08-22")
CNQ_SPURIOUS_FACTOR = 1.021

CORRECTION_NOTES = [
    "CNQ.TO : le « split » de 1,021 du 2022-08-22 est traité comme un dividende spécial compté "
    "deux fois ; les prix et dividendes antérieurs sont remultipliés par 1,021.",
    "Change USD/CAD : les jours sans taux de la Banque du Canada reprennent le dernier taux connu.",
    "Macro mensuelle : chaque valeur n'est utilisée qu'un mois après son mois de référence "
    "(pas de look-ahead).",
]

STARTER_SOURCE_ID = "starter_prices"


@dataclass(frozen=True)
class MacroPoint:
    series_id: str
    label: str
    unit: str
    value: float
    ref_date: date
    available_date: date
    stale: bool


def _data_dir() -> Path:
    return get_settings().data_dir


def fix_cnq_spurious_split(prices: pd.DataFrame, actions: pd.DataFrame
                           ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Undo the CNQ.TO double-counted special dividend. Pure function (returns copies)."""
    prices = prices.copy()
    actions = actions.copy()
    mask = (prices["ticker"] == CNQ_TICKER) & (prices["date"] < CNQ_SPURIOUS_SPLIT_DATE)
    for col in ("open", "high", "low", "close", "adj_close"):
        prices.loc[mask, col] = prices.loc[mask, col] * CNQ_SPURIOUS_FACTOR
    is_cnq = actions["ticker"] == CNQ_TICKER
    spurious = is_cnq & (actions["action"] == "split") & (actions["ex_date"] == CNQ_SPURIOUS_SPLIT_DATE)
    old_div = is_cnq & (actions["action"] == "dividend") & (actions["ex_date"] < CNQ_SPURIOUS_SPLIT_DATE)
    actions.loc[old_div, "value"] = actions.loc[old_div, "value"] * CNQ_SPURIOUS_FACTOR
    actions = actions.loc[~spurious].reset_index(drop=True)
    return prices, actions


@lru_cache(maxsize=1)
def _raw_tables() -> tuple[pd.DataFrame, pd.DataFrame]:
    d = _data_dir()
    prices_df = pd.read_csv(d / "prices_daily.csv", parse_dates=["date"])
    actions_df = pd.read_csv(d / "corporate_actions.csv", parse_dates=["ex_date"])
    return prices_df, actions_df


@lru_cache(maxsize=2)
def _tables(cnq_fix: bool) -> tuple[pd.DataFrame, pd.DataFrame]:
    raw_prices, raw_actions = _raw_tables()
    if not cnq_fix:
        return raw_prices, raw_actions
    return fix_cnq_spurious_split(raw_prices, raw_actions)


def prices(cnq_fix: bool = True) -> pd.DataFrame:
    return _tables(cnq_fix)[0]


def corporate_actions(cnq_fix: bool = True) -> pd.DataFrame:
    return _tables(cnq_fix)[1]


@lru_cache(maxsize=1)
def universe() -> pd.DataFrame:
    return pd.read_csv(_data_dir() / "assets_universe.csv")


def asset_info(ticker: str) -> dict | None:
    u = universe()
    row = u.loc[u["ticker"] == ticker]
    if row.empty:
        return None
    return row.iloc[0].to_dict()


def in_starter(ticker: str) -> bool:
    return asset_info(ticker) is not None


def last_price_date() -> pd.Timestamp:
    return prices()["date"].max()


@lru_cache(maxsize=128)
def history(ticker: str, cnq_fix: bool = True) -> pd.DataFrame:
    """Rows for one ticker indexed by date: close, adj_close, volume."""
    p = prices(cnq_fix)
    df = p.loc[p["ticker"] == ticker, ["date", "close", "adj_close", "volume"]].set_index("date")
    return df.sort_index()


def adj_close(ticker: str, cnq_fix: bool = True) -> pd.Series:
    return history(ticker, cnq_fix)["adj_close"]


# --- FX -----------------------------------------------------------------------------------------

@lru_cache(maxsize=1)
def fx_usdcad() -> pd.Series:
    fx = pd.read_csv(_data_dir() / "fx_usdcad_daily.csv", parse_dates=["date"])
    return fx.set_index("date")["usdcad"].sort_index()


def fx_asof(fx: pd.Series, dates: pd.DatetimeIndex) -> pd.Series:
    """USD->CAD rate for each date, carrying the last known rate forward (holidays, weekends)."""
    dates = pd.DatetimeIndex(dates)
    out = fx.reindex(fx.index.union(dates)).sort_index().ffill().reindex(dates)
    if out.isna().any():  # dates before the first observation: use the first known rate
        out = out.fillna(fx.iloc[0])
    return out


def to_cad(series: pd.Series, currency: str) -> pd.Series:
    if currency == "CAD":
        return series
    rate = fx_asof(fx_usdcad(), series.index)
    return series * rate.values


def adj_close_cad(ticker: str, cnq_fix: bool = True) -> pd.Series:
    info = asset_info(ticker)
    currency = info["currency"] if info else "USD"
    return to_cad(adj_close(ticker, cnq_fix), currency)


# --- Macro --------------------------------------------------------------------------------------

def lag_monthly(macro_df: pd.DataFrame, months: int = 1) -> pd.DataFrame:
    """Add `available_date`: +`months` for monthly series, same day otherwise."""
    macro_df = macro_df.copy()
    monthly = macro_df["frequency"].str.contains("monthly", case=False, na=False)
    macro_df["available_date"] = macro_df["date"]
    if months:
        macro_df.loc[monthly, "available_date"] = macro_df.loc[monthly, "date"] + pd.DateOffset(months=months)
    return macro_df


@lru_cache(maxsize=1)
def _raw_macro() -> pd.DataFrame:
    return pd.read_csv(_data_dir() / "macro_rates.csv", parse_dates=["date"])


@lru_cache(maxsize=4)
def macro(lag_months: int = 1) -> pd.DataFrame:
    return lag_monthly(_raw_macro(), lag_months)


def macro_asof(series_id: str, when: date | pd.Timestamp, table: pd.DataFrame | None = None,
               lag_months: int = 1) -> MacroPoint | None:
    """Latest value of a series that was already available on `when`."""
    table = macro(lag_months) if table is None else table
    when = pd.Timestamp(when)
    s = table.loc[(table["series_id"] == series_id) & (table["available_date"] <= when)]
    if s.empty:
        return None
    row = s.sort_values("available_date").iloc[-1]
    monthly = "monthly" in str(row["frequency"]).lower()
    if monthly:
        expected_ref = (when - pd.DateOffset(months=lag_months)).to_period("M")
        stale = row["date"].to_period("M") < expected_ref
    else:
        stale = (when - row["date"]).days > 7
    return MacroPoint(
        series_id=series_id,
        label=str(row["label"]),
        unit=str(row["unit"]),
        value=float(row["value"]),
        ref_date=row["date"].date(),
        available_date=row["available_date"].date(),
        stale=bool(stale),
    )


def us_cpi_yoy_asof(when: date | pd.Timestamp, table: pd.DataFrame | None = None,
                    lag_months: int = 1) -> tuple[float, date] | None:
    """US CPI year-over-year inflation (%) from the CPIAUCSL index, lag-aware."""
    table = macro(lag_months) if table is None else table
    point = macro_asof("CPIAUCSL", when, table, lag_months)
    if point is None:
        return None
    ref = pd.Timestamp(point.ref_date)
    prior = table.loc[(table["series_id"] == "CPIAUCSL") & (table["date"] == ref - pd.DateOffset(years=1))]
    if prior.empty:
        return None
    return (point.value / float(prior["value"].iloc[0]) - 1) * 100, point.ref_date
