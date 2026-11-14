"""Stage building blocks shared by several steps: identification, prices, narration, governance."""

from __future__ import annotations

import time
from datetime import date
from typing import Any

import pandas as pd

from app.data import edgar, starter, yf_live
from app.data.cache import ExternalUnavailable
from app.pipeline import datasets
from app.pipeline.core import Choice, Context, OptionSpec, PipelineInputError, StageSkipped
from app.services import governance as gov
from app.services import narration

# --- shared option declarations ------------------------------------------------------------------

PRICE_SOURCE = OptionSpec(
    "source", "Source des prix",
    (Choice("starter", "Kit de départ (CSV)"), Choice("yfinance_live", "yfinance en direct")),
    "starter", "Prix ajustés du kit AlphaForge ou téléchargés en direct depuis Yahoo Finance.")
CNQ_FIX = OptionSpec(
    "cnq_fix", "Correction CNQ.TO",
    (Choice("on", "Activée"), Choice("off", "Désactivée")), "on",
    "Annule le faux « split » 1,021 du 2022-08-22 (dividende spécial compté deux fois).")
NARRATION_MODEL = OptionSpec(
    "model", "Modèle de narration",
    (Choice("none", "Aucun (résumé déterministe)"), Choice("haiku", "Claude Haiku 4.5 (rapide)"),
     Choice("sonnet", "Claude Sonnet 5")),
    "haiku", "Agent Bedrock qui rédige l'explication à partir des seuls faits calculés.",
    lab_default="none")

ASSET_CLASS_FROM_QUOTE = {"EQUITY": "equity", "ETF": "etf_equity", "CRYPTOCURRENCY": "crypto",
                          "MUTUALFUND": "fund", "INDEX": "index"}


# --- identification -------------------------------------------------------------------------------

def resolve_asset(ticker: str, ctx: Context | None = None) -> tuple[dict[str, Any], str]:
    """Universe row, or yfinance identification for a ticker outside the starter universe."""
    info = starter.asset_info(ticker)
    if info is not None:
        info = dict(info)
        info["in_universe"] = True
        if ctx:
            ctx.decide("Où identifier le titre ?", "univers du kit (assets_universe.csv)",
                       f"{ticker} fait partie des 31 actifs du kit de départ.")
        return info, "starter_universe"
    try:
        live = yf_live.info(ticker)
    except ExternalUnavailable as exc:
        raise PipelineInputError(f"ticker {ticker!r} hors univers et non identifié ({exc.reason})") from exc
    quote = str(live.get("quote_type")).upper()
    asset_class = ASSET_CLASS_FROM_QUOTE.get(quote, "equity")
    if ctx:
        ctx.decide("Où identifier le titre ?", "fiche Yahoo Finance (yfinance)",
                   f"{ticker} est hors des 31 actifs du kit : identification en direct.")
        ctx.decide("Quelle classe d'actif ?", asset_class,
                   f"Type de cotation Yahoo « {quote} »" + ("" if quote in ASSET_CLASS_FROM_QUOTE
                                                            else " inconnu : traité comme une action") + ".",
                   "EQUITY → equity, ETF → etf_equity, CRYPTOCURRENCY → crypto, MUTUALFUND → fund, INDEX → index")
    return {
        "ticker": ticker, "name": live["name"], "market": live.get("market") or "n.d.",
        "currency": live.get("currency") or "USD", "sector": live.get("sector") or "n.d.",
        "asset_class": asset_class,
        "financial_currency": live.get("financial_currency"), "in_universe": False,
    }, "yfinance_info"


