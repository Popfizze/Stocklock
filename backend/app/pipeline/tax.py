"""Step 3 pipeline: TFSA / RRSP / FHSA / taxable account compared after tax at the horizon."""

from __future__ import annotations

import numpy as np

from app.data import starter
from app.pipeline import common
from app.pipeline.core import Choice, Context, InputSpec, OptionSpec, StageSpec, StepSpec
from app.schemas import TaxInputs
from app.services import tax_calc

RETIREMENT_INCOME_RATIO = 0.70
SCENARIO_SPREAD = 0.02
MC_PATHS = 1000
MC_SEED = 42


def _money(v: float) -> str:
    return f"{v:,.0f} $".replace(",", " ")


def rules_stage(ctx: Context) -> None:
    r = tax_calc.rules()
    for s in r["sources"]:
        ctx.source(s["id"], s["title"], s.get("url"), s.get("as_of"))
    year = int(r["year"])
    age = int(ctx.persona["age"])
    inp: TaxInputs = ctx.inputs
    tfsa_room = tax_calc.tfsa_cumulative_room(age, year, r)
    rrsp_room = tax_calc.rrsp_annual_room(inp.income, r)
    fhsa_ok = bool(inp.first_home_buyer) and age < r["fhsa"]["max_age"]
    ctx.state.update(tfsa_room=tfsa_room, rrsp_room=rrsp_room, fhsa_ok=fhsa_ok, rules=r)
    ctx.metric("année des règles", year)
    ctx.metric("droits CELI cumulés (âge)", tfsa_room)
    ctx.metric("droits REER annuels", rrsp_room)
    ctx.metric("CELIAPP admissible", "oui" if fhsa_ok else "non")
    ctx.preview(["règle", "valeur", "source"], [
        ["Plafond CELI annuel", r["tfsa"]["annual_limits"][str(year)], "cra_tfsa"],
        [f"Droits CELI cumulés à {age} ans", tfsa_room, "cra_tfsa"],
        ["Plafond REER (dollars)", r["rrsp"]["dollar_limit"], "cra_rrsp"],
        ["Taux REER sur revenu gagné", r["rrsp"]["rate_of_earned_income"], "cra_rrsp"],
        ["CELIAPP annuel", r["fhsa"]["annual_limit"], "cra_fhsa"],
        ["CELIAPP à vie", r["fhsa"]["lifetime_limit"], "cra_fhsa"],
        ["CELIAPP durée maximale (ans)", r["fhsa"]["max_participation_years"], "cra_fhsa"],
        ["Taux d'inclusion des gains en capital", r["capital_gains"]["inclusion_rate"], "cra_capital_gains"],
    ])
    ctx.report.factor("Plafond annuel CELI", float(r["tfsa"]["annual_limits"][str(year)]), "$", source_id="cra_limits", digits=0)
    ctx.report.factor("Plafond annuel REER (dollars)", float(r["rrsp"]["dollar_limit"]), "$", source_id="cra_limits", digits=0)
    ctx.report.factor("Plafond CELIAPP annuel / à vie", f"{_money(r['fhsa']['annual_limit'])} / {_money(r['fhsa']['lifetime_limit'])}",
                      source_id="cra_fhsa")
    ctx.report.factor("Taux d'inclusion des gains en capital", float(r["capital_gains"]["inclusion_rate"]), "ratio",
                      source_id="cra_capital_gains")
    ctx.report.factor("Droits de cotisation CELI disponibles la 1re année", tfsa_room, "$", source_id="cra_tfsa", digits=0)
    ctx.report.factor("Droits REER annuels retenus", rrsp_room, "$", source_id="cra_rrsp", digits=0)
    ctx.report.assume(f"Droits CELI cumulés depuis l'année des 18 ans de {ctx.persona['name']} ({age} ans en "
                      f"{year}), sans cotisation antérieure ; plafond annuel constant à "
                      f"{_money(r['tfsa']['annual_limits'][str(year)])} ensuite.")
    if inp.income is None:
        ctx.warn("Revenu non fourni : droits REER limités au plafond en dollars, la règle des 18 % n'est pas "
                 "vérifiée.")
    else:
        ctx.report.assume(f"Droits REER = min(18 % × {_money(inp.income)}, {_money(r['rrsp']['dollar_limit'])}) "
                          "chaque année, sans droits inutilisés reportés.")
    if not inp.first_home_buyer:
        ctx.report.limit("CELIAPP exclu : la personne n'est pas indiquée comme premier acheteur.")
    lo, hi = ctx.persona["constraints"]["horizon_years"]
    if inp.years > hi:
        ctx.report.profile_flags.append(
            f"Horizon simulé de {inp.years} ans supérieur à l'horizon du profil ({ctx.persona['horizon']}).")


