"""Step 2 pipeline: explain a security's move over a window (market, macro, company and world events)."""

from __future__ import annotations

import math
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.data import edgar, gdelt, starter, yf_live
from app.data.cache import ExternalUnavailable
from app.pipeline import common
from app.pipeline.core import Choice, Context, InputSpec, OptionSpec, StageSkipped, StageSpec, StepSpec
from app.schemas import ExplainMoveInputs
from app.services import market, profile

MACRO_SERIES = (
    ("V39079", "Taux directeur Banque du Canada"),
    ("DFF", "Taux des fonds fédéraux (Fed)"),
    ("BD.CDN.2YR.DQ.YLD", "Obligation Canada 2 ans"),
    ("BD.CDN.10YR.DQ.YLD", "Obligation Canada 10 ans"),
    ("DGS2", "Bon du Trésor US 2 ans"),
    ("DGS10", "Bon du Trésor US 10 ans"),
    ("STATIC_TOTALCPICHANGE", "IPC Canada (a/a)"),
    ("CPIAUCSL", "IPC États-Unis (indice)"),
    ("UNRATE", "Chômage États-Unis"),
)
EVENT_LOOKBACK_DAYS = 3


def _win(ctx: Context) -> tuple[pd.Timestamp, pd.Timestamp]:
    return pd.Timestamp(ctx.inputs.start), pd.Timestamp(ctx.inputs.end)


def auto_benchmark(info: dict) -> str:
    ticker = info["ticker"]
    if ticker.endswith(".TO") or info.get("market") == "TSX":
        choice = "XIU.TO"
    elif info.get("asset_class") == "crypto" or info.get("sector") in {
            "Information Technology", "Communication Services", "Technology"}:
        choice = "QQQ"
    else:
        choice = "SPY"
    if choice == ticker:
        choice = "SPY" if ticker != "SPY" else "QQQ"
    return choice


# --- stages -----------------------------------------------------------------------------------------

def prices(ctx: Context) -> None:
    info = common.identification_stage(ctx, ctx.inputs.ticker)
    start, end = _win(ctx)
    df = common.load_history(ctx, ctx.inputs.ticker, start - pd.DateOffset(years=1) - pd.Timedelta(days=10), end)
    in_window = market.window(df["adj_close"], start, end)
    if len(in_window) < 2:
        raise common.PipelineInputError(f"moins de deux prix pour {ctx.inputs.ticker} dans la fenêtre")
    ctx.state["history"] = df
    ctx.state["asset"] = info
    ctx.metric("lignes dans la fenêtre", len(in_window))
    vol = market.annualized_volatility(in_window)
    ctx.metric("volatilité annualisée dans la fenêtre", vol)
    ctx.report.profile_flags.extend(profile.asset_flags(ctx.persona, info, vol))
    common.price_preview(ctx, market.window(df, start, end))