def identification_stage(ctx: Context, ticker: str) -> dict[str, Any]:
    info, origin = resolve_asset(ticker, ctx)
    ctx.state["asset"] = info
    ctx.metric("ticker", ticker)
    ctx.metric("nom", info["name"])
    ctx.metric("marché", info["market"])
    ctx.metric("devise", info["currency"])
    ctx.metric("classe d'actif", info["asset_class"])
    ctx.metric("secteur", info["sector"])
    if origin == "starter_universe":
        ctx.source("starter_universe", "AlphaForge starter kit, assets_universe.csv (31 actifs)")
    else:
        ctx.source(f"yfinance_info_{ticker}", f"Yahoo Finance, fiche {ticker}",
                   f"https://finance.yahoo.com/quote/{ticker}")
        ctx.warn(f"{ticker} est hors de l'univers du kit : identification et prix via yfinance.")
    cik = None
    question = "Chercher un identifiant SEC (CIK) ?"
    rule = "seules les actions hors TSX (sans suffixe .TO) déposent à la SEC"
    if info["asset_class"] == "equity" and not ticker.endswith(".TO"):
        try:
            cik = edgar.cik_for(ticker)
            ctx.decide(question, f"oui, CIK {cik:010d}" if cik else "oui, aucun CIK trouvé",
                       "Action non canadienne : recherche dans company_tickers.json de la SEC"
                       + ("." if cik else " ; pas d'émetteur SEC, donc pas de relevés ni de dépôts EDGAR."), rule)
        except ExternalUnavailable as exc:
            ctx.warn(f"Mapping ticker → CIK SEC indisponible ({exc.reason}).")
            ctx.decide(question, "oui, mais SEC injoignable", f"Mapping indisponible ({exc.reason}) : EDGAR "
                       "sera ignoré pour ce titre.", rule)
    else:
        why = "titre coté à la TSX (.TO), relevés via yfinance" if ticker.endswith(".TO") \
            else f"classe d'actif {info['asset_class']} : pas de relevés financiers SEC"
        ctx.decide(question, "non", why[0].upper() + why[1:] + ".", rule)
    info["cik"] = cik
    ctx.metric("CIK SEC", f"{cik:010d}" if cik else "aucun")
    if cik:
        ctx.source("sec_company_tickers", "SEC, company_tickers.json (ticker → CIK)", edgar.TICKERS_URL)
    datasets.asset(ctx, info, origin)
    ctx.report.context.update({k: info[k] for k in ("ticker", "name", "sector", "asset_class", "currency")})
    return info


# --- prices ---------------------------------------------------------------------------------------

def apply_cnq_fix_frame(df: pd.DataFrame, ticker: str) -> int:
    """In-place CNQ correction on a date-indexed frame; returns adjusted row count."""
    if ticker != starter.CNQ_TICKER:
        return 0
    mask = df.index < starter.CNQ_SPURIOUS_SPLIT_DATE
    for col in ("close", "adj_close"):
        if col in df.columns:
            df.loc[mask, col] = df.loc[mask, col] * starter.CNQ_SPURIOUS_FACTOR
    return int(mask.sum())


def load_history(ctx: Context, ticker: str, start: pd.Timestamp, end: pd.Timestamp,
                 source: str | None = None, cnq_fix: str | None = None,
                 record_metrics: bool = True) -> pd.DataFrame:
    """Price history for `ticker` over [start, end] honouring `<stage>.source` and `<stage>.cnq_fix`."""
    source = source or ctx.opt("source")
    fix_choice = cnq_fix or ctx.opt("cnq_fix")
    fix = fix_choice == "on"
    used = source
    question = f"Quelle source de prix pour {ticker} ?"
    rule = f"option source = {source}"
    if source == "starter" and not starter.in_starter(ticker):
        ctx.warn(f"{ticker} absent du kit de départ : prix téléchargés via yfinance en direct.")
        used = "yfinance_live"
        ctx.decide(question, "yfinance en direct (repli)", f"{ticker} est absent du kit de départ.", rule)
    else:
        ctx.decide(question, "kit de départ (prices_daily.csv)" if used == "starter" else "yfinance en direct",
                   "Choix de l'option de l'étape.", rule)
    if used == "starter":
        full = starter.history(ticker, cnq_fix=fix)
        df = full.loc[(full.index >= start) & (full.index <= end)].copy()
        ctx.decide("Quelles séances garder ?", f"{len(df)} séances sur {len(full)}",
                   f"Filtre sur la période {start.date()} → {end.date()} ; {len(full) - len(df)} séances du kit "
                   "hors période écartées.", inputs={"début": start, "fin": end})
        ctx.source(starter.STARTER_SOURCE_ID,
                   "AlphaForge starter kit, prices_daily.csv (Yahoo Finance via yfinance)",
                   as_of=starter.last_price_date().date().isoformat())
        adjusted = int((df.index < starter.CNQ_SPURIOUS_SPLIT_DATE).sum()) \
            if fix and ticker == starter.CNQ_TICKER else 0
    else:
        raw, hit = yf_live.daily_prices(ticker, start.date(), (end + pd.Timedelta(days=1)).date())
        df = raw.set_index("date").sort_index()
        adjusted = apply_cnq_fix_frame(df, ticker) if fix else 0
        ctx.source(f"yfinance_history_{ticker}", f"Yahoo Finance via yfinance, historique {ticker}",
                   f"https://finance.yahoo.com/quote/{ticker}/history", as_of=date.today().isoformat())
        ctx.metric("cache", "oui" if hit else "non")
        ctx.warn("Prix yfinance en direct : adj_close recalculé par Yahoo à chaque téléchargement.",
                 limit=False)
        ctx.decide("Quelles séances garder ?", f"{len(df)} séances téléchargées",
                   f"Téléchargement limité à la période {start.date()} → {end.date()}"
                   + (" (réponse en cache)." if hit else "."), inputs={"début": start, "fin": end})
    if ticker == starter.CNQ_TICKER:
        ctx.decide("Corriger le faux « split » de CNQ.TO ?", f"oui, {adjusted} séances corrigées" if fix else "non",
                   "Le facteur 1,021 du 2022-08-22 est un dividende spécial compté deux fois." if fix else
                   "Correction désactivée : l'adj_close antérieur au 2022-08-22 reste sous-évalué d'environ 2,1 %.",
                   f"option cnq_fix = {fix_choice}")
    if df.empty:
        raise PipelineInputError(f"aucun prix pour {ticker} entre {start.date()} et {end.date()}")
    datasets.price_history(ctx, ticker, df, used, fix, start, end)
    prefix = "" if record_metrics else f"{ticker} : "
    ctx.metric(f"{prefix}source utilisée", used)
    ctx.metric(f"{prefix}lignes", len(df))
    ctx.metric(f"{prefix}première date", df.index.min())
    ctx.metric(f"{prefix}dernière date", df.index.max())
    if ticker == starter.CNQ_TICKER or record_metrics:
        ctx.metric(f"{prefix}lignes corrigées CNQ", adjusted)
    if ticker == starter.CNQ_TICKER:
        if fix:
            ctx.report.assume(starter.CORRECTION_NOTES[0])
        else:
            ctx.warn("Correction CNQ désactivée : l'adj_close antérieur au 2022-08-22 est sous-évalué "
                     "d'environ 2,1 %.")
    return df