def marginal_rates(ctx: Context) -> None:
    inp: TaxInputs = ctx.inputs
    now, ret = inp.marginal_rate_now, inp.marginal_rate_retirement
    mode = ctx.opt("mode")
    if mode == "brackets":
        if inp.income is None:
            ctx.warn("Mode barèmes demandé sans revenu : taux saisis conservés.")
        else:
            r = ctx.state["rules"]
            now, fed, qc = tax_calc.marginal_rate_quebec(inp.income, r)
            ret_income = inp.income * RETIREMENT_INCOME_RATIO
            ret, _, _ = tax_calc.marginal_rate_quebec(ret_income, r)
            ctx.metric("taux fédéral après abattement", fed)
            ctx.metric("taux Québec", qc)
            ctx.metric("revenu de retraite supposé", ret_income)
            ctx.report.assume(f"Taux marginaux tirés des barèmes 2026 fédéral (abattement du Québec de 16,5 %) et "
                              f"du Québec ; revenu de retraite supposé égal à {RETIREMENT_INCOME_RATIO:.0%} du "
                              "revenu actuel.".replace("%", " %"))
            ctx.report.limit("Taux marginaux de barème : crédits, cotisations sociales et réduction du montant "
                             "personnel de base ignorés.")
            for sid in ("cra_federal_brackets", "qc_brackets"):
                ctx.record.sources.append({"id": sid, "title": next(
                    s["title"] for s in r["sources"] if s["id"] == sid)})
    ctx.state.update(rate_now=now, rate_ret=ret)
    ctx.metric("mode", mode)
    ctx.metric("taux marginal actuel", now)
    ctx.metric("taux marginal à la retraite", ret)
    ctx.report.factor("Taux marginal actuel", now, "ratio")
    ctx.report.factor("Taux marginal à la retraite", ret, "ratio")


def _historical_monthly() -> tuple[np.ndarray, float]:
    spy = starter.adj_close_cad("SPY").resample("ME").last()
    agg = starter.adj_close_cad("AGG").resample("ME").last()
    monthly = (0.6 * spy.pct_change() + 0.4 * agg.pct_change()).dropna()
    cagr = float(np.prod(1 + monthly.values) ** (12 / len(monthly)) - 1)
    return np.log1p(monthly.values), cagr


def expected_return(ctx: Context) -> None:
    mode = ctx.opt("mode")
    base = ctx.inputs.expected_return
    if mode == "historical_60_40":
        _, cagr = _historical_monthly()
        scenarios = {"central": cagr}
        ctx.source(starter.STARTER_SOURCE_ID, "AlphaForge starter kit, prices_daily.csv (Yahoo Finance via yfinance)")
        ctx.report.assume("Rendement attendu = rendement annualisé historique d'un 60/40 SPY/AGG en CAD, "
                          "rééquilibré chaque mois, sur la période du kit (2021-11 à 2026-11).")
        ctx.warn("Rendement historique sur 5 ans seulement : ce n'est pas une prévision.")
    elif mode == "scenarios":
        scenarios = {"pessimiste": base - SCENARIO_SPREAD, "central": base, "optimiste": base + SCENARIO_SPREAD}
        ctx.report.assume("Scénarios : rendement saisi moins 2 points (pessimiste), saisi (central), plus 2 "
                          "points (optimiste).")
    else:
        scenarios = {"central": base}
    ctx.state["scenarios"] = scenarios
    ctx.metric("mode", mode)
    for name, r in scenarios.items():
        ctx.metric(f"rendement {name}", r)
    ctx.preview(["scénario", "rendement annuel"], [[k, v] for k, v in scenarios.items()])
    for name, r in scenarios.items():
        label = "Rendement annuel attendu" + ("" if name == "central" and len(scenarios) == 1 else f" ({name})")
        ctx.report.factor(label, r, "ratio")


