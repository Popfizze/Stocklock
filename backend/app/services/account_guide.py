"""Accounts guide: which registered account for which asset, for one investor profile.

Feeds the « Comptes » tab and the account section of a stock. Deterministic (no LLM):
- the persona's tax profile (income, marginal rates, contribution room, CELIAPP eligibility);
- the asset's income profile (dividends, US withholding, historical return and volatility);
- a year-by-year projection per account (`account_projection`), in three return scenarios;
- profile checks and the sources, assumptions and limits behind every number.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.data import starter
from app.services import account_facts, tax_calc
from app.services.account_projection import AssetIncome, eligible_dividend_rate, project_yearly

ASSUMPTIONS_PATH = Path(__file__).resolve().parent.parent / "rules" / "projection_assumptions_2026.json"

RETIREMENT_INCOME_RATIO = 0.70  # same assumption as the Labo's step 3 (pipeline/tax.py)
DEFAULT_INCOME = 85_000.0       # the Labo's step 3 default, when a persona has no tax profile
DEFAULT_RETURN = 0.05           # generic saving, no asset chosen: the Labo's step 3 default
SCENARIOS = ("pessimiste", "central", "optimiste")


@lru_cache(maxsize=1)
def assumptions() -> dict[str, Any]:
    return json.loads(ASSUMPTIONS_PATH.read_text(encoding="utf-8"))


# --- investor -----------------------------------------------------------------------------------

@dataclass
class TaxProfile:
    persona_id: str
    name: str
    age: int
    horizon: str
    horizon_years: list[int]
    risk_tolerance: str
    income: float
    retirement_income: float
    first_home_buyer: bool
    rate_now: float
    rate_retirement: float
    rate_federal: float
    rate_quebec: float
    eligible_dividend_rate: float
    tfsa_room: float
    rrsp_room: float
    fhsa_eligible: bool
    fhsa_years: int
    fhsa_reason: str
    demo_assumptions: list[str] = field(default_factory=list)


def tax_profile(persona: dict[str, Any], income: float | None = None, retirement_income: float | None = None,
                first_home_buyer: bool | None = None) -> TaxProfile:
    r = tax_calc.rules()
    demo = persona.get("tax_profile", {})
    notes = []
    if income is None:
        income = float(demo.get("income", DEFAULT_INCOME))
        notes.append(f"Revenu de {persona['name']} : {_money(income)} (valeur de démonstration).")
    if first_home_buyer is None:
        first_home_buyer = bool(demo.get("first_home_buyer", False))
        notes.append(f"{persona['name']} {'est' if first_home_buyer else 'n’est pas'} premier acheteur "
                     "d'une propriété (valeur de démonstration).")
    if retirement_income is None:
        retirement_income = income * RETIREMENT_INCOME_RATIO
    age = int(persona["age"])
    rate_now, fed, qc = tax_calc.marginal_rate_quebec(income, r)
    rate_ret, _, _ = tax_calc.marginal_rate_quebec(retirement_income, r) if retirement_income > 0 else (0.0, 0, 0)
    fhsa = r["fhsa"]
    fhsa_years = max(0, min(fhsa["max_participation_years"], fhsa["max_age"] - age))
    if not first_home_buyer:
        reason = "Réservé aux premiers acheteurs d'une propriété."
    elif age < 18 or fhsa_years == 0:
        reason = f"Il faut avoir entre 18 et {fhsa['max_age']} ans."
    else:
        reason = (f"Admissible : jusqu'à {fhsa_years} ans de participation "
                  f"({'limite des 15 ans' if fhsa_years == fhsa['max_participation_years'] else 'limite de 71 ans'}).")
    return TaxProfile(
        persona_id=persona["id"], name=persona["name"], age=age, horizon=persona["horizon"],
        horizon_years=list(persona["constraints"]["horizon_years"]), risk_tolerance=persona["risk_tolerance"],
        income=income, retirement_income=retirement_income, first_home_buyer=first_home_buyer,
        rate_now=rate_now, rate_retirement=rate_ret, rate_federal=fed, rate_quebec=qc,
        eligible_dividend_rate=eligible_dividend_rate(income, r),
        tfsa_room=tax_calc.tfsa_cumulative_room(age, int(r["year"]), r),
        rrsp_room=tax_calc.rrsp_annual_room(income, r),
        fhsa_eligible=first_home_buyer and fhsa_years > 0, fhsa_years=fhsa_years, fhsa_reason=reason,
        demo_assumptions=notes)


# --- asset --------------------------------------------------------------------------------------

INCOME_LABELS = {
    "growth": "Croissance : gain en capital, pas de dividende",
    "cad_dividend": "Dividendes canadiens déterminés",
    "foreign_dividend": "Dividendes américains",
    "interest": "Intérêts (FNB d'obligations)",
    "none": "Aucune distribution : gain en capital seulement",
}


@dataclass
class AssetProfile:
    ticker: str
    name: str
    asset_class: str
    currency: str
    market: str
    sector: str
    income_type: str
    income_label: str
    dividend_yield: float
    us_withholding: bool
    hist_return: float | None
    hist_volatility: float | None
    hist_period: str
    expected_return: float
    expected_return_basis: str


def trailing_yield(ticker: str) -> float:
    """Dividends with an ex-date in the last 365 days of the kit, over the last close (same currency)."""
    hist = starter.history(ticker)
    if hist.empty:
        return 0.0
    last = hist.index.max()
    a = starter.corporate_actions()
    paid = a.loc[(a["ticker"] == ticker) & (a["action"] == "dividend") & (a["ex_date"] > last - pd.Timedelta(days=365))
                 & (a["ex_date"] <= last), "value"].sum()
    return float(paid) / float(hist["close"].iloc[-1])


def _history_stats(ticker: str) -> tuple[float | None, float | None, str]:
    monthly = starter.adj_close_cad(ticker).resample("ME").last().dropna()
    rets = monthly.pct_change().dropna()
    if len(rets) < 12:
        return None, None, ""
    cagr = float((monthly.iloc[-1] / monthly.iloc[0]) ** (12 / len(rets)) - 1)
    vol = float(rets.std() * math.sqrt(12))
    return cagr, vol, f"{monthly.index[0]:%Y-%m} à {monthly.index[-1]:%Y-%m}"


def expected_return(asset_class: str, currency: str, sector: str) -> tuple[float, str]:
    a = assumptions()["returns"]
    if asset_class in ("equity", "etf_equity"):
        if currency == "CAD":
            return a["canadian_equities"], "Actions canadiennes (normes de projection 2026)"
        return a["us_equities"], "Actions américaines (normes de projection 2026)"
    if asset_class == "etf_bond":
        if "short" in sector.lower():
            return a["short_term"], "Court terme (normes de projection 2026)"
        return a["fixed_income"], "Revenu fixe (normes de projection 2026)"
    if asset_class == "etf_commodity":
        return a["inflation"] + 0.01, "Hypothèse maison : inflation de 2,1 % + 1 point (aucune norme pour l'or)"
    return a["emerging_equities"], ("Hypothèse maison : le rendement le plus élevé des normes (actions de marchés "
                                    "émergents) ; aucune norme pour la crypto, incertitude extrême")


def asset_profile(ticker: str) -> AssetProfile | None:
    info = starter.asset_info(ticker)
    if info is None:
        return None
    cls, cur, sector = str(info["asset_class"]), str(info["currency"]), str(info["sector"])
    y = trailing_yield(ticker) if cls not in ("crypto", "etf_commodity") else 0.0
    if cls in ("crypto", "etf_commodity"):
        kind = "none"
    elif cls == "etf_bond":
        kind = "interest"
    elif y <= 0:
        kind = "growth"
    else:
        kind = "cad_dividend" if cur == "CAD" else "foreign_dividend"
    hist_ret, hist_vol, period = _history_stats(ticker)
    er, basis = expected_return(cls, cur, sector)
    return AssetProfile(
        ticker=ticker, name=str(info["name"]), asset_class=cls, currency=cur, market=str(info["market"]),
        sector=sector, income_type=kind, income_label=INCOME_LABELS[kind], dividend_yield=y,
        us_withholding=cur == "USD" and y > 0 and cls not in ("crypto", "etf_commodity"),
        hist_return=hist_ret, hist_volatility=hist_vol, hist_period=period, expected_return=er,
        expected_return_basis=basis)


def list_assets() -> list[dict[str, str]]:
    cols = ["ticker", "name", "asset_class", "currency", "sector"]
    return starter.universe()[cols].to_dict(orient="records")


def distribution_rate(asset: AssetProfile | None, profile: TaxProfile, wh: float) -> float:
    if asset is None or asset.dividend_yield <= 0:
        return 0.0
    if asset.income_type == "cad_dividend":
        return profile.eligible_dividend_rate
    # foreign dividends and interest: ordinary income; the US withholding is credited against it
    return max(profile.rate_now, wh) if asset.us_withholding else profile.rate_now


# --- projection ---------------------------------------------------------------------------------

def _money(v: float) -> str:
    return f"{v:,.0f} $".replace(",", " ")


def profile_flags(persona: dict[str, Any], profile: TaxProfile, asset: AssetProfile | None, years: int) -> list[str]:
    """Horizon and RRSP-maturity checks, then the asset's own mismatches with the profile."""
    hi = persona["constraints"]["horizon_years"][1]
    flags = []
    if years > hi:
        flags.append(f"Horizon simulé de {years} ans plus long que l'horizon de {profile.name} "
                     f"({profile.horizon}) ; la valeur à {hi} ans est sur le graphique année par année.")
    if profile.age + years > tax_calc.rules()["rrsp_maturity"]["max_age"]:
        flags.append(f"{profile.name} aura {profile.age + years} ans : le REER doit être converti en FERR ou en "
                     "rente au plus tard à 71 ans (retraits minimaux imposables, non modélisés).")
    return flags + asset_mismatches(persona, profile, asset)


