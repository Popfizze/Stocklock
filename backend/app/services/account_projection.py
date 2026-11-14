"""Year-by-year after-tax value of CELI, REER, CELIAPP and a taxable account, for one asset.

Extends `tax_calc.project` (same framing, same `Params`) with the asset's distributions:
- each year the asset pays `dividend_yield` of its value and its price grows by `price_return`;
- CELI / CELIAPP: distributions are sheltered, but US dividends lose the 15 % US withholding
  (the Canada-US treaty does not recognise these accounts);
- REER: US withholding exempt (treaty art. XXI); everything is taxed when withdrawn;
- taxable account, and every taxable side account holding amounts above a plafond: distributions
  are taxed each year at `distribution_rate`, reinvested after tax and added to the cost; price
  gains are taxed at the horizon (inclusion rate x retirement rate).

`after_tax_by_year[k]` is what would be left if everything were withdrawn at the end of year k + 1.
With `dividend_yield = 0` the final values equal `tax_calc.project` exactly (see tests).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np

from app.services import tax_calc


@dataclass(frozen=True)
class AssetIncome:
    dividend_yield: float = 0.0
    us_withholding: bool = False
    distribution_rate: float = 0.0  # tax on distributions held in a taxable account, current year
    withholding_rate: float = 0.15


@dataclass
class YearlyResult:
    account: str
    eligible: bool
    after_tax_by_year: list[float] = field(default_factory=list)
    deposits: float = 0.0
    side_deposits: float = 0.0
    gross_value: float = 0.0
    tax_at_exit: float = 0.0
    after_tax: float = 0.0
    annual_tax_paid: float = 0.0   # tax on distributions paid along the way (taxable parts)
    withholding_lost: float = 0.0  # US withholding that can never be recovered (CELI, CELIAPP)
    notes: list[str] = field(default_factory=list)


def eligible_dividend_rate(income: float, r: dict[str, Any] | None = None) -> float:
    """Combined federal + Quebec marginal rate on an eligible Canadian dividend (actual amount).

    Gross-up then credits on the grossed-up amount; the Quebec abatement reduces federal tax.
    At the top 2026 brackets this gives 40.11 %, the published Quebec rate.
    """
    r = r or tax_calc.rules()
    d = r["eligible_dividends"]
    _, fed_after_abatement, qc = tax_calc.marginal_rate_quebec(income, r)
    keep = 1 - r["quebec_abatement"]
    fed_bracket = fed_after_abatement / keep
    gross = 1 + d["gross_up"]
    federal = keep * gross * (fed_bracket - d["federal_credit_rate"])
    quebec = gross * (qc - d["quebec_credit_rate"])
    return max(0.0, federal + quebec)


class _Taxable:
    """A non-registered holding: distributions taxed yearly, gains taxed when sold."""

    def __init__(self, p: tax_calc.Params, income: AssetIncome) -> None:
        self.p, self.income = p, income
        self.value = self.cost = self.deposited = self.tax_paid = 0.0

    def step(self, deposit: float, price_return: float) -> None:
        self.value += deposit
        self.cost += deposit
        self.deposited += deposit
        paid = self.value * self.income.dividend_yield
        tax = paid * self.income.distribution_rate
        self.value = self.value * (1 + price_return) + paid - tax
        self.cost += paid - tax
        self.tax_paid += tax

    def transfer_in(self, amount: float) -> None:
        """Proceeds moved in from a registered account: new cost base, no tax."""
        self.value += amount
        self.cost += amount
        self.deposited += amount

    def exit_tax(self) -> float:
        return max(0.0, self.value - self.cost) * self.p.inclusion_rate * self.p.rate_retirement

    def after_tax(self) -> float:
        return self.value - self.exit_tax()


def _finish(res: YearlyResult, sheltered_after_tax: float, sheltered_gross: float, side: _Taxable) -> YearlyResult:
    res.gross_value = sheltered_gross + side.value
    res.after_tax = sheltered_after_tax + side.after_tax()
    res.tax_at_exit = res.gross_value - res.after_tax
    res.side_deposits = side.deposited
    res.annual_tax_paid = side.tax_paid
    return res


def project_yearly(p: tax_calc.Params, price_returns: np.ndarray, income: AssetIncome = AssetIncome()
                   ) -> dict[str, YearlyResult]:
    """Deterministic projection for one path of annual price returns (length >= years)."""
    n = p.years
    g = price_returns[:n]
    y = income.dividend_yield
    lost_rate = income.withholding_rate if income.us_withholding else 0.0
    out: dict[str, YearlyResult] = {}

    # CELI
    res, side = YearlyResult("CELI", True), _Taxable(p, income)
    bal, room = 0.0, p.tfsa_room
    for yr in range(n):
        if yr > 0:
            room += p.tfsa_annual_limit
        net = p.annual_contribution * (1 - p.rate_now)
        put = min(net, room)
        room -= put
        res.deposits += put
        bal += put
        res.withholding_lost += bal * y * lost_rate
        bal *= 1 + g[yr] + y * (1 - lost_rate)
        side.step(net - put, g[yr])
        res.after_tax_by_year.append(bal + side.after_tax())
    out["CELI"] = _finish(res, bal, bal, side)

    # REER
    res, side = YearlyResult("REER", True), _Taxable(p, income)
    bal = 0.0
    for yr in range(n):
        put = min(p.annual_contribution, p.rrsp_room)
        res.deposits += put
        bal = (bal + put) * (1 + g[yr] + y)
        side.step((p.annual_contribution - put) * (1 - p.rate_now), g[yr])
        res.after_tax_by_year.append(bal * (1 - p.rate_retirement) + side.after_tax())
    out["REER"] = _finish(res, bal * (1 - p.rate_retirement), bal, side)

    # CELIAPP
    if p.first_home_buyer:
        res, side = YearlyResult("CELIAPP", True), _Taxable(p, income)
        bal = 0.0
        withdrawn_year = min(n, p.fhsa_max_years)
        for yr in range(n):
            put = 0.0
            if yr < withdrawn_year:
                put = min(p.annual_contribution, p.fhsa_annual, p.fhsa_lifetime - res.deposits)
            res.deposits += put
            bal += put
            res.withholding_lost += bal * y * lost_rate
            bal *= 1 + g[yr] + y * (1 - lost_rate)
            side.step((p.annual_contribution - put) * (1 - p.rate_now), g[yr])
            if yr + 1 == withdrawn_year and n > withdrawn_year:
                side.transfer_in(bal)  # qualifying withdrawal, proceeds kept in a taxable account
                bal = 0.0
            res.after_tax_by_year.append(bal + side.after_tax())
        if n > p.fhsa_max_years:
            res.notes.append(f"Retrait admissible supposé à l'an {p.fhsa_max_years} (fin de la période de "
                             "participation), produit ensuite placé en non enregistré.")
        out["CELIAPP"] = _finish(res, bal, bal, side)
    else:
        out["CELIAPP"] = YearlyResult("CELIAPP", False, notes=["Non admissible : pas premier acheteur."])

    # Non enregistré
    res, taxable = YearlyResult("Non enregistré", True), _Taxable(p, income)
    for yr in range(n):
        taxable.step(p.annual_contribution * (1 - p.rate_now), g[yr])
        res.after_tax_by_year.append(taxable.after_tax())
    res.deposits = taxable.deposited
    res.gross_value = taxable.value
    res.after_tax = taxable.after_tax()
    res.tax_at_exit = res.gross_value - res.after_tax
    res.annual_tax_paid = taxable.tax_paid
    out["Non enregistré"] = res
    return out