def projection(ctx: Context) -> None:
    inp: TaxInputs = ctx.inputs
    r = ctx.state["rules"]
    params = tax_calc.Params(
        annual_contribution=inp.annual_contribution, years=inp.years,
        rate_now=ctx.state["rate_now"], rate_retirement=ctx.state["rate_ret"],
        first_home_buyer=ctx.state["fhsa_ok"], tfsa_room=ctx.state["tfsa_room"],
        tfsa_annual_limit=float(r["tfsa"]["annual_limits"][str(r["year"])]), rrsp_room=ctx.state["rrsp_room"],
        fhsa_annual=float(r["fhsa"]["annual_limit"]), fhsa_lifetime=float(r["fhsa"]["lifetime_limit"]),
        fhsa_max_years=int(r["fhsa"]["max_participation_years"]),
        inclusion_rate=float(r["capital_gains"]["inclusion_rate"]))
    method = ctx.opt("method")
    out: dict[str, dict] = {}
    rows = []
    if method == "monte_carlo":
        monthly, _ = _historical_monthly()
        for name, er in ctx.state["scenarios"].items():
            paths = tax_calc.bootstrap_paths(monthly, er, inp.years, MC_PATHS, MC_SEED)
            per_account: dict[str, list[float]] = {a: [] for a in tax_calc.ACCOUNTS}
            for path in paths:
                res = tax_calc.project(params, path)
                for a, v in res.items():
                    if v.eligible:
                        per_account[a].append(v.after_tax)
            det = tax_calc.project(params, np.full(inp.years, er))
            pct = {a: np.percentile(v, [10, 50, 90]) if v else None for a, v in per_account.items()}
            out[name] = {"results": det, "percentiles": pct}
            for a, p in pct.items():
                if p is not None:
                    rows.append([name, a, p[0], p[1], p[2]])
        ctx.preview(["scénario", "compte", "P10 après impôt", "médiane", "P90 après impôt"], rows)
        ctx.metric("trajectoires", MC_PATHS)
        ctx.metric("graine", MC_SEED)
        ctx.report.assume(f"Monte Carlo : {MC_PATHS} trajectoires, rendements mensuels historiques du 60/40 du kit "
                          f"rééchantillonnés et recentrés sur le rendement attendu (graine {MC_SEED}).")
    else:
        for name, er in ctx.state["scenarios"].items():
            res = tax_calc.project(params, np.full(inp.years, er))
            out[name] = {"results": res, "percentiles": None}
            for a, v in res.items():
                rows.append([name, a, v.eligible, v.deposits, v.side_deposits, v.gross_value, v.tax_at_exit,
                             v.after_tax if v.eligible else None])
        ctx.preview(["scénario", "compte", "admissible", "dépôts", "dépôts hors plafond", "valeur brute",
                     "impôt à la sortie", "valeur après impôt"], rows)
        ctx.report.assume("Projection déterministe : rendement constant chaque année, cotisations en début d'année.")
    ctx.state["projection"] = out
    ctx.metric("méthode", method)
    ctx.metric("horizon (ans)", inp.years)
    ctx.report.assume("Montant annuel exprimé avant impôt : CELI et non enregistré reçoivent ce montant moins "
                      "l'impôt au taux actuel ; REER et CELIAPP le reçoivent entier grâce à la déduction.")
    ctx.report.assume("Les sommes au-delà des plafonds sont placées dans un compte non enregistré.")
    ctx.report.assume("Non enregistré : gains réalisés à l'horizon, imposés à 50 % d'inclusion au taux de retraite ; "
                      "dividendes et intérêts annuels ignorés.")
    ctx.report.assume("REER : retrait intégral imposé au taux de retraite. CELIAPP : retrait admissible non imposé.")
    ctx.report.limit("Montants nominaux, sans inflation ; plafonds supposés constants après 2026.")


