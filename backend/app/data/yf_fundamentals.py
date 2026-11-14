"""Fundamentals via yfinance financial statements (used for .TO tickers and as a fallback).

yfinance exposes period ends but not filing dates. Point-in-time availability is approximated
with the Canadian continuous-disclosure deadlines (NI 51-102, non-venture issuers): annual
statements within 90 days, interim statements within 45 days of period end.
"""

from __future__ import annotations

from app.data import cache
from app.data.cache import ExternalUnavailable

SOURCE = "Yahoo Finance (yfinance)"
ANNUAL_LAG_DAYS = 90
QUARTERLY_LAG_DAYS = 45

INCOME_LINES = ("Total Revenue", "Net Income", "Operating Income")
BALANCE_LINES = ("Total Debt", "Stockholders Equity", "Total Assets",
                 "Total Liabilities Net Minority Interest")


def _frame_to_dict(frame, lines) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    if frame is None or frame.empty:
        return out
    for col in frame.columns:
        period = col.date().isoformat()
        for line in lines:
            if line in frame.index:
                val = frame.at[line, col]
                if val == val:  # skip NaN
                    out.setdefault(period, {})[line] = float(val)
    return out


def _download(ticker: str) -> dict:
    try:
        import yfinance as yf

        t = yf.Ticker(ticker)
        annual_income, annual_balance = t.income_stmt, t.balance_sheet
        q_income, q_balance = t.quarterly_income_stmt, t.quarterly_balance_sheet
        try:
            currency = (t.info or {}).get("financialCurrency")
        except Exception:
            currency = None
    except Exception as exc:  # yfinance raises many unrelated types on network issues
        raise ExternalUnavailable(SOURCE, f"téléchargement impossible ({type(exc).__name__})") from exc
    if annual_income is None or annual_income.empty:
        raise ExternalUnavailable(SOURCE, f"aucun état financier annuel renvoyé pour {ticker}")

    def merge(a: dict, b: dict) -> dict:
        for k, v in b.items():
            a.setdefault(k, {}).update(v)
        return a

    return {
        "currency": currency,
        "annual": merge(_frame_to_dict(annual_income, INCOME_LINES), _frame_to_dict(annual_balance, BALANCE_LINES)),
        "quarterly": merge(_frame_to_dict(q_income, INCOME_LINES), _frame_to_dict(q_balance, BALANCE_LINES)),
    }


def statements(ticker: str) -> tuple[dict, bool]:
    """{"currency", "annual": {period_end: {line: value}}, "quarterly": {...}}, cached 24 h."""
    return cache.cached("yfinance", f"statements|{ticker}", 86400, lambda: _download(ticker))
