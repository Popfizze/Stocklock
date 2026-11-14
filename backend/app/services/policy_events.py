"""Dated policy-rate decisions of the Bank of Canada and the Fed, read from the starter macro series.

Both series change the day after the announcement: the Bank of Canada's target (V39079, « changes on
announcement dates » in the kit, new value the next business day) and the U.S. effective federal funds
rate (DFF, daily). A decision is a jump of at least `MIN_STEP` percentage points between two
consecutive observations; it is dated on the observation before the jump, the announcement day.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from app.data import starter

MIN_STEP = 0.15  # percentage points: decisions move by 0.25 or more, DFF drifts by a few hundredths
POLICY_SERIES = (
    ("V39079", "Banque du Canada", "taux directeur",
     "https://www.banqueducanada.ca/grandes-fonctions/politique-monetaire/taux-directeur/"),
    ("DFF", "Réserve fédérale (Fed)", "taux des fonds fédéraux effectif",
     "https://www.federalreserve.gov/monetarypolicy/openmarket.htm"),
)


def rate_decisions(series_id: str, start: date, end: date, min_step: float = MIN_STEP) -> list[dict]:
    """Announcements in [start, end]: {date, effective, before, after, change} (percentage points)."""
    table = starter.macro(0)
    s = table.loc[table["series_id"] == series_id].set_index("date")["value"].sort_index()
    s = s[~s.index.duplicated(keep="last")].dropna()
    out = []
    previous = s.shift(1)
    for when, value in s.items():
        before = previous.loc[when]
        if pd.isna(before) or abs(value - before) < min_step:
            continue
        announced = s.index[s.index.get_loc(when) - 1].date()
        if start <= announced <= end:
            out.append({"date": announced, "effective": when.date(), "before": float(before),
                        "after": float(value), "change": float(value - before)})
    return out


def label(bank: str, decision: dict) -> str:
    verb = "hausse" if decision["change"] > 0 else "baisse"
    return (f"{bank} : {verb} du taux de {abs(decision['change']):.2f} point, "
            f"{decision['before']:.2f} % → {decision['after']:.2f} %").replace(".", ",")