def compare(ctx: Context) -> None:
    proj = ctx.state["projection"]
    central = proj["central"]
    results = central["results"]
    pct = central["percentiles"]
    values = {a: (pct[a][1] if pct and pct.get(a) is not None else v.after_tax)
              for a, v in results.items() if v.eligible}
    ranked = sorted(values.items(), key=lambda kv: kv[1], reverse=True)
    ctx.state["ranking"] = ranked
    for a, v in results.items():
        if not v.eligible:
            ctx.report.factor(f"Valeur nette après impôt — {a}", "non admissible", effect="; ".join(v.notes))
            continue
        label = f"Valeur nette après impôt — {a}" + (" (médiane)" if pct else "")
        ctx.report.factor(label, values[a], "$", effect="; ".join(v.notes) or None, digits=0)
        if pct and pct.get(a) is not None:
            ctx.report.factor(f"Fourchette P10–P90 — {a}", f"{_money(pct[a][0])} à {_money(pct[a][2])}")
    best, second = ranked[0], ranked[1]
    gap = best[1] - second[1]
    ctx.state["best"] = (best[0], second[0], gap)
    ctx.report.factor("Meilleur compte après impôt", best[0], effect=f"devant {second[0]}")
    ctx.report.factor(f"Écart {best[0]} − {second[0]}", gap, "$", digits=0)
    for name, block in proj.items():
        if name == "central":
            continue
        rk = sorted(((a, v.after_tax) for a, v in block["results"].items() if v.eligible),
                    key=lambda kv: kv[1], reverse=True)
        ctx.report.factor(f"Meilleur compte (scénario {name})", rk[0][0], effect=f"{_money(rk[0][1])} après impôt")
    ctx.preview(["rang", "compte", "valeur nette après impôt"], [[i + 1, a, v] for i, (a, v) in enumerate(ranked)])
    ctx.metric("meilleur compte", best[0])
    ctx.metric("écart avec le suivant ($)", round(gap))
    ctx.report.context.update(rate_now=ctx.state["rate_now"], rate_retirement=ctx.state["rate_ret"],
                              years=ctx.inputs.years, annual_contribution=ctx.inputs.annual_contribution)


def _key(ctx: Context) -> dict:
    best = ctx.state.get("best")
    if not best:
        return {"label": "Meilleur compte", "value": None}
    return {"label": f"Meilleur compte : {best[0]} (écart en $ avec {best[1]})", "value": round(best[2])}


STEP = StepSpec(
    id="tax",
    label="3. Fiscalité",
    inputs=(
        InputSpec("annual_contribution", "Montant annuel avant impôt ($)", "number", 7000,
                  "Revenu brut mis de côté chaque année."),
        InputSpec("years", "Horizon (années)", "number", 15),
        InputSpec("expected_return", "Rendement annuel attendu", "number", 0.05, "0,05 = 5 % par an."),
        InputSpec("marginal_rate_now", "Taux marginal actuel", "number", 0.3612, "0,3612 = 36,12 %."),
        InputSpec("marginal_rate_retirement", "Taux marginal à la retraite", "number", 0.3012),
        InputSpec("first_home_buyer", "Premier achat d'une propriété", "boolean", False),
        InputSpec("income", "Revenu annuel ($)", "number", 85000,
                  "Sert à la règle REER des 18 % et au mode barèmes."),
    ),
    stages=(
        StageSpec("rules", "Règles fiscales", "Fichier de règles ARC 2026 sourcé et droits de cotisation.",
                  rules_stage, degradable=False),
        StageSpec("marginal_rates", "Taux marginaux", "Taux saisis ou calculés par les barèmes.", marginal_rates,
                  (OptionSpec("mode", "Mode", (Choice("input", "Taux saisis"),
                                              Choice("brackets", "Barèmes fédéral et Québec")), "input",
                              "Les barèmes utilisent l'entrée « Revenu annuel »."),)),
        StageSpec("expected_return", "Rendement attendu", "Rendement saisi, historique ou en scénarios.",
                  expected_return,
                  (OptionSpec("mode", "Mode",
                              (Choice("input", "Valeur saisie"), Choice("historical_60_40", "Historique 60/40 du kit"),
                               Choice("scenarios", "Scénarios pessimiste, central, optimiste")), "input"),),
                  degradable=False),
        StageSpec("projection", "Projection", "Valeur de chaque compte à l'horizon.", projection,
                  (OptionSpec("method", "Méthode",
                              (Choice("deterministic", "Déterministe"),
                               Choice("monte_carlo", "Monte Carlo (1 000 trajectoires)")), "deterministic"),),
                  degradable=False),
        StageSpec("compare", "Comparaison", "CELI, REER, CELIAPP et non enregistré après impôt.", compare,
                  degradable=False),
        StageSpec("narration", "Narration", "Explication rédigée par un agent à partir des faits.",
                  common.narration_stage, (common.NARRATION_MODEL,)),
        StageSpec("governance", "Gouvernance",
                  "Sources, mention de simulation, cohérence au profil, chiffres sourcés.",
                  common.governance_stage),
    ),
    request_model=TaxInputs,
    key_result=_key,
)

