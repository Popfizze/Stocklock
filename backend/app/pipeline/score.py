"""Step 1 pipeline: score of a security from filings, prices and news, then suggestions."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pandas as pd

from app.data import gdelt, starter, yf_live
from app.data.cache import ExternalUnavailable
from app.pipeline import common
from app.pipeline.core import Choice, Context, InputSpec, OptionSpec, StageSkipped, StageSpec, StepSpec
from app.schemas import ScoreInputs
from app.services import fundamentals as fmod
from app.services import profile, scoring


def _as_of(ctx: Context) -> date:
    return ctx.inputs.as_of or date.today()


# --- stages -----------------------------------------------------------------------------------------

def identification(ctx: Context) -> None:
    common.identification_stage(ctx, ctx.inputs.ticker)
    ctx.report.context["portfolio"] = ctx.inputs.portfolio or []
    ctx.report.context["as_of"] = _as_of(ctx).isoformat()


def fundamentals(ctx: Context) -> None:
    asset = ctx.state["asset"]
    if asset["asset_class"] != "equity":
        ctx.report.limit("Pas de relevés financiers pour un FNB ou un cryptoactif : score fondé sur les prix "
                         "et les médias seulement.")
        raise StageSkipped("Actif sans relevés financiers (FNB, crypto).")
    raw, warnings = fmod.fetch(ctx.inputs.ticker, asset.get("cik"), ctx.opt("source"))
    for w in warnings:
        ctx.warn(w, limit=False)
    if raw is None:
        ctx.warn("Relevés financiers indisponibles : sous-scores profitabilité, endettement et "
                 "croissance exclus.")
        return
    ctx.state["raw_fundamentals"] = raw
    ctx.source(f"{raw.source}_{ctx.inputs.ticker}", raw.title, raw.url)
    ctx.metric("source utilisée", raw.source)
    ctx.metric("faits ou lignes reçus", raw.rows)
    ctx.metric("devise des états", raw.currency or "n.d.")
    ctx.metric("cache", "oui" if raw.from_cache else "non")


def normalize(ctx: Context) -> None:
    raw = ctx.state.get("raw_fundamentals")
    if raw is None:
        raise StageSkipped("Aucun relevé à normaliser.")
    period, pit = ctx.opt("period"), ctx.opt("point_in_time") == "on"
    fund = fmod.normalize(raw, period, pit, _as_of(ctx))
    if fund is None:
        ctx.warn(f"Normalisation impossible ({period}, point-in-time {'on' if pit else 'off'}) : "
                 "aucune période exploitable.")
        return
    ctx.state["fundamentals"] = fund
    for note in fund.notes:
        ctx.warn(note)
    ctx.metric("période", period)
    ctx.metric("fin de période", fund.period_end)
    ctx.metric("publiée le", fund.available_on)
    ctx.metric("périodes ou faits exclus (publiés après la date d'analyse)", fund.excluded_by_pit)
    ctx.metric("devise d'origine", fund.currency_reported)
    ctx.metric("USD par unité", fund.usd_per_unit)
    ctx.preview(["indicateur", "valeur"], fmod.preview_rows(fund))
    if pit:
        ctx.report.assume("Point-in-time : seuls les relevés publiés à la date d'analyse sont utilisés "
                          "(EDGAR : date de dépôt « filed » ; yfinance : clôture + 90 jours annuel, "
                          "+45 jours trimestriel, délais du Règlement 51-102).")
    elif fund.excluded_by_pit:
        ctx.warn(f"Point-in-time désactivé : {fund.excluded_by_pit} période(s) publiée(s) après la date "
                 "d'analyse sont utilisées (biais d'anticipation).")
    if fund.currency_reported == "CAD":
        ctx.report.assume("Montants en CAD convertis en USD au taux USD/CAD de la fin de période "
                          "(dernier taux connu reporté).")
        ctx.source("boc_fx", "Banque du Canada, FXUSDCAD (fx_usdcad_daily.csv du kit)")
    src = f"{raw.source}_{ctx.inputs.ticker}"
    fin = ctx.state["asset"]["sector"] == "Financials"
    label = "TTM" if period == "ttm" else "dernier exercice"
    ctx.report.factor(f"Marge nette ({label})", fund.net_margin, "ratio", source_id=src)
    ctx.report.factor(f"Rendement des capitaux propres ({label})", fund.roe, "ratio", source_id=src)
    ctx.report.factor("Croissance du chiffre d'affaires", fund.revenue_growth, "ratio", source_id=src)
    if fin:
        ctx.report.factor("Capitaux propres / actifs", fund.equity_to_assets, "ratio", source_id=src)
        ctx.report.assume("Secteur financier : l'endettement est mesuré par capitaux propres / actifs.")
    else:
        ctx.report.factor(f"Dette / capitaux propres ({fund.debt_concept or 'n.d.'})",
                          fund.debt_to_equity, "x", source_id=src, digits=3)


def prices(ctx: Context) -> None:
    years = 3 if ctx.opt("window") == "3y" else 1
    as_of = pd.Timestamp(_as_of(ctx))
    start = as_of - pd.DateOffset(years=max(years, 1)) - pd.Timedelta(days=10)
    df = common.load_history(ctx, ctx.inputs.ticker, start, as_of)
    series = df["adj_close"]
    eff_as_of = series.index.max()
    pm = scoring.price_metrics(series, eff_as_of, years)
    ctx.state["price_metrics"] = pm
    ctx.state["price_years"] = years
    ctx.metric("date de calcul", eff_as_of)
    ctx.metric("volatilité annualisée", pm.volatility)
    ctx.metric("repli maximal", pm.max_drawdown)
    ctx.metric("momentum 12-1", pm.momentum)
    common.price_preview(ctx, df)
    if (as_of - eff_as_of).days > 5:
        ctx.warn(f"Derniers prix disponibles au {eff_as_of.date()} (date d'analyse {as_of.date()}).")
    src = ctx.record.sources[0]["id"] if ctx.record.sources else starter.STARTER_SOURCE_ID
    ctx.report.factor(f"Volatilité annualisée ({years} an{'s' if years > 1 else ''})", pm.volatility,
                      "ratio", source_id=src)
    ctx.report.factor(f"Repli maximal ({years} an{'s' if years > 1 else ''})", pm.max_drawdown, "ratio",
                      source_id=src)
    ctx.report.factor("Momentum 12-1 mois", pm.momentum, "ratio", source_id=src)
    flags = profile.asset_flags(ctx.persona, ctx.state["asset"], pm.volatility)
    ctx.report.profile_flags.extend(flags)


def _gdelt(ctx: Context, start: date, end: date) -> bool:
    asset = ctx.state["asset"]
    news = gdelt.news_summary(ctx.inputs.ticker, asset["name"], start, end)
    sid = ctx.source(f"gdelt_{ctx.inputs.ticker}", f"GDELT DOC 2.0, requête {news.query}", news.url,
                     end.isoformat())
    ctx.state["news_tone"] = news.avg_tone
    ctx.metric("source utilisée", "gdelt")
    ctx.metric("articles", news.article_count)
    ctx.metric("ton moyen", news.avg_tone if news.avg_tone is not None else "n.d.")
    ctx.metric("cache", "oui" if news.from_cache else "non")
    ctx.preview(["titre", "case de ton", "url"], [[a["title"], a["tone_bin"], a["url"]] for a in news.top_articles])
    for i, art in enumerate(news.top_articles[:2], 1):
        ctx.source(f"gdelt_{ctx.inputs.ticker}_art{i}", art["title"] or "Article GDELT", art["url"])
    ctx.report.factor(f"Articles de presse ({(end - start).days} jours)", float(news.article_count),
                      "articles", source_id=sid, digits=0)
    ctx.report.factor("Ton médiatique moyen", news.avg_tone, "échelle GDELT", source_id=sid, digits=2)
    ctx.report.limit("Ton GDELT calculé sur les articles qui citent le nom de l'entreprise : il mesure "
                     "la tonalité, pas la véracité ni l'effet sur le cours.")
    return True


def _yf_news(ctx: Context, start: date, end: date) -> None:
    items, hit = yf_live.recent_news(ctx.inputs.ticker)
    inside = [i for i in items if start.isoformat() <= i["date"] <= end.isoformat()]
    sid = ctx.source(f"yfinance_news_{ctx.inputs.ticker}", f"Yahoo Finance, actualités {ctx.inputs.ticker}",
                     f"https://finance.yahoo.com/quote/{ctx.inputs.ticker}/news", date.today().isoformat())
    ctx.metric("source utilisée", "yfinance_news")
    ctx.metric("articles reçus", len(items))
    ctx.metric("articles dans la fenêtre", len(inside))
    ctx.preview(["date", "titre", "éditeur", "url"], [[i["date"], i["title"], i["publisher"], i["url"]] for i in items])
    ctx.warn("yfinance_news : liste courte d'articles récents, sans ton ; sous-score médiatique exclu.")
    ctx.report.factor("Articles récents (Yahoo Finance)", float(len(inside)), "articles", source_id=sid, digits=0)


def events(ctx: Context) -> None:
    source = ctx.opt("source")
    if source == "none":
        ctx.report.limit("Événements médiatiques désactivés : sous-score ton exclu.")
        raise StageSkipped("Source d'événements : aucune.")
    end = _as_of(ctx)
    start = end - timedelta(days=30 if ctx.opt("window") == "30d" else 90)
    if source in {"gdelt", "gdelt_then_yfinance_news"}:
        try:
            _gdelt(ctx, start, end)
            return
        except ExternalUnavailable as exc:
            ctx.warn(f"GDELT indisponible ({exc.reason}) : aucun événement inventé.")
            if source == "gdelt":
                return
    try:
        _yf_news(ctx, start, end)
    except ExternalUnavailable as exc:
        ctx.warn(f"Actualités yfinance indisponibles ({exc.reason}).")


def _peer_fundamentals(ctx: Context) -> dict[str, list[float]]:
    """Fundamental metrics of every universe equity, fetched in parallel with the same options."""
    tickers = [t for t, c in zip(starter.universe()["ticker"], starter.universe()["asset_class"], strict=True)
               if c == "equity"]
    choice = ctx.opt("fundamentals.source")
    period, pit = ctx.opt("normalize.period"), ctx.opt("normalize.point_in_time") == "on"
    as_of = _as_of(ctx)

    def one(t: str) -> fmod.Fundamentals | None:
        try:
            cik = None
            if not t.endswith(".TO"):
                from app.data import edgar
                cik = edgar.cik_for(t)
            raw, _ = fmod.fetch(t, cik, choice)
            return fmod.normalize(raw, period, pit, as_of) if raw else None
        except Exception:
            return None

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(one, tickers))
    peers: dict[str, list[float]] = {m: [] for m in scoring.FUNDAMENTAL_METRICS}
    for f in results:
        if f is None:
            continue
        for m in scoring.FUNDAMENTAL_METRICS:
            v = getattr(f, m)
            if v is not None:
                peers[m].append(v)
    return peers


def scoring_stage(ctx: Context) -> None:
    fund = ctx.state.get("fundamentals")
    pm = ctx.state["price_metrics"]
    metrics = scoring.raw_metrics(fund, pm, ctx.state.get("news_tone"))
    norm = ctx.opt("normalization")
    peers = None
    if norm == "universe_rank":
        peers = scoring.universe_price_peers(pm.as_of, ctx.state["price_years"])
        if fund is not None:
            peers.update(_peer_fundamentals(ctx))
        ctx.metric("pairs prix", len(peers["volatility"]))
        ctx.metric("pairs relevés", len(peers.get("net_margin", [])))
        ctx.warn("Classement univers : le ton médiatique garde des seuils fixes (GDELT limité à une "
                 "requête toutes les 5 s).", limit=False)
        ctx.report.assume("Normalisation par rang centile parmi les 31 actifs du kit (prix) et ses 20 "
                          "actions (relevés).")
    else:
        ctx.report.assume("Normalisation par seuils fixes : chaque mesure est ramenée linéairement entre "
                          "0 et 100 (bornes documentées dans le module de score).")
    scores = scoring.metric_scores(metrics, peers)
    fin = ctx.state["asset"]["sector"] == "Financials"
    subs = scoring.subscores(scores, fin)
    weights = scoring.PRESETS[ctx.opt("weights")]
    total, effective = scoring.weighted_score(subs, weights)
    ctx.state["score"] = total
    rows = []
    for key, value in subs.items():
        rows.append([scoring.LABELS[key], value, weights[key], effective.get(key)])
        if value is not None:
            ctx.report.factor(scoring.LABELS[key], value, "/100",
                              effect=f"poids effectif {effective[key] * 100:.0f} %", digits=1)
    ctx.preview(["sous-score", "valeur /100", "poids nominal", "poids effectif"], rows)
    ctx.metric("score", total if total is not None else "n.d.")
    ctx.metric("sous-scores disponibles", sum(v is not None for v in subs.values()))
    ctx.metric("pondération", ctx.opt("weights"))
    ctx.report.factor("Score global", total, "/100", effect="moyenne pondérée des sous-scores", digits=1)
    w = weights
    ctx.report.assume(
        f"Pondération « {ctx.opt('weights')} » : profitabilité {w['profitability']:.0%}, endettement "
        f"{w['leverage']:.0%}, croissance {w['growth']:.0%}, volatilité {w['volatility']:.0%}, repli "
        f"{w['drawdown']:.0%}, momentum {w['momentum']:.0%}, ton {w['news_tone']:.0%} ; renormalisée si "
        "une donnée manque.".replace("%", " %"))
    flags = ctx.report.profile_flags
    ctx.report.factor("Adéquation au profil", "à surveiller" if flags else "compatible",
                      effect="; ".join(flags) if flags else None)


def suggestions(ctx: Context) -> None:
    years = 3 if ctx.opt("corr_window") == "3y" else 1
    held = [*(ctx.inputs.portfolio or []), ctx.inputs.ticker]
    as_of = min(pd.Timestamp(_as_of(ctx)), starter.last_price_date())
    picks, seen = scoring.suggest(ctx.persona, held, as_of, years)
    if not picks:
        ctx.warn("Aucune proposition : portefeuille hors univers ou aucun candidat compatible avec le profil.")
        return
    ctx.source("starter_universe", "AlphaForge starter kit, assets_universe.csv (31 actifs)")
    ctx.metric("candidats compatibles avec le profil", seen)
    ctx.metric("fenêtre de corrélation", f"{years} an(s)")
    ctx.preview(["ticker", "nom", "secteur", "corrélation", "volatilité", "score prix", "nouveau secteur", "rang"],
                [[p["ticker"], p["name"], p["sector"], p["corr"], p["volatility"], p["price_score"],
                  p["new_sector"], p["rank"]] for p in picks])
    for p in picks:
        ctx.report.factor(
            f"Proposition : {p['ticker']} ({p['name']})", p["rank"], "/100",
            effect=(f"corrélation hebdomadaire {p['corr']:.2f} avec le portefeuille, volatilité "
                    f"{p['volatility'] * 100:.0f} %, {'nouveau secteur' if p['new_sector'] else 'secteur déjà détenu'}"
                    ).replace(".", ","),
            source_id="starter_universe", digits=1)
    ctx.report.assume("Propositions : 50 % diversification (1 − corrélation des rendements hebdomadaires en "
                      f"CAD sur {years} an(s)), 30 % score de prix, 20 % bonus nouveau secteur ; filtrées par "
                      "le profil.")
    ctx.report.limit("Univers limité aux 31 actifs du kit de départ, choisis en 2026 (biais du survivant).")
    if ctx.persona["constraints"]["excluded_sectors"]:
        ctx.report.limit("Le filtre ESG exclut le secteur Énergie ; aucune base de controverses ESG n'est "
                         "intégrée.")


def _key(ctx: Context) -> dict:
    score = ctx.state.get("score")
    return {"label": "Score sur 100", "value": round(score, 1) if score is not None else None}


STEP = StepSpec(
    id="score",
    label="1. Score",
    inputs=(
        InputSpec("ticker", "Titre", "text", "AAPL", "Symbole Yahoo, par exemple AAPL ou RY.TO."),
        InputSpec("portfolio", "Portefeuille actuel", "tickers", ["XIU.TO", "XBB.TO"],
                  "Titres déjà détenus, utilisés pour les propositions de diversification."),
        InputSpec("as_of", "Date d'analyse", "date", "",
                  "Vide = aujourd'hui. Une date passée rend visible l'effet du point-in-time."),
    ),
    stages=(
        StageSpec("identification", "Identification",
                  "Ticker → nom, marché, devise (univers du kit, sinon yfinance) et CIK SEC.",
                  identification, degradable=False),
        StageSpec("fundamentals", "Relevés financiers",
                  "Récupère les états financiers bruts.", fundamentals,
                  (OptionSpec("source", "Source des relevés",
                              (Choice("edgar", "SEC EDGAR"), Choice("yfinance", "yfinance"),
                               Choice("edgar_then_yfinance", "EDGAR puis yfinance")),
                              "edgar_then_yfinance",
                              "EDGAR companyfacts pour les émetteurs américains, yfinance sinon."),)),
        StageSpec("normalize", "Normalisation",
                  "Période, point-in-time par date de dépôt et conversion CAD→USD au dernier taux connu.",
                  normalize,
                  (OptionSpec("period", "Période", (Choice("annual", "Dernier exercice"),
                                                   Choice("ttm", "12 derniers mois (TTM)")), "annual"),
                   OptionSpec("point_in_time", "Point-in-time (date de dépôt)",
                              (Choice("on", "Activé"), Choice("off", "Désactivé")), "on",
                              "N'utilise que les relevés publiés à la date d'analyse."))),
        StageSpec("prices", "Prix", "Volatilité, repli maximal et momentum à partir des prix ajustés.",
                  prices,
                  (common.PRICE_SOURCE, common.CNQ_FIX,
                   OptionSpec("window", "Fenêtre", (Choice("1y", "1 an"), Choice("3y", "3 ans")), "1y",
                              "Fenêtre de calcul de la volatilité et du repli.")),
                  degradable=False),
        StageSpec("events", "Événements", "Volume et ton des articles de presse.", events,
                  (OptionSpec("source", "Source des événements",
                              (Choice("gdelt", "GDELT"), Choice("yfinance_news", "Actualités yfinance"),
                               Choice("none", "Aucune"),
                               Choice("gdelt_then_yfinance_news", "GDELT puis yfinance")),
                              "gdelt_then_yfinance_news"),
                   OptionSpec("window", "Fenêtre", (Choice("90d", "90 jours"), Choice("30d", "30 jours")),
                              "90d"))),
        StageSpec("scoring", "Score", "Sous-scores 0-100 et moyenne pondérée.", scoring_stage,
                  (OptionSpec("weights", "Pondération",
                              (Choice("balanced", "Équilibrée"), Choice("quality", "Qualité"),
                               Choice("risk", "Risque")), "balanced"),
                   OptionSpec("normalization", "Normalisation",
                              (Choice("fixed_thresholds", "Seuils fixes"),
                               Choice("universe_rank", "Rang dans l'univers")), "fixed_thresholds",
                              "Seuils documentés ou rang centile parmi les actifs du kit.")),
                  degradable=False),
        StageSpec("suggestions", "Propositions",
                  "Titres de l'univers qui diversifient le portefeuille et respectent le profil.",
                  suggestions,
                  (OptionSpec("corr_window", "Fenêtre de corrélation",
                              (Choice("1y", "1 an"), Choice("3y", "3 ans")), "1y"),)),
        StageSpec("narration", "Narration", "Explication rédigée par un agent à partir des faits.",
                  common.narration_stage, (common.NARRATION_MODEL,)),
        StageSpec("governance", "Gouvernance",
                  "Sources, mention de simulation, cohérence au profil, chiffres sourcés.",
                  common.governance_stage),
    ),
    request_model=ScoreInputs,
    key_result=_key,
)