def price_preview(ctx: Context, df: pd.DataFrame) -> None:
    tail = df.tail(20)
    ctx.preview(["date", "close", "adj_close", "volume"],
                [[d, r.get("close"), r.get("adj_close"), r.get("volume")] for d, r in tail.iterrows()])


# --- narration & governance -----------------------------------------------------------------------

def fmt_number(value: float, unit: str | None) -> str:
    if unit == "ratio":
        return f"{value * 100:.1f} %".replace(".", ",")
    if unit == "$":
        return f"{value:,.0f} $".replace(",", " ")
    if abs(value) >= 1000:
        return f"{value:,.0f}".replace(",", " ") + (f" {unit}" if unit else "")
    return f"{value:.2f}".rstrip("0").rstrip(".").replace(".", ",") + (f" {unit}" if unit else "")


def deterministic_answer(ctx: Context) -> str:
    """Factual summary built only from the factors (narration disabled or unavailable)."""
    key = ctx.step.key_result(ctx)
    lines = []
    if isinstance(key.get("value"), (int, float)):
        lines.append(f"{key['label']} : {fmt_number(float(key['value']), None)}.")
    elif key.get("value") is not None:
        lines.append(f"{key['label']} : {key['value']}.")
    shown = 0
    for f in ctx.report.factors:
        if shown >= 8:
            break
        if isinstance(f.value, (int, float)):
            lines.append(f"{f.name} : {fmt_number(float(f.value), f.unit)}.")
        elif f.value is not None:
            lines.append(f"{f.name} : {f.value}.")
        else:
            continue
        shown += 1
    if ctx.report.profile_flags:
        lines.append(f"Écart avec le profil de {ctx.persona['name']} : " + " ".join(ctx.report.profile_flags))
    if ctx.report.limits:
        lines.append(f"Limites : {len(ctx.report.limits)} point(s) détaillé(s) dans « limits ».")
    lines.append(gov.DISCLAIMER)
    return "\n".join(lines)


def strip_headings(text: str) -> str:
    """Markdown titles are not wanted in answers (the prompt says so; models sometimes ignore it)."""
    lines = [line.lstrip("#").lstrip() if line.lstrip().startswith("#") else line for line in text.splitlines()]
    return "\n".join(lines).strip()


