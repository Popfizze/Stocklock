"""Rule-based explanations of each account for one profile and one asset (French UI text, no LLM).

Every sentence comes from a documented rule (tax_rules_ca_2026.json) or from the projection itself.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from app.services import tax_calc
from app.services.account_projection import YearlyResult

if TYPE_CHECKING:  # avoid a runtime import cycle with account_guide
    from app.services.account_guide import AssetProfile, TaxProfile

CLOSE_ENOUGH = 0.98  # within 2 % of the best value: « presque équivalent »

VERDICTS = {
    "best": "Le plus avantageux ici",
    "close": "Presque équivalent",
    "behind": "Moins avantageux",
    "ineligible": "Non admissible",
}


def _money(v: float) -> str:
    return f"{v:,.0f} $".replace(",", " ")


def _pct(v: float) -> str:
    return f"{v * 100:.1f} %".replace(".", ",")


def _volatile(asset: AssetProfile | None) -> bool:
    return bool(asset and (asset.asset_class == "crypto" or (asset.hist_volatility or 0) > 0.40))


def _tfsa(p: TaxProfile, a: AssetProfile | None, res: YearlyResult, params: tax_calc.Params,
          r: dict[str, Any]) -> tuple[list[str], list[str]]:
    limit = r["tfsa"]["annual_limits"][str(r["year"])]
    pros = ["Retraits libres d'impôt, en tout temps ; les droits reviennent l'année suivante.",
            f"Droits disponibles : {_money(p.tfsa_room)} pour {p.name} ({p.age} ans), puis {_money(limit)} par an."]
    if a is None or a.income_type in ("growth", "none"):
        pros.append("Toute la croissance reste à l'abri, même un gros gain.")
    cons = ["Pas de déduction : on y verse de l'argent déjà imposé."]
    if res.withholding_lost > 0:
        cons.append(f"Retenue américaine de 15 % non récupérable : environ {_money(res.withholding_lost)} perdus "
                    f"sur {params.years} ans.")
    if _volatile(a):
        cons.append("Une perte n'est pas déductible, et les droits de cotisation perdus ne reviennent pas.")
    return pros, cons


def _rrsp(p: TaxProfile, a: AssetProfile | None, res: YearlyResult, params: tax_calc.Params,
          r: dict[str, Any]) -> tuple[list[str], list[str]]:
    pros, cons = [], []
    if p.rate_now > p.rate_retirement:
        pros.append(f"Déduction à {_pct(p.rate_now)} aujourd'hui, retrait imposé vers {_pct(p.rate_retirement)} "
                    "à la retraite.")
    else:
        cons.append(f"Taux prévu à la retraite ({_pct(p.rate_retirement)}) égal ou supérieur au taux actuel "
                    f"({_pct(p.rate_now)}) : la déduction ne compense plus l'impôt au retrait.")
    if a is not None and a.us_withholding:
        pros.append("Dividendes américains exemptés de la retenue de 15 % (convention fiscale Canada–États-Unis).")
    pros.append(f"Droits annuels : {_money(p.rrsp_room)} (18 % du revenu, au plus "
                f"{_money(r['rrsp']['dollar_limit'])}).")
    if p.first_home_buyer:
        pros.append(f"RAP : jusqu'à {_money(r['home_buyers_plan']['withdrawal_limit'])} retirables pour une "
                    "première propriété, remboursés sur 15 ans.")
    cons.append("Chaque retrait est imposé comme un salaire, gains et dividendes compris.")
    if a is not None and a.income_type == "cad_dividend":
        cons.append("Le crédit d'impôt pour dividendes canadiens est perdu.")
    if a is None or a.income_type in ("growth", "none"):
        cons.append("Gains en capital imposés en entier au retrait, au lieu de 50 % hors REER.")
    if p.age + params.years > r["rrsp_maturity"]["max_age"]:
        cons.append("Conversion obligatoire en FERR ou en rente à 71 ans.")
    return pros, cons


def _fhsa(p: TaxProfile, a: AssetProfile | None, res: YearlyResult, params: tax_calc.Params,
          r: dict[str, Any]) -> tuple[list[str], list[str]]:
    f = r["fhsa"]
    pros = ["Déductible comme le REER, et retrait libre d'impôt pour une première propriété : le meilleur des deux.",
            f"{_money(f['annual_limit'])} par an, {_money(f['lifetime_limit'])} à vie, pendant {p.fhsa_years} ans "
            "au plus.",
            "Si l'achat n'a pas lieu, transfert au REER sans toucher aux droits REER."]
    cons = ["Réservé à l'achat d'une première propriété."]
    if params.annual_contribution > f["annual_limit"]:
        cons.append(f"Au-delà de {_money(f['annual_limit'])} par an, l'excédent va en non enregistré.")
    if res.withholding_lost > 0:
        cons.append(f"Retenue américaine de 15 % non récupérable : environ {_money(res.withholding_lost)} perdus.")
    return pros, cons


def _taxable(p: TaxProfile, a: AssetProfile | None, res: YearlyResult, params: tax_calc.Params,
             r: dict[str, Any]) -> tuple[list[str], list[str]]:
    pros = ["Aucun plafond, retraits libres.",
            "Gains en capital imposés à 50 % seulement, au moment de la vente.",
            "Pertes en capital déductibles des gains."]
    cons = ["Pas de déduction : on y verse de l'argent déjà imposé."]
    if a is not None and a.income_type == "cad_dividend":
        pros.append(f"Crédit d'impôt pour dividendes : dividendes canadiens imposés à {_pct(p.eligible_dividend_rate)} "
                    f"au lieu de {_pct(p.rate_now)}.")
    if a is not None and a.us_withholding:
        pros.append("Retenue américaine récupérée grâce au crédit pour impôt étranger.")
    if res.annual_tax_paid > 0:
        cons.append(f"Distributions imposées chaque année : environ {_money(res.annual_tax_paid)} d'impôt payé en "
                    "cours de route.")
    if a is not None and a.income_type == "interest":
        cons.append(f"Intérêts imposés en entier au taux marginal ({_pct(p.rate_now)}) : le compte le moins "
                    "efficace pour des obligations.")
    return pros, cons


RULES = {"CELI": _tfsa, "REER": _rrsp, "CELIAPP": _fhsa, "Non enregistré": _taxable}


def advise(profile: TaxProfile, asset: AssetProfile | None, results: dict[str, YearlyResult],
           ranking: list[tuple[str, float]], params: tax_calc.Params, r: dict[str, Any]) -> dict[str, Any]:
    best_name, best_value = ranking[0]
    rank = {name: i + 1 for i, (name, _) in enumerate(ranking)}
    items = []
    for name, res in results.items():
        if not res.eligible:
            items.append({"account": name, "rank": None, "verdict": "ineligible", "verdict_label": VERDICTS["ineligible"],
                          "summary": profile.fhsa_reason, "pros": [], "cons": [profile.fhsa_reason]})
            continue
        verdict = "best" if name == best_name else ("close" if res.after_tax >= CLOSE_ENOUGH * best_value else "behind")
        pros, cons = RULES[name](profile, asset, res, params, r)
        items.append({"account": name, "rank": rank[name], "verdict": verdict, "verdict_label": VERDICTS[verdict],
                      "summary": f"Environ {_money(res.after_tax)} après impôt dans {params.years} ans.",
                      "pros": pros, "cons": cons})
    items.sort(key=lambda it: it["rank"] or 99)
    subject = f"{asset.name} ({asset.ticker})" if asset else "cette épargne"
    if len(ranking) > 1:
        second_name, second_value = ranking[1]
        headline = (f"Pour {profile.name} et {subject}, le compte {best_name} laisse le plus après impôt dans "
                    f"{params.years} ans : {_money(best_value)}, soit {_money(best_value - second_value)} de plus que "
                    f"le compte {second_name}.")
    else:
        headline = f"Pour {profile.name} et {subject}, seul le compte {best_name} est admissible."
    return {"headline": headline, "accounts": items}