def benchmark(ctx: Context) -> None:
    info = ctx.state["asset"]
    choice = ctx.opt("benchmark")
    bench = auto_benchmark(info) if choice == "auto" else choice
    start, end = _win(ctx)
    bdf = common.load_history(ctx, bench, start - pd.DateOffset(years=1) - pd.Timedelta(days=10), end,
                              source=ctx.opt("prices.source"), cnq_fix=ctx.opt("prices.cnq_fix"),
                              record_metrics=False)
    asset_px, bench_px = ctx.state["history"]["adj_close"], bdf["adj_close"]
    rets = market.aligned(asset_px, bench_px).pct_change().dropna()
    rets.columns = ["asset", "bench"]
    est = rets.loc[rets.index < start]
    win = rets.loc[(rets.index >= start) & (rets.index <= end)]
    r_asset = market.total_return(market.window(asset_px, start, end))
    r_bench = market.total_return(market.window(bench_px, start, end))
    method = ctx.opt("method")
    alpha, beta, r2 = 0.0, 1.0, None
    if method == "market_model":
        if len(est) < 60:
            ctx.warn(f"Estimation du bêta sur {len(est)} séances seulement (moins de 60) : repli sur "
                     "la différence simple.")
            method = "simple_diff"
        else:
            beta = float(est["asset"].cov(est["bench"]) / est["bench"].var())
            alpha = float(est["asset"].mean() - beta * est["bench"].mean())
            r2 = float(est["asset"].corr(est["bench"]) ** 2)
    if method == "market_model":
        ar = win["asset"] - (alpha + beta * win["bench"])
        expected = float(np.prod(1 + alpha + beta * win["bench"]) - 1)
        abnormal = float((1 + r_asset) / (1 + expected) - 1)
        ar_est = est["asset"] - (alpha + beta * est["bench"])
    else:
        ar = win["asset"] - win["bench"]
        expected = r_bench
        abnormal = float(r_asset - r_bench)
        ar_est = est["asset"] - est["bench"]
    ctx.state.update(bench=bench, rets=win, ar=ar, ar_est=ar_est, abnormal=abnormal, method=method,
                     r2=r2, corr_window=float(win["asset"].corr(win["bench"])) if len(win) > 2 else None)
    ctx.metric("indice", bench)
    ctx.metric("méthode", method)
    ctx.metric("séances alignées dans la fenêtre", len(win))
    ctx.metric("séances d'estimation", len(est))
    ctx.metric("rendement du titre", r_asset)
    ctx.metric("rendement de l'indice", r_bench)
    ctx.metric("rendement attendu", expected)
    ctx.metric("rendement anormal", abnormal)
    if method == "market_model":
        ctx.metric("bêta", beta)
        ctx.metric("alpha quotidien", alpha)
        ctx.metric("R² d'estimation", r2)
    ctx.preview(["date", "rendement titre", "rendement indice", "rendement anormal"],
                [[d, r["asset"], r["bench"], ar.loc[d]] for d, r in win.tail(20).iterrows()])
    src = ctx.record.sources[0]["id"] if ctx.record.sources else starter.STARTER_SOURCE_ID
    ctx.report.factor(f"Rendement de {ctx.inputs.ticker} sur la fenêtre", r_asset, "ratio", source_id=src)
    ctx.report.factor(f"Rendement de l'indice {bench} sur la fenêtre", r_bench, "ratio", source_id=src)
    ctx.report.factor("Rendement attendu selon l'indice", expected, "ratio", source_id=src)
    ctx.report.factor("Rendement anormal de la fenêtre", abnormal, "ratio", source_id=src,
                      effect="positif = mieux que l'indice" if abnormal >= 0 else "négatif = moins bien que l'indice")
    if method == "market_model":
        ctx.report.factor("Bêta (année précédant la fenêtre)", beta, "ratio", source_id=src, digits=3)
        ctx.report.factor("R² du modèle de marché", r2, "ratio", source_id=src, digits=3)
        ctx.report.assume("Modèle de marché : alpha et bêta estimés sur les 12 mois précédant la fenêtre, "
                          "rendement anormal = (1 + rendement du titre) / (1 + rendement attendu) − 1.")
    else:
        ctx.report.assume("Différence simple : rendement anormal = rendement du titre − rendement de l'indice.")
    ctx.report.assume("Calendriers alignés sur les séances communes au titre et à l'indice (TSX, US et "
                      "crypto ne sont pas alignés).")
    ctx.report.context.update(benchmark=bench, window={"start": str(ctx.inputs.start), "end": str(ctx.inputs.end)})