def narration_stage(ctx: Context) -> None:
    choice = ctx.opt("model")
    ctx.state["narration_model"] = choice
    question, rule = "Qui rédige la réponse ?", f"option model = {choice}"
    facts = {"facteurs": len(ctx.report.factors), "hypothèses": len(ctx.report.assumptions),
             "limites": len(ctx.report.limits)}
    if choice == "none":
        ctx.state["answer"] = deterministic_answer(ctx)
        ctx.metric("mode", "résumé déterministe")
        ctx.metric("caractères", len(ctx.state["answer"]))
        ctx.decide(question, "résumé déterministe", "Aucun modèle demandé : les 8 premiers facteurs chiffrés, "
                   "les écarts au profil et la mention de simulation sont repris tels quels.", rule, facts)
        return
    model_id = narration.model_id_for(choice)
    ctx.metric("modèle", model_id)
    t0 = time.perf_counter()
    try:
        answer = narration.narrate(ctx.step.id, ctx.persona, ctx.report.facts(), choice)
    except Exception as exc:  # Bedrock / AgentCore failure: deterministic fallback
        ctx.state["answer"] = deterministic_answer(ctx)
        ctx.state["narration_model"] = "none"
        ctx.warn(f"Narration indisponible ({type(exc).__name__}) : résumé déterministe utilisé.")
        ctx.decide(question, "résumé déterministe (repli)", f"Appel à {model_id} en échec "
                   f"({type(exc).__name__}) : rien n'est inventé, les faits calculés sont repris.", rule, facts)
        return
    ctx.decide(question, model_id, "Agent Bedrock qui rédige à partir des seuls faits calculés (la gouvernance "
               "vérifie ensuite chaque chiffre).", rule, facts)
    answer = strip_headings(answer)
    ctx.metric("latence agent (ms)", round((time.perf_counter() - t0) * 1000))
    ctx.metric("caractères", len(answer))
    ctx.source("bedrock_narrator", f"Amazon Bedrock, {model_id} (narration des faits calculés)")
    ctx.state["answer"] = answer


def governance_stage(ctx: Context) -> None:
    answer = ctx.state.get("answer")
    if not answer:
        raise StageSkipped("Aucune réponse à contrôler.")
    inputs = ctx.inputs.model_dump(mode="json")
    answer, verdict, bad = gov.check(answer, ctx.report, ctx.persona, inputs)
    retried = 0
    question = "Relancer la narration ?"
    rule = "relance unique si un chiffre de la réponse est absent des faits et qu'un modèle a rédigé"
    if bad and ctx.state.get("narration_model", "none") != "none":
        retried = 1
        feedback = ("Ces chiffres ne figurent pas dans les faits et doivent être retirés ou remplacés "
                    f"par des valeurs des faits : {', '.join(bad)}.")
        ctx.decide(question, "oui", f"Chiffres non sourcés dans la réponse : {', '.join(bad)}.", rule)
        try:
            new = strip_headings(narration.narrate(ctx.step.id, ctx.persona, ctx.report.facts(),
                                                   ctx.state["narration_model"], feedback=feedback))
            answer, verdict, bad = gov.check(new, ctx.report, ctx.persona, inputs)
        except Exception as exc:
            ctx.warn(f"Relance de la narration impossible ({type(exc).__name__}).", limit=False)
            ctx.decide("Résultat de la relance ?", "échec, première réponse conservée", type(exc).__name__)
    elif bad:
        ctx.decide(question, "non", f"Chiffres non sourcés ({', '.join(bad)}) mais résumé déterministe : "
                   "aucun modèle à relancer.", rule)
    else:
        ctx.decide(question, "non", "Tous les chiffres de la réponse figurent dans les faits.", rule)
    failed = [c.name for c in verdict.checks if not c.passed]
    ctx.decide("Verdict de gouvernance ?", "réussie" if verdict.passed else "échouée",
               "Tous les contrôles passent." if verdict.passed else f"Contrôles échoués : {', '.join(failed)}.",
               "réussie seulement si chaque contrôle passe")
    ctx.state["answer"] = answer
    ctx.state["governance"] = verdict
    ctx.metric("contrôles réussis", sum(c.passed for c in verdict.checks))
    ctx.metric("contrôles", len(verdict.checks))
    ctx.metric("relance narration", retried)
    ctx.preview(["contrôle", "réussi", "note"], [[c.name, c.passed, c.note] for c in verdict.checks])
    ctx.dataset("governance_checks", "Contrôles de gouvernance", ["contrôle", "réussi", "note"],
                ([c.name, c.passed, c.note] for c in verdict.checks))
    if not verdict.passed:
        ctx.warn("Gouvernance : au moins un contrôle a échoué (voir governance.checks).", limit=False)
