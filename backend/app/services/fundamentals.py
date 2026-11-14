"""Fundamentals: raw retrieval (EDGAR / yfinance) then point-in-time normalization (annual / TTM).

Point-in-time ON keeps only what was public on the analysis date: EDGAR facts by their filing
date (`filed`), yfinance periods by period end + regulatory lag. OFF keeps every period that
ended before the analysis date, which exposes the look-ahead bias for comparison.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import pandas as pd

from app.data import edgar, starter, yf_fundamentals
from app.data.cache import ExternalUnavailable

EDGAR_FORMS = {"10-K", "10-K/A", "10-Q", "10-Q/A"}


@dataclass
class RawFundamentals:
    source: str          # "edgar" | "yfinance"
    title: str
    url: str
    payload: dict
    currency: str | None
    from_cache: bool
    rows: int


@dataclass
class Fundamentals:
    source: str
    period: str          # "annual" | "ttm"
    period_end: date
    available_on: date
    currency_reported: str
    usd_per_unit: float
    revenue: float | None
    revenue_prev: float | None
    net_income: float | None
    equity: float | None
    assets: float | None
    debt: float | None
    debt_concept: str | None
    excluded_by_pit: int = 0
    notes: list[str] = field(default_factory=list)

    @property
    def net_margin(self) -> float | None:
        if self.revenue and self.net_income is not None and self.revenue > 0:
            return self.net_income / self.revenue
        return None

    @property
    def roe(self) -> float | None:
        if self.equity and self.equity > 0 and self.net_income is not None:
            return self.net_income / self.equity
        return None

    @property
    def revenue_growth(self) -> float | None:
        if self.revenue and self.revenue_prev and self.revenue_prev > 0:
            return self.revenue / self.revenue_prev - 1
        return None

    @property
    def debt_to_equity(self) -> float | None:
        if self.debt is not None and self.equity and self.equity > 0:
            return self.debt / self.equity
        return None

    @property
    def equity_to_assets(self) -> float | None:
        if self.equity is not None and self.assets and self.assets > 0:
            return self.equity / self.assets
        return None


# --- retrieval --------------------------------------------------------------------------------------

def _edgar_raw(cik: int) -> RawFundamentals | None:
    facts, hit = edgar.company_facts(cik)
    gaap = facts.get("facts", {}).get("us-gaap", {})
    if "NetIncomeLoss" not in gaap:
        return None
    rows = sum(len(next(iter(v.get("units", {}).values()), [])) for v in gaap.values())
    return RawFundamentals("edgar", f"SEC EDGAR companyfacts, CIK {cik} ({facts.get('entityName', '')})",
                           edgar.FACTS_URL.format(cik=cik), facts, "USD", hit, rows)


def _yf_raw(ticker: str) -> RawFundamentals:
    data, hit = yf_fundamentals.statements(ticker)
    rows = sum(len(v) for v in data["annual"].values()) + sum(len(v) for v in data["quarterly"].values())
    return RawFundamentals("yfinance", f"Yahoo Finance via yfinance, états financiers {ticker}",
                           f"https://finance.yahoo.com/quote/{ticker}/financials", data,
                           data.get("currency"), hit, rows)


def fetch(ticker: str, cik: int | None, choice: str) -> tuple[RawFundamentals | None, list[str]]:
    """Returns (raw, warnings). Raises ExternalUnavailable only when every allowed source failed."""
    warnings: list[str] = []
    errors: list[ExternalUnavailable] = []
    if choice in {"edgar", "edgar_then_yfinance"}:
        if cik is None:
            warnings.append(f"EDGAR : aucun CIK pour {ticker} (émetteur non américain ou FNB).")
        else:
            try:
                raw = _edgar_raw(cik)
                if raw is not None:
                    return raw, warnings
                warnings.append(f"EDGAR : pas de faits us-gaap exploitables pour {ticker} (IFRS ?).")
            except ExternalUnavailable as exc:
                errors.append(exc)
                warnings.append(f"EDGAR indisponible ({exc.reason}).")
        if choice == "edgar":
            if errors:
                raise errors[0]
            return None, warnings
        warnings.append("Repli sur yfinance pour les relevés.")
    try:
        return _yf_raw(ticker), warnings
    except ExternalUnavailable as exc:
        warnings.append(f"yfinance indisponible ({exc.reason}).")
        return None, warnings


# --- EDGAR normalization ----------------------------------------------------------------------------

def _d(s: str) -> date:
    return date.fromisoformat(s)


def _concept_rows(facts: dict, concept: str) -> list[dict]:
    node = facts.get("facts", {}).get("us-gaap", {}).get(concept)
    if not node:
        return []
    units = node.get("units", {})
    return units.get("USD") or next(iter(units.values()), [])


def _eligible(rows: list[dict], as_of: date, pit: bool) -> tuple[list[dict], int]:
    """Rows public on `as_of` (pit) or simply ended by then; one row per period, latest filing."""
    best: dict[tuple, dict] = {}
    excluded = 0
    for r in rows:
        if r.get("form") not in EDGAR_FORMS or _d(r["end"]) > as_of:
            continue
        if _d(r["filed"]) > as_of:
            excluded += 1
            if pit:
                continue
        key = (r.get("start"), r["end"])
        if key not in best or r["filed"] > best[key]["filed"]:
            best[key] = r
    return list(best.values()), excluded


def _duration(r: dict) -> int:
    return (_d(r["end"]) - _d(r["start"])).days if r.get("start") else 0


def _find(rows: list[dict], end: date, dur_lo: int, dur_hi: int, tol_days: int = 7) -> dict | None:
    hits = [r for r in rows if r.get("start") and dur_lo <= _duration(r) <= dur_hi
            and abs((_d(r["end"]) - end).days) <= tol_days]
    return max(hits, key=lambda r: r["filed"]) if hits else None


def _flow_at(rows: list[dict], end: date, period: str) -> tuple[float | None, str | None]:
    """Annual value, or trailing-twelve-months value ending at `end` (FY + YTD − prior YTD)."""
    annual = _find(rows, end, 350, 380, tol_days=0)
    if annual is not None:
        return float(annual["val"]), annual["filed"]
    if period == "annual":
        return None, None
    ytd_rows = [r for r in rows if r.get("start") and _d(r["end"]) == end and 80 <= _duration(r) < 350]
    if not ytd_rows:
        return None, None
    ytd = max(ytd_rows, key=_duration)
    start = _d(ytd["start"])
    fy = _find(rows, start - timedelta(days=1), 350, 380)
    prior = _find(rows, end - timedelta(days=365), _duration(ytd) - 10, _duration(ytd) + 10)
    if fy is None or prior is None:
        return None, None
    filed = max(fy["filed"], ytd["filed"], prior["filed"])
    return float(fy["val"]) + float(ytd["val"]) - float(prior["val"]), filed


def _instant_at(rows: list[dict], end: date) -> float | None:
    hits = [r for r in rows if not r.get("start") and _d(r["end"]) == end]
    return float(max(hits, key=lambda r: r["filed"])["val"]) if hits else None


def _normalize_edgar(raw: RawFundamentals, period: str, pit: bool, as_of: date) -> Fundamentals | None:
    facts = raw.payload
    net_rows, excluded = _eligible(_concept_rows(facts, "NetIncomeLoss"), as_of, pit)
    if period == "annual":
        ends = [_d(r["end"]) for r in net_rows if r.get("fp") == "FY" and 350 <= _duration(r) <= 380]
    else:
        ends = [_d(r["end"]) for r in net_rows if r.get("start") and _duration(r) >= 80]
    if not ends:
        return None
    notes: list[str] = []
    end = None
    net = filed = None
    for candidate in sorted(set(ends), reverse=True):  # latest end with a computable value
        net, filed = _flow_at(net_rows, candidate, period)
        if net is not None:
            end = candidate
            break
    if end is None:
        return None
    revenue = revenue_prev = None
    for concept in edgar.REVENUE_CONCEPTS:
        rows, _ = _eligible(_concept_rows(facts, concept), as_of, pit)
        revenue, _f = _flow_at(rows, end, period)
        if revenue is not None:
            prev_ends = sorted({_d(r["end"]) for r in rows if abs((_d(r["end"]) - (end - timedelta(days=365))).days) <= 10})
            if prev_ends:
                revenue_prev, _ = _flow_at(rows, prev_ends[-1], period)
            break
    def instant(concept: str) -> float | None:
        rows, _ = _eligible(_concept_rows(facts, concept), as_of, pit)
        return _instant_at(rows, end)
    equity, assets = instant("StockholdersEquity"), instant("Assets")
    debt = debt_concept = None
    for concept in (*edgar.DEBT_CONCEPTS, "Liabilities"):
        debt = instant(concept)
        if debt is not None:
            debt_concept = concept
            break
    if period == "ttm" and revenue_prev is None:
        notes.append("Croissance TTM non calculable (périodes comparables manquantes).")
    return Fundamentals("edgar", period, end, _d(filed), "USD", 1.0, revenue, revenue_prev, net,
                        equity, assets, debt, debt_concept, excluded, notes)


# --- yfinance normalization -------------------------------------------------------------------------

def _usd_per_unit(currency: str | None, when: date) -> tuple[float, str]:
    if currency in (None, "USD"):
        return 1.0, "USD"
    if currency == "CAD":
        rate = starter.fx_asof(starter.fx_usdcad(), pd.DatetimeIndex([pd.Timestamp(when)])).iloc[0]
        return 1.0 / float(rate), "CAD"
    return 1.0, currency


def _normalize_yf(raw: RawFundamentals, period: str, pit: bool, as_of: date) -> Fundamentals | None:
    data = raw.payload
    notes: list[str] = []
    table = data["annual"] if period == "annual" else data["quarterly"]
    lag = yf_fundamentals.ANNUAL_LAG_DAYS if period == "annual" else yf_fundamentals.QUARTERLY_LAG_DAYS
    ended = sorted(p for p in table if date.fromisoformat(p) <= as_of)
    public = [p for p in ended if date.fromisoformat(p) + timedelta(days=lag) <= as_of]
    keep = public if pit else ended
    excluded = len(ended) - len(public)
    if not keep:
        return None
    last = keep[-1]
    end = date.fromisoformat(last)
    vals = table[last]
    if period == "annual":
        revenue, net = vals.get("Total Revenue"), vals.get("Net Income")
        revenue_prev = table[keep[-2]].get("Total Revenue") if len(keep) > 1 else None
    else:
        quarters = keep[-4:]
        if len(quarters) < 4:
            return None
        revenue = sum(table[q].get("Total Revenue", float("nan")) for q in quarters)
        net = sum(table[q].get("Net Income", float("nan")) for q in quarters)
        revenue, net = (None if v != v else v for v in (revenue, net))
        if len(keep) >= 8:
            revenue_prev = sum(table[q].get("Total Revenue", 0.0) for q in keep[-8:-4])
        else:
            annual = sorted(p for p in data["annual"] if date.fromisoformat(p) <= as_of)
            revenue_prev = None
            if len(annual) >= 2 and revenue:
                a1, a0 = data["annual"][annual[-1]], data["annual"][annual[-2]]
                if a1.get("Total Revenue") and a0.get("Total Revenue"):
                    # TTM level kept; growth taken from the last two fiscal years
                    revenue_prev = revenue * a0["Total Revenue"] / a1["Total Revenue"]
            notes.append("yfinance ne fournit que 4 à 6 trimestres : croissance TTM approchée par la "
                         "croissance des deux derniers exercices annuels.")
    usd, cur = _usd_per_unit(raw.currency, end)
    def conv(v: float | None) -> float | None:
        return None if v is None else v * usd
    if raw.currency not in (None, "USD", "CAD"):
        notes.append(f"Devise des états {raw.currency} non convertie.")
    return Fundamentals("yfinance", period, end, end + timedelta(days=lag), cur, usd,
                        conv(revenue), conv(revenue_prev), conv(net),
                        conv(vals.get("Stockholders Equity")), conv(vals.get("Total Assets")),
                        conv(vals.get("Total Debt")), "Total Debt" if "Total Debt" in vals else None,
                        excluded, notes)


def normalize(raw: RawFundamentals, period: str, pit: bool, as_of: date) -> Fundamentals | None:
    if raw.source == "edgar":
        return _normalize_edgar(raw, period, pit, as_of)
    return _normalize_yf(raw, period, pit, as_of)


def preview_rows(f: Fundamentals) -> list[list[Any]]:
    return [
        ["Chiffre d'affaires (USD)", f.revenue], ["Chiffre d'affaires période précédente (USD)", f.revenue_prev],
        ["Résultat net (USD)", f.net_income], ["Capitaux propres (USD)", f.equity],
        ["Actifs (USD)", f.assets], [f"Dette (USD, {f.debt_concept or 'n.d.'})", f.debt],
        ["Marge nette", f.net_margin], ["ROE", f.roe], ["Croissance du CA", f.revenue_growth],
        ["Dette / capitaux propres", f.debt_to_equity], ["Capitaux propres / actifs", f.equity_to_assets],
    ]