def moves(ctx: Context) -> None:
    k = 3.0 if ctx.opt("threshold") == "3sigma" else 2.0
    ar, ar_est, win = ctx.state["ar"], ctx.state["ar_est"], ctx.state["rets"]
    base = ar_est if len(ar_est) >= 60 else ar
    sigma = float(base.std(ddof=1)) if len(base) > 2 else float("nan")
    if not sigma or math.isnan(sigma):
        ctx.state["moves"] = []
        ctx.warn("Écart-type des rendements anormaux non calculable.")
        return
    if base is ar:
        ctx.warn("Moins de 60 séances avant la fenêtre : σ estimé sur la fenêtre elle-même.", limit=False)
    flagged = ar.loc[ar.abs() > k * sigma]
    found = [{"date": d.date(), "asset": float(win.loc[d, "asset"]), "bench": float(win.loc[d, "bench"]),
              "ar": float(v), "z": float(v / sigma)} for d, v in flagged.items()]
    found.sort(key=lambda m: abs(m["ar"]), reverse=True)
    ctx.state["moves"] = found
    ctx.state["sigma"] = sigma
    ctx.metric("σ quotidien des rendements anormaux", sigma)
    ctx.metric("seuil", f"{k:.0f}σ")
    ctx.metric("mouvements significatifs", len(found))
    ctx.preview(["date", "rendement titre", "rendement indice", "rendement anormal", "z"],
                [[m["date"], m["asset"], m["bench"], m["ar"], m["z"]] for m in found])
    ctx.report.factor(f"Mouvements quotidiens anormaux au-delà de {k:.0f}σ", float(len(found)), "séances", digits=0)
    if found:
        top = found[0]
        ctx.report.factor(f"Plus grand mouvement anormal ({top['date']})", top["ar"], "ratio")


def _macro_value(series_id: str, when: pd.Timestamp, lag: int):
    point = starter.macro_asof(series_id, when, lag_months=lag)
    return None if point is None else (point.value, point.ref_date, point.stale)


def macro(ctx: Context) -> None:
    lag = 1 if ctx.opt("lag") == "1m" else 0
    start, end = _win(ctx)
    ctx.source("starter_macro", "AlphaForge starter kit, macro_rates.csv (Banque du Canada Valet, FRED)")
    rows, stale = [], []
    for sid, label in MACRO_SERIES:
        a, b = _macro_value(sid, start, lag), _macro_value(sid, end, lag)
        if a is None or b is None:
            rows.append([label, None, None, None, None, None])
            continue
        is_index = sid == "CPIAUCSL"
        change = (b[0] / a[0] - 1) * 100 if is_index else b[0] - a[0]
        rows.append([label, a[0], a[1], b[0], b[1], change])
        if a[2] or b[2]:
            stale.append(label)
        ctx.report.factor(f"Variation {label} sur la fenêtre", change, "%" if is_index else "points de %",
                          effect=f"{a[0]:.2f} → {b[0]:.2f}".replace(".", ","), source_id="starter_macro",
                          digits=2)
    ctx.preview(["série", "valeur début", "référence début", "valeur fin", "référence fin", "variation"], rows)
    ctx.metric("séries", len(MACRO_SERIES))
    ctx.metric("décalage des séries mensuelles", f"{lag} mois")
    ctx.metric("séries avec valeur périmée", len(stale))
    if lag:
        ctx.report.assume("Séries mensuelles décalées d'un mois (une valeur n'est utilisée qu'après son mois "
                          "de référence).")
    else:
        ctx.warn("Décalage macro à 0 mois : les valeurs mensuelles sont utilisées avant leur publication "
                 "(biais d'anticipation).")
    if stale:
        ctx.warn("Valeur macro manquante, dernière valeur connue reprise : " + ", ".join(stale)
                 + " (CPI et chômage US de 2025-10 absents du kit).")
    ctx.report.limit("Les variations macro décrivent le contexte de la fenêtre ; elles ne sont pas "
                     "attribuées statistiquement au titre.")