def asset_mismatches(persona: dict[str, Any], profile: TaxProfile, asset: AssetProfile | None) -> list[str]:
    """Ways the asset itself breaks the profile's constraints (crypto, excluded sector, volatility)."""
    if asset is None:
        return []
    c = persona["constraints"]
    flags = []
    if asset.asset_class == "crypto" and not c["allow_crypto"]:
        flags.append(f"Le profil de {profile.name} exclut la crypto.")
    if asset.sector in c["excluded_sectors"] or asset.ticker in c["excluded_tickers"]:
        flags.append(f"Le secteur {asset.sector} est exclu par le profil de {profile.name}.")
    if asset.hist_volatility is not None and asset.hist_volatility > c["max_volatility"]:
        flags.append(f"Volatilité historique de {asset.hist_volatility:.0%} supérieure au maximum du profil "
                     f"({c['max_volatility']:.0%}).".replace("%", " %"))
    return flags


def build(persona: dict[str, Any], ticker: str | None = None, annual_contribution: float = 7000.0,
          years: int = 15, total_return: float | None = None, income: float | None = None,
          retirement_income: float | None = None, first_home_buyer: bool | None = None) -> dict[str, Any]:
    r = tax_calc.rules()
    profile = tax_profile(persona, income, retirement_income, first_home_buyer)
    asset = asset_profile(ticker) if ticker else None
    if ticker and asset is None:
        raise KeyError(ticker)
    wh = float(r["us_dividend_withholding"]["rate"])
    if total_return is None:
        total_return = asset.expected_return if asset else DEFAULT_RETURN
    y = asset.dividend_yield if asset else 0.0
    income_model = AssetIncome(dividend_yield=y, us_withholding=bool(asset and asset.us_withholding),
                               distribution_rate=distribution_rate(asset, profile, wh), withholding_rate=wh)
    params = tax_calc.Params(
        annual_contribution=annual_contribution, years=years, rate_now=profile.rate_now,
        rate_retirement=profile.rate_retirement, first_home_buyer=profile.fhsa_eligible,
        tfsa_room=profile.tfsa_room, tfsa_annual_limit=float(r["tfsa"]["annual_limits"][str(r["year"])]),
        rrsp_room=profile.rrsp_room, fhsa_annual=float(r["fhsa"]["annual_limit"]),
        fhsa_lifetime=float(r["fhsa"]["lifetime_limit"]), fhsa_max_years=max(1, profile.fhsa_years),
        inclusion_rate=float(r["capital_gains"]["inclusion_rate"]))
    spread = float(assumptions()["scenario_spread"])
    price = total_return - y
    runs = {name: project_yearly(params, np.full(years, price + d), income_model)
            for name, d in zip(SCENARIOS, (-spread, 0.0, spread))}
    central = runs["central"]
    accounts = []
    for name, res in central.items():
        row = {k: v for k, v in asdict(res).items() if k != "after_tax_by_year"}
        row["after_tax_low"] = runs["pessimiste"][name].after_tax if res.eligible else None
        row["after_tax_high"] = runs["optimiste"][name].after_tax if res.eligible else None
        accounts.append(row)
    ranking = sorted(((a["account"], a["after_tax"]) for a in accounts if a["eligible"]),
                     key=lambda kv: kv[1], reverse=True)
    series = [{"year": k + 1, **{name: (res.after_tax_by_year[k] if res.eligible else None)
                                 for name, res in central.items()}} for k in range(years)]
    comparison = account_facts.compare(profile, asset, central, ranking, params, r)
    if asset_mismatches(persona, profile, asset):
        comparison["headline"] += (f" Ce titre sort d'au moins une contrainte du profil de {profile.name} "
                                   "(voir le contrôle de profil).")
    return {
        "profile": asdict(profile),
        "asset": asdict(asset) if asset else None,
        "inputs": {"annual_contribution": annual_contribution, "years": years, "total_return": total_return,
                   "price_return": price, "dividend_yield": y, "distribution_rate": income_model.distribution_rate,
                   "scenario_spread": spread},
        "series": series,
        "accounts": accounts,
        "ranking": [{"account": a, "after_tax": v} for a, v in ranking],
        "comparison": comparison,
        "profile_flags": profile_flags(persona, profile, asset, years),
        "assumptions": _assumptions(profile, asset, total_return, spread),
        "limits": _limits(asset),
        "sources": _sources(r, asset),
    }


