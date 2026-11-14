"""Step 3 maths (pure): after-tax value of TFSA (CELI), RRSP (REER), FHSA (CELIAPP) and a taxable account.

Framing: `annual_contribution` is a PRE-TAX amount of income set aside each year (start of year).
- TFSA / taxable: the amount is taxed first at `rate_now`, the net is deposited.
- RRSP / FHSA: deductible, the full amount is deposited; RRSP withdrawals are taxed at
  `rate_retirement`; a qualifying FHSA withdrawal is tax-free.
- Any amount above an account's room goes to a taxable side account (taxed first at `rate_now`).
- Taxable account: gains are capital gains realized at the horizon, inclusion rate x `rate_retirement`.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

RULES_PATH = Path(__file__).resolve().parent.parent / "rules" / "tax_rules_ca_2026.json"

ACCOUNTS = ("CELI", "REER", "CELIAPP", "Non enregistré")


@lru_cache(maxsize=1)
def rules() -> dict[str, Any]:
    return json.loads(RULES_PATH.read_text(encoding="utf-8"))


def tfsa_cumulative_room(age: int, year: int, r: dict[str, Any] | None = None) -> float:
    """Room accumulated since the year the person turned 18 (no prior contributions assumed)."""
    r = r or rules()
    first = max(2009, year - age + r["tfsa"]["eligibility_age"])
    return float(sum(v for y, v in r["tfsa"]["annual_limits"].items() if first <= int(y) <= year))


def rrsp_annual_room(income: float | None, r: dict[str, Any] | None = None) -> float:
    r = r or rules()
    cap = float(r["rrsp"]["dollar_limit"])
    if income is None:
        return cap
    return min(r["rrsp"]["rate_of_earned_income"] * income, cap)


def _bracket_rate(income: float, brackets: list[list[Any]]) -> float:
    for limit, rate in brackets:
        if limit is None or income <= limit:
            return float(rate)
    return float(brackets[-1][1])


def marginal_rate_quebec(income: float, r: dict[str, Any] | None = None) -> tuple[float, float, float]:
    """(combined, federal after Quebec abatement, Quebec) marginal rates for a Quebec resident."""
    r = r or rules()
    fed = _bracket_rate(income, r["federal_brackets"]) * (1 - r["quebec_abatement"])
    qc = _bracket_rate(income, r["quebec_brackets"])
    return fed + qc, fed, qc


@dataclass
class Params:
    annual_contribution: float
    years: int
    rate_now: float
    rate_retirement: float
    first_home_buyer: bool
    tfsa_room: float              # room available in year 1
    tfsa_annual_limit: float      # room added each later year
    rrsp_room: float              # annual RRSP room
    fhsa_annual: float = 8000.0
    fhsa_lifetime: float = 40000.0
    fhsa_max_years: int = 15
    inclusion_rate: float = 0.5


@dataclass
class AccountResult:
    account: str
    eligible: bool
    deposits: float = 0.0
    side_deposits: float = 0.0
    gross_value: float = 0.0
    tax_at_exit: float = 0.0
    after_tax: float = 0.0
    notes: list[str] = field(default_factory=list)


def _taxable_exit(value: float, cost: float, p: Params) -> float:
    gain = max(0.0, value - cost)
    return value - gain * p.inclusion_rate * p.rate_retirement


def project(p: Params, returns: np.ndarray) -> dict[str, AccountResult]:
    """Deterministic projection for one path of annual returns (length >= years)."""
    n = p.years
    g = returns[:n]
    out: dict[str, AccountResult] = {}

    def grow_side(side_bal: float, deposit: float, yr: int) -> float:
        return (side_bal + deposit) * (1 + g[yr])

    # TFSA
    bal = side = side_cost = dep = 0.0
    room = p.tfsa_room
    for yr in range(n):
        if yr > 0:
            room += p.tfsa_annual_limit
        net = p.annual_contribution * (1 - p.rate_now)
        put = min(net, room)
        room -= put
        dep += put
        bal = (bal + put) * (1 + g[yr])
        side = grow_side(side, net - put, yr)
        side_cost += net - put
    res = AccountResult("CELI", True, dep, side_cost, bal + side)
    res.after_tax = bal + _taxable_exit(side, side_cost, p)
    res.tax_at_exit = res.gross_value - res.after_tax
    out["CELI"] = res

    # RRSP
    bal = side = side_cost = dep = 0.0
    for yr in range(n):
        put = min(p.annual_contribution, p.rrsp_room)
        dep += put
        bal = (bal + put) * (1 + g[yr])
        extra = (p.annual_contribution - put) * (1 - p.rate_now)
        side = grow_side(side, extra, yr)
        side_cost += extra
    res = AccountResult("REER", True, dep, side_cost, bal + side)
    res.after_tax = bal * (1 - p.rate_retirement) + _taxable_exit(side, side_cost, p)
    res.tax_at_exit = res.gross_value - res.after_tax
    out["REER"] = res

    # FHSA
    if p.first_home_buyer:
        bal = side = side_cost = dep = 0.0
        withdrawn_year = min(n, p.fhsa_max_years)
        for yr in range(n):
            put = 0.0
            if yr < withdrawn_year:
                put = min(p.annual_contribution, p.fhsa_annual, p.fhsa_lifetime - dep)
            dep += put
            bal = (bal + put) * (1 + g[yr])
            extra = (p.annual_contribution - put) * (1 - p.rate_now)
            side = grow_side(side, extra, yr)
            side_cost += extra
            if yr + 1 == withdrawn_year and n > withdrawn_year:
                # qualifying withdrawal at the end of the participation period, proceeds kept taxable
                side += bal
                side_cost += bal
                bal = 0.0
        res = AccountResult("CELIAPP", True, dep, side_cost, bal + side)
        res.after_tax = bal + _taxable_exit(side, side_cost, p)
        res.tax_at_exit = res.gross_value - res.after_tax
        if n > p.fhsa_max_years:
            res.notes.append(f"Retrait admissible supposé à l'an {p.fhsa_max_years} (période de participation "
                             "maximale), produit ensuite placé en non enregistré.")
        out["CELIAPP"] = res
    else:
        out["CELIAPP"] = AccountResult("CELIAPP", False, notes=["Non admissible : pas premier acheteur."])

    # Taxable
    bal = cost = 0.0
    for yr in range(n):
        net = p.annual_contribution * (1 - p.rate_now)
        cost += net
        bal = (bal + net) * (1 + g[yr])
    res = AccountResult("Non enregistré", True, cost, 0.0, bal)
    res.after_tax = _taxable_exit(bal, cost, p)
    res.tax_at_exit = bal - res.after_tax
    out["Non enregistré"] = res
    return out


def ranking(results: dict[str, AccountResult]) -> list[tuple[str, float]]:
    rows = [(k, v.after_tax) for k, v in results.items() if v.eligible]
    return sorted(rows, key=lambda kv: kv[1], reverse=True)


def bootstrap_paths(monthly_log_returns: np.ndarray, expected_return: float, years: int, n_paths: int = 1000,
                    seed: int = 42) -> np.ndarray:
    """Annual returns resampled from historical monthly returns, re-centred on `expected_return`."""
    rng = np.random.default_rng(seed)
    demeaned = monthly_log_returns - monthly_log_returns.mean()
    drift = np.log1p(expected_return) / 12
    picks = rng.choice(demeaned, size=(n_paths, years, 12), replace=True)
    return np.expm1((picks + drift).sum(axis=2))