def company_events(ctx: Context) -> None:
    if ctx.opt("enabled") == "off":
        ctx.state["company_events"] = []
        raise StageSkipped("Événements d'entreprise désactivés.")
    start, end = ctx.inputs.start, ctx.inputs.end
    ticker, info = ctx.inputs.ticker, ctx.state["asset"]
    events: list[dict] = []
    fix = ctx.opt("prices.cnq_fix") == "on"
    acts = starter.corporate_actions(fix)
    acts = acts.loc[(acts["ticker"] == ticker) & (acts["ex_date"] >= pd.Timestamp(start))
                    & (acts["ex_date"] <= pd.Timestamp(end))]
    if not acts.empty:
        ctx.source("starter_actions", "AlphaForge starter kit, corporate_actions.csv (Yahoo Finance)")
    for _, a in acts.iterrows():
        events.append({"date": a["ex_date"].date(), "kind": a["action"],
                       "label": f"{a['action']} {a['value']:g} {a['unit']}", "source_id": "starter_actions",
                       "url": None})
    cik = info.get("cik")
    filings = []
    if cik:
        try:
            filings, hit = edgar.filings_between(cik, start, end)
            ctx.source(f"edgar_filings_{ticker}", f"SEC EDGAR, index des dépôts CIK {cik:010d}",
                       edgar.SUBMISSIONS_URL.format(cik=cik))
            ctx.metric("cache EDGAR", "oui" if hit else "non")
            for f in filings:
                label = f["form"] + (f" (items {f['items']})" if f.get("items") else "")
                events.append({"date": date.fromisoformat(f["filed"]), "kind": f["form"], "label": label,
                               "source_id": f"edgar_filings_{ticker}", "url": f["url"]})
        except ExternalUnavailable as exc:
            ctx.warn(f"Dépôts EDGAR indisponibles ({exc.reason}).")
    else:
        ctx.warn("Pas de dépôts EDGAR pour ce titre (pas de CIK US : titre .TO, FNB ou crypto ; "
                 "SEDAR+ non intégré).")
    events.sort(key=lambda e: e["date"])
    ctx.state["company_events"] = events
    ctx.metric("opérations sur titres", len(acts))
    ctx.metric("dépôts EDGAR (8-K, 10-Q, 10-K)", len(filings))
    ctx.preview(["date", "type", "détail", "url"], [[e["date"], e["kind"], e["label"], e["url"]] for e in events])
    ctx.report.factor("Événements d'entreprise datés dans la fenêtre", float(len(events)), "événements", digits=0)


def world_events(ctx: Context) -> None:
    source = ctx.opt("source")
    ctx.state["world_events"] = []
    if source == "none":
        raise StageSkipped("Événements du monde désactivés.")
    start, end = ctx.inputs.start, ctx.inputs.end
    ticker, info = ctx.inputs.ticker, ctx.state["asset"]
    if source == "gdelt":
        ctx.warn("Couverture GDELT : articles en anglais indexés par GDELT (historique DOC 2.0 depuis 2017 "
                 "environ), requête sur le nom de l'entreprise ; 1 requête / 5 s et réponses 429 fréquentes.",
                 limit=False)
        try:
            tl = gdelt.timeline(ticker, info["name"], start, end)
        except ExternalUnavailable as exc:
            ctx.warn(f"GDELT indisponible ({exc.reason}) : aucun événement du monde utilisé, rien n'est inventé.")
            return
        sid = ctx.source(f"gdelt_timeline_{ticker}", f"GDELT DOC 2.0, intensité de couverture, {tl.query}",
                         tl.url, end.isoformat())
        values = np.array([p["value"] for p in tl.points]) if tl.points else np.array([])
        if values.size < 5:
            ctx.warn("GDELT : série de couverture trop courte pour repérer des pics.")
            return
        threshold = float(values.mean() + 2 * values.std())
        peaks = sorted([p for p in tl.points if p["value"] > threshold], key=lambda p: -p["value"])[:10]
        evts = []
        for p in peaks:
            title = p["articles"][0]["title"] if p["articles"] else "pic de couverture"
            url = p["articles"][0]["url"] if p["articles"] else None
            evts.append({"date": date.fromisoformat(p["date"]), "kind": "pic GDELT", "label": title,
                         "source_id": sid, "url": url, "intensity": p["value"]})
        ctx.state["world_events"] = sorted(evts, key=lambda e: e["date"])
        ctx.metric("jours couverts", len(tl.points))
        ctx.metric("seuil de pic (intensité)", threshold)
        ctx.metric("pics retenus", len(evts))
        ctx.metric("cache", "oui" if tl.from_cache else "non")
        ctx.preview(["date", "intensité", "article principal", "url"],
                    [[e["date"], e["intensity"], e["label"], e["url"]] for e in evts])
        ctx.report.factor("Pics de couverture médiatique (GDELT)", float(len(evts)), "jours", source_id=sid, digits=0)
        return
    try:
        items, _ = yf_live.recent_news(ticker)
    except ExternalUnavailable as exc:
        ctx.warn(f"Actualités yfinance indisponibles ({exc.reason}).")
        return
    sid = ctx.source(f"yfinance_news_{ticker}", f"Yahoo Finance, actualités {ticker}",
                     f"https://finance.yahoo.com/quote/{ticker}/news", date.today().isoformat())
    inside = [i for i in items if start.isoformat() <= i["date"] <= end.isoformat()]
    ctx.metric("articles reçus", len(items))
    ctx.metric("articles dans la fenêtre", len(inside))
    ctx.preview(["date", "titre", "éditeur", "url"], [[i["date"], i["title"], i["publisher"], i["url"]] for i in items])
    ctx.warn("yfinance_news ne couvre que les derniers jours : une fenêtre ancienne n'a aucun article.")
    ctx.state["world_events"] = [{"date": date.fromisoformat(i["date"]), "kind": "article", "label": i["title"],
                                  "source_id": sid, "url": i["url"]} for i in inside]
    ctx.report.factor("Articles Yahoo Finance dans la fenêtre", float(len(inside)), "articles", source_id=sid, digits=0)