def _assumptions(profile: TaxProfile, asset: AssetProfile | None, total_return: float, spread: float) -> list[str]:
    out = list(profile.demo_assumptions)
    out += [
        f"Taux marginaux tirés des barèmes 2026 fédéral (abattement du Québec de 16,5 %) et du Québec ; revenu de "
        f"retraite de {_money(profile.retirement_income)}.",
        "Montant annuel exprimé avant impôt, versé en début d'année : CELI et non enregistré reçoivent ce montant "
        "moins l'impôt au taux actuel ; REER et CELIAPP le reçoivent entier grâce à la déduction.",
        "Les sommes au-delà des plafonds vont dans un compte non enregistré.",
        "Valeur après impôt = ce qui resterait si tout était retiré à la fin de l'année.",
        f"Rendement total annuel de {total_return:.1%} (scénarios à ± {spread:.0%}).".replace("%", " %"),
    ]
    if asset:
        out.append(f"Rendement retenu : {asset.expected_return_basis}. Dividendes : rendement des 12 derniers mois "
                   f"du jeu de départ ({asset.dividend_yield:.2%}), supposé constant.".replace("%", " %"))
    return out


def _limits(asset: AssetProfile | None) -> list[str]:
    out = ["Simulation éducative, pas un conseil financier personnalisé.",
           "Montants nominaux, sans inflation ni frais ; plafonds supposés constants après 2026.",
           "Résident du Québec seulement ; crédits personnels et cotisations sociales ignorés."]
    if asset and asset.us_withholding:
        out.append("Retenue américaine : titre détenu directement ; un FNB canadien qui détient des titres "
                   "américains subit la retenue même dans un REER.")
    return out


def _sources(r: dict[str, Any], asset: AssetProfile | None) -> list[dict[str, Any]]:
    out = list(r["sources"]) + list(assumptions()["sources"])
    if asset:
        out.append({"id": starter.STARTER_SOURCE_ID, "title": "AlphaForge starter kit (prix, dividendes, univers)"})
    return out