def attribution(ctx: Context) -> None:
    found = ctx.state.get("moves", [])
    events = [*ctx.state.get("company_events", []), *ctx.state.get("world_events", [])]
    matched_rows, matched = [], 0
    for m in found:
        near = [e for e in events if m["date"] - timedelta(days=EVENT_LOOKBACK_DAYS) <= e["date"] <= m["date"]]
        m["events"] = near
        if near:
            matched += 1
        matched_rows.append([m["date"], m["ar"], len(near), "; ".join(f"{e['kind']} {e['date']}" for e in near[:3])])
    n_days = len(ctx.state["rets"])
    r2 = ctx.state.get("r2")
    fit = r2 if r2 is not None else (ctx.state.get("corr_window") or 0.0) ** 2
    share = matched / len(found) if found else 0.0
    no_events = not events
    if n_days < 20:
        level, why = "je ne peux pas conclure", "moins de 20 séances dans la fenêtre"
    elif not found and fit < 0.1:
        level, why = "je ne peux pas conclure", "ni mouvement anormal marquant ni lien net avec l'indice"
    elif found and no_events and fit < 0.25:
        level, why = "je ne peux pas conclure", "mouvements anormaux sans aucun événement daté disponible"
    elif fit >= 0.5 or (found and share >= 0.6):
        level, why = "élevée", "l'indice explique une grande part des variations ou la plupart des mouvements ont un événement proche"
    elif fit >= 0.25 or (found and share >= 0.3):
        level, why = "moyenne", "lien partiel avec l'indice ou une partie des mouvements a un événement proche"
    else:
        level, why = "faible", "peu de lien avec l'indice et peu d'événements proches des mouvements"
    ctx.state["confidence"] = level
    ctx.metric("mouvements avec événement proche", matched)
    ctx.metric("mouvements", len(found))
    ctx.metric("ajustement au marché (R² ou corrélation²)", fit)
    ctx.metric("confiance", level)
    ctx.preview(["date du mouvement", "rendement anormal", "événements proches", "détail"], matched_rows)
    ctx.report.factor("Part des mouvements anormaux précédés d'un événement daté", share, "ratio")
    ctx.report.factor("Niveau de confiance de l'explication", level, effect=why)
    for m in found[:5]:
        if m["events"]:
            e = m["events"][0]
            ctx.report.factor(f"Mouvement du {m['date']}", m["ar"], "ratio",
                              effect=f"proche de : {e['kind']} du {e['date']} — {e['label'][:120]}",
                              source_id=e["source_id"])
        else:
            ctx.report.factor(f"Mouvement du {m['date']}", m["ar"], "ratio", effect="aucun événement daté proche")
    ctx.report.assume(f"Proximité temporelle : un événement est rattaché à un mouvement s'il a lieu le même jour "
                      f"ou dans les {EVENT_LOOKBACK_DAYS} jours précédents ; ce n'est pas une preuve de causalité.")


def _key(ctx: Context) -> dict:
    ab = ctx.state.get("abnormal")
    return {"label": "Rendement anormal de la fenêtre (%)", "value": round(ab * 100, 2) if ab is not None else None}


STEP = StepSpec(
    id="explain_move",
    label="2. Fluctuations",
    inputs=(
        InputSpec("ticker", "Titre", "text", "NVDA", "Symbole Yahoo, par exemple NVDA ou SHOP.TO."),
        InputSpec("start", "Début de la fenêtre", "date", "2022-01-01"),
        InputSpec("end", "Fin de la fenêtre", "date", "2022-12-31"),
    ),
    stages=(
        StageSpec("prices", "Prix", "Identification du titre et prix ajustés (fenêtre + 12 mois d'estimation).",
                  prices, (common.PRICE_SOURCE, common.CNQ_FIX), degradable=False),
        StageSpec("benchmark", "Indice de référence", "Rendement du titre comparé à son indice.", benchmark,
                  (OptionSpec("benchmark", "Indice",
                              (Choice("auto", "Automatique"), Choice("SPY", "SPY (S&P 500)"),
                               Choice("XIU.TO", "XIU.TO (S&P/TSX 60)"), Choice("QQQ", "QQQ (Nasdaq-100)")),
                              "auto", "Auto : XIU.TO pour la TSX, QQQ pour la tech et la crypto, SPY sinon."),
                   OptionSpec("method", "Méthode",
                              (Choice("simple_diff", "Différence simple"),
                               Choice("market_model", "Modèle de marché (bêta sur l'année précédente)")),
                              "simple_diff")),
                  degradable=False),
        StageSpec("moves", "Mouvements marquants", "Séances dont le rendement anormal dépasse le seuil.", moves,
                  (OptionSpec("threshold", "Seuil", (Choice("2sigma", "2 σ"), Choice("3sigma", "3 σ")), "2sigma"),)),
        StageSpec("macro", "Contexte macro", "Variations des taux, de l'inflation et du chômage sur la fenêtre.",
                  macro,
                  (OptionSpec("lag", "Décalage des séries mensuelles",
                              (Choice("0m", "0 mois"), Choice("1m", "1 mois")), "1m",
                              "Évite d'utiliser une donnée avant sa publication."),)),
        StageSpec("company_events", "Événements d'entreprise",
                  "Opérations sur titres et dépôts EDGAR 8-K, 10-Q, 10-K.", company_events,
                  (OptionSpec("enabled", "Activé", (Choice("on", "Oui"), Choice("off", "Non")), "on"),)),
        StageSpec("world_events", "Événements du monde", "Pics de couverture médiatique datés.", world_events,
                  (OptionSpec("source", "Source",
                              (Choice("gdelt", "GDELT"), Choice("yfinance_news", "Actualités yfinance"),
                               Choice("none", "Aucune")), "gdelt"),)),
        StageSpec("attribution", "Attribution",
                  "Rapproche chaque mouvement des événements proches dans le temps et fixe la confiance.",
                  attribution),
        StageSpec("narration", "Narration", "Explication rédigée par un agent à partir des faits.",
                  common.narration_stage, (common.NARRATION_MODEL,)),
        StageSpec("governance", "Gouvernance",
                  "Sources, mention de simulation, cohérence au profil, chiffres sourcés.",
                  common.governance_stage),
    ),
    request_model=ExplainMoveInputs,
    key_result=_key,
)
