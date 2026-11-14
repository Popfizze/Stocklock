"""Step 4 pipeline: emotion and hype detection, profile check, 2022 panic-sale simulation."""

from __future__ import annotations

import re
from datetime import timedelta

import pandas as pd

from app.data import gdelt, starter
from app.data.cache import ExternalUnavailable
from app.pipeline import common, datasets
from app.pipeline.core import Choice, Context, InputSpec, OptionSpec, StageSkipped, StageSpec, StepSpec
from app.schemas import BiasInputs
from app.services import lexicon, market, narration, profile, simulation

INITIAL_CAD = 10_000.0
CASH_PROXY = "ZST.TO"
NAME_ALIASES = {"nvidia": "NVDA", "tesla": "TSLA", "apple": "AAPL", "microsoft": "MSFT", "amazon": "AMZN",
                "google": "GOOGL", "alphabet": "GOOGL", "bitcoin": "BTC-USD", "ether": "ETH-USD",
                "ethereum": "ETH-USD", "shopify": "SHOP.TO", "enbridge": "ENB.TO", "exxon": "XOM"}


def detect_ticker(message: str) -> str | None:
    uni = starter.universe()
    for t in uni["ticker"]:
        base = t.replace(".TO", "").replace("-USD", "")
        if len(base) >= 3 and re.search(rf"(?<![A-Za-z]){re.escape(base)}(?![A-Za-z])", message):
            return t
    low = message.lower()
    for alias, t in NAME_ALIASES.items():
        if re.search(rf"\b{alias}\b", low):
            return t
    return None


def message_analysis(ctx: Context) -> None:
    msg = ctx.inputs.message
    ticker = ctx.inputs.ticker or detect_ticker(msg)
    ctx.state["ticker"] = ticker
    ctx.metric("ticker", ticker or "aucun")
    ctx.metric("ticker détecté dans le message", "non" if ctx.inputs.ticker else ("oui" if ticker else "non"))
    ctx.decide("De quel titre parle le message ?", ticker or "aucun",
               "Titre fourni en entrée." if ctx.inputs.ticker else
               ("Symbole ou nom reconnu dans le message." if ticker else
                "Aucun symbole du kit ni nom connu dans le message : signal de battage et simulation sur le titre "
                "impossibles."),
               "entrée « ticker », sinon premier symbole du kit (3 lettres et plus) puis nom connu (Nvidia, Tesla…)")
    if ticker:
        info, origin = common.resolve_asset(ticker, ctx)
        ctx.state["asset"] = info
        ctx.report.context.update(ticker=ticker, name=info["name"])
        # listed on the stage only: the business response's sources stay as they were
        ctx.record.sources.append(
            {"id": "starter_universe", "title": "AlphaForge starter kit, assets_universe.csv (31 actifs)"}
            if origin == "starter_universe" else
            {"id": f"yfinance_info_{ticker}", "title": f"Yahoo Finance, fiche {ticker}",
             "url": f"https://finance.yahoo.com/quote/{ticker}"})
        datasets.asset(ctx, info, origin)
    method = ctx.opt("method")
    ctx.decide("Comment détecter les biais ?", {"lexicon": "lexique", "haiku": "Claude Haiku"}.get(method, "lexique et "
               "Claude Haiku"), "Les extraits proposés par Haiku ne sont gardés que s'ils figurent mot pour mot dans le "
               "message et dans une catégorie connue.", f"option method = {method}")
    found: dict[str, dict] = {}
    if method in {"lexicon", "both"}:
        for s in lexicon.detect(msg):
            found[s["category"]] = s
        ctx.metric("signaux lexique", sum(1 for s in found.values() if s["method"] == "lexique"))
    emotion = None
    if method in {"haiku", "both"}:
        try:
            cls = narration.classify(msg, ctx.persona, "haiku")
            emotion = cls.get("dominant_emotion")
            kept = rejected = 0
            for s in cls.get("signals", []):
                cat = s.get("category")
                if cat not in lexicon.CATEGORY_LABELS or not lexicon.excerpt_is_verbatim(s.get("excerpt", ""), msg):
                    rejected += 1
                    ctx.decide(f"Garder l'extrait Haiku « {s.get('excerpt', '')} » ?", "non",
                               "Catégorie inconnue." if cat not in lexicon.CATEGORY_LABELS else
                               "Absent du message mot pour mot : extrait inventé rejeté.",
                               "extrait verbatim et catégorie connue", {"catégorie": cat})
                    continue
                kept += 1
                prev = found.get(cat)
                entry = {"category": cat, "excerpt": s["excerpt"].strip(), "intensity": float(s.get("intensity", 0.5)),
                         "method": "haiku" if prev is None else "lexique + haiku"}
                found[cat] = entry
            ctx.metric("signaux Haiku retenus", kept)
            ctx.metric("extraits Haiku rejetés (non verbatim ou catégorie inconnue)", rejected)
            ctx.source("bedrock_classifier", f"Amazon Bedrock, {narration.model_id_for('haiku')} (classification)")
            if rejected:
                ctx.warn(f"{rejected} extrait(s) proposé(s) par Haiku absent(s) du message : rejeté(s).", limit=False)
        except Exception as exc:
            ctx.warn(f"Classifieur Haiku indisponible ({type(exc).__name__}) : lexique seul.")
            ctx.decide("Que faire sans le classifieur Haiku ?", "lexique seul",
                       f"Classifieur indisponible ({type(exc).__name__})"
                       + (" : le lexique le remplace." if method == "haiku" else " : les signaux du lexique restent."))
            if method == "haiku":
                for s in lexicon.detect(msg):
                    found[s["category"]] = s
    signals = sorted(found.values(), key=lambda s: -s["intensity"])
    ctx.decide("Quels biais retenir ?", ", ".join(lexicon.CATEGORY_LABELS[s["category"]] for s in signals) or "aucun",
               f"{len(signals)} catégorie(s) détectée(s), un extrait par catégorie (Haiku remplace le lexique quand "
               "les deux trouvent la même).", "triés par intensité décroissante")
    ctx.state["signals"] = signals
    ctx.metric("biais détectés", len(signals))
    ctx.metric("émotion dominante", emotion or "n.d.")
    ctx.preview(["catégorie", "extrait du message", "intensité", "méthode"],
                [[lexicon.CATEGORY_LABELS[s["category"]], s["excerpt"], s["intensity"], s["method"]] for s in signals])
    ctx.dataset_records("signals", "Signaux détectés dans le message",
                        ({"libellé": lexicon.CATEGORY_LABELS[s["category"]], **s} for s in signals),
                        columns=("libellé", "category", "excerpt", "intensity", "method"))
    for s in signals:
        ctx.report.factor(f"Biais : {lexicon.CATEGORY_LABELS[s['category']]}", f"« {s['excerpt']} »",
                          effect=f"intensité {s['intensity']:.1f} ({s['method']})".replace(".", ","))
    ctx.report.factor("Nombre de biais détectés", float(len(signals)), "biais", digits=0)
    if emotion:
        ctx.report.factor("Émotion dominante", emotion)
    ctx.report.context["message"] = msg


def hype_signal(ctx: Context) -> None:
    if ctx.opt("enabled") == "off":
        raise StageSkipped("Signal de battage désactivé.")
    ticker = ctx.state.get("ticker")
    if not ticker:
        raise StageSkipped("Aucun titre identifié dans le message.")
    if not starter.in_starter(ticker):
        raise StageSkipped(f"{ticker} hors du kit : pas d'historique de volume.")
    hist = starter.history(ticker)
    px, vol = hist["adj_close"], hist["volume"]
    if len(px.dropna()) <= 20:
        ctx.warn("Historique insuffisant pour comparer les 20 dernières séances.")
        ctx.decide("Calculer le signal de battage ?", "non", f"Seulement {len(px.dropna())} prix : il en faut plus "
                   "de 20.", "plus de 20 séances d'historique")
        return
    ret20 = px.pct_change(20).dropna()
    if ret20.empty:
        ctx.warn("Historique insuffisant pour calculer la variation récente.")
        ctx.decide("Calculer le signal de battage ?", "non", "Aucune variation sur 20 séances calculable.")
        return
    last20 = float(ret20.iloc[-1])
    z = float((last20 - ret20.mean()) / ret20.std()) if ret20.std() > 0 else 0.0
    v_recent = float(vol.iloc[-20:].mean())
    v_base = float(vol.iloc[-140:-20].mean()) if len(vol) > 140 else float(vol.mean())
    v_ratio = v_recent / v_base if v_base > 0 else float("nan")
    year = px.dropna().tail(252)
    ctx.state["market_history"] = {
        "start": px.index[-21].date().isoformat(), "end": px.index[-1].date().isoformat(),
        "return_20d": last20, "volume_ratio": v_ratio if pd.notna(v_ratio) else None,
        "year_start": year.index[0].date().isoformat(),
        "year_end": year.index[-1].date().isoformat(),
        "year_high": float(year.max()), "latest": float(year.iloc[-1]),
        "from_year_high": float(year.iloc[-1] / year.max() - 1) if year.max() > 0 else None,
        "currency": ctx.state["asset"].get("currency"),
    }
    if ctx.state["market_history"]["from_year_high"] is not None:
        ctx.report.factor("Écart au plus haut des 252 dernières séances",
                          ctx.state["market_history"]["from_year_high"], "ratio",
                          source_id=starter.STARTER_SOURCE_ID)
    ctx.report.assume("Les variations et volumes historiques contextualisent le message ; ils ne prouvent pas "
                      "qu'une décision est impulsive ni ne permettent de prédire les cours.")
    ctx.source(starter.STARTER_SOURCE_ID, "AlphaForge starter kit, prices_daily.csv (Yahoo Finance via yfinance)",
               as_of=px.index.max().date().isoformat())
    datasets.price_history(ctx, ticker, hist, "starter", True, hist.index.min(), hist.index.max())
    hype = z >= 2 or v_ratio >= 1.5
    ctx.metric("rendement 20 séances", last20)
    ctx.metric("z-score du rendement 20 séances", z)
    ctx.metric("volume 20 séances / 120 précédentes", v_ratio)
    gdelt_ratio = None
    end = px.index.max().date()
    try:
        tl = gdelt.timeline(ticker, ctx.state["asset"]["name"], end - timedelta(days=90), end)
        vals = pd.Series({p["date"]: p["value"] for p in tl.points})
        if len(vals) >= 30:
            recent, base = vals.iloc[-14:].mean(), vals.iloc[:-14].mean()
            gdelt_ratio = float(recent / base) if base > 0 else None
        sid = ctx.source(f"gdelt_timeline_{ticker}", f"GDELT DOC 2.0, intensité de couverture, {tl.query}", tl.url)
        datasets.gdelt_timeline(ctx, tl, sid)
        ctx.metric("couverture GDELT 14 j / 76 j précédents", gdelt_ratio if gdelt_ratio is not None else "n.d.")
        if gdelt_ratio is not None:
            ctx.report.factor("Pic médiatique GDELT (14 derniers jours / période précédente)", gdelt_ratio, "x",
                              source_id=sid, digits=2)
            hype = hype or gdelt_ratio >= 1.5
        ctx.decide("Couverture médiatique utilisée ?",
                   "oui" if gdelt_ratio is not None else "non",
                   f"Intensité GDELT des 14 derniers jours / 76 jours précédents = {gdelt_ratio:.2f}."
                   if gdelt_ratio is not None else f"Seulement {len(vals)} jour(s) de couverture GDELT (30 requis) "
                   "ou couverture nulle : critère médiatique ignoré.", "au moins 30 jours de couverture")
    except ExternalUnavailable as exc:
        ctx.warn(f"GDELT indisponible ({exc.reason}) : signal de battage fondé sur les prix et volumes seulement.")
        ctx.decide("Couverture médiatique utilisée ?", "non", f"GDELT indisponible ({exc.reason}) : le signal "
                   "repose sur les prix et volumes seulement.")
    triggered = [name for name, hit in (("z ≥ 2", z >= 2), ("volume × 1,5", v_ratio >= 1.5),
                                        ("couverture GDELT × 1,5", gdelt_ratio is not None and gdelt_ratio >= 1.5))
                 if hit]
    ctx.decide("Battage détecté ?", "oui" if hype else "non",
               ("Critère(s) atteint(s) : " + ", ".join(triggered) + ".") if triggered else
               "Aucun critère atteint sur les 20 dernières séances.",
               "battage si z-score du rendement 20 séances ≥ 2, volume récent ≥ 1,5 × l'habituel ou couverture "
               "GDELT ≥ 1,5 × la période précédente",
               {"z-score": z, "ratio de volume": v_ratio, "ratio GDELT": gdelt_ratio})
    ctx.state["hype"] = hype
    ctx.metric("battage détecté", "oui" if hype else "non")
    ctx.preview(["date", "adj_close", "volume"], [[d, r["adj_close"], r["volume"]] for d, r in hist.tail(20).iterrows()])
    ctx.report.factor(f"Rendement de {ticker} sur 20 séances", last20, "ratio", source_id=starter.STARTER_SOURCE_ID)
    ctx.report.factor("Z-score de ce rendement", z, "σ", source_id=starter.STARTER_SOURCE_ID, digits=2)
    ctx.report.factor("Volume récent / volume habituel", v_ratio, "x", source_id=starter.STARTER_SOURCE_ID, digits=2)
    ctx.report.factor("Signal de battage", "détecté" if hype else "non détecté",
                      effect="seuils : z ≥ 2, volume × 1,5 ou couverture GDELT × 1,5")


def profile_check(ctx: Context) -> None:
    c = ctx.persona["constraints"]
    flags: list[str] = []
    cats = {s["category"] for s in ctx.state.get("signals", [])}
    ticker = ctx.state.get("ticker")
    vol = None
    if ticker and starter.in_starter(ticker):
        vol = market.annualized_volatility(market.window(starter.adj_close(ticker),
                                                         starter.last_price_date() - pd.DateOffset(years=1),
                                                         starter.last_price_date()))
        flags += profile.asset_flags(ctx.persona, ctx.state["asset"], vol)
        ctx.report.factor(f"Volatilité annualisée de {ticker} (1 an)", vol, "ratio", source_id=starter.STARTER_SOURCE_ID)
        ctx.source(starter.STARTER_SOURCE_ID, "AlphaForge starter kit, prices_daily.csv (Yahoo Finance via yfinance)")
        asset_flags = flags[:]
        ctx.decide(f"{ticker} compatible avec le profil ?", "à surveiller" if asset_flags else "oui",
                   " ".join(asset_flags) if asset_flags else "Aucun écart avec les contraintes du profil.",
                   f"volatilité 1 an ≤ {c['max_volatility'] * 100:.0f} %, cryptos "
                   f"{'permises' if c['allow_crypto'] else 'exclues'}, secteurs et titres exclus",
                   {"volatilité": vol})
    else:
        ctx.decide("Titre confronté au profil ?", "non", "Aucun titre du kit identifié : seuls les biais du message "
                   "sont confrontés au profil.")
    lo, hi = c["horizon_years"]
    checks = (
        ("Concentration contraire au profil ?", "concentration" in cats,
         f"position ≤ {c['max_single_position'] * 100:.0f} % du portefeuille",
         f"Concentration sur un seul titre, alors que le profil de {ctx.persona['name']} limite une "
         f"position à {c['max_single_position'] * 100:.0f} % du portefeuille.",
         "Pas de signal de concentration dans le message."),
        ("Panique à mettre en perspective avec l'horizon ?", "panique" in cats and lo >= 8,
         "panique détectée et horizon minimal ≥ 8 ans",
         f"Le message contient un indice possible de panique ; à mettre en perspective avec "
         f"l'horizon de {ctx.persona['name']} ({ctx.persona['horizon']}).",
         "Pas de panique détectée." if "panique" not in cats else f"Horizon minimal de {lo} ans (< 8)."),
        ("Horizon trop court pour ce risque ?", hi <= 5 and (vol or 0) > c["max_volatility"],
         f"horizon maximal ≤ 5 ans et volatilité > {c['max_volatility'] * 100:.0f} %",
         f"Horizon court ({ctx.persona['horizon']}) : peu de temps pour récupérer d'une baisse.",
         f"Horizon de {lo} à {hi} ans" + ("" if vol is None else ", volatilité dans les limites") + "."),
    )
    for question, hit, rule, flag, otherwise in checks:
        if hit:
            flags.append(flag)
        ctx.decide(question, "oui" if hit else "non", flag if hit else otherwise, rule)
    if "ESG" in ctx.persona.get("preferences", []):
        ctx.report.limit("Le jeu de données ne permet pas de vérifier les controverses ESG de l'entreprise : "
                         "le filtre sectoriel ne constitue pas une vérification ESG complète.")
        ctx.decide("Controverses ESG vérifiées ?", "non", "Le profil a une préférence ESG mais le jeu de données "
                   "ne couvre pas les controverses : seul le filtre sectoriel s'applique (limite déclarée).",
                   "préférence ESG du profil → limite ajoutée")
    ctx.report.profile_flags.extend(flags)
    ctx.report.limit("Aucun historique des décisions ou transactions du profil n'est disponible : "
                     "on ne peut pas établir une habitude comportementale.")
    ctx.metric("écarts au profil", len(flags))
    ctx.metric("volatilité maximale du profil", c["max_volatility"])
    ctx.metric("position maximale du profil", c["max_single_position"])
    ctx.preview(["écart au profil"], [[f] for f in flags])
    ctx.dataset("profile_flags", "Écarts au profil", ["écart au profil"], [[f] for f in flags])
    ctx.dataset("profile_constraints", f"Contraintes du profil {ctx.persona['name']} (personas.json)",
                ["contrainte", "valeur"], datasets.flatten(c))
    ctx.report.factor("Position maximale par titre (profil)", c["max_single_position"], "ratio")
    ctx.report.factor("Volatilité maximale retenue pour le profil", c["max_volatility"], "ratio")
    ctx.report.assume(f"Seuils du profil {ctx.persona['name']} : volatilité ≤ {c['max_volatility'] * 100:.0f} %, "
                      f"position ≤ {c['max_single_position'] * 100:.0f} % (règles internes de StockLock).")


def simulation_2022(ctx: Context) -> None:
    choice = ctx.opt("portfolio")
    ticker = ctx.state.get("ticker")
    question, rule = "Quel portefeuille simuler ?", f"option portfolio = {choice}"
    if choice == "ticker" and (not ticker or not starter.in_starter(ticker)):
        ctx.warn("Portefeuille « titre » demandé sans titre du kit identifié : simulation sur le 60/40.")
        choice = "60_40"
        ctx.decide(question, "60/40 SPY/AGG (repli)", "Portefeuille « titre » demandé sans titre du kit identifié.",
                   rule)
    else:
        ctx.decide(question, "60/40 SPY/AGG" if choice == "60_40" else f"100 % {ticker}",
                   "Choix de l'option de l'étape.", rule)
    weights = {"SPY": 0.6, "AGG": 0.4} if choice == "60_40" else {ticker: 1.0}
    tickers = list(weights)
    prices = pd.concat({t: starter.adj_close_cad(t) for t in tickers}, axis=1, join="inner").dropna()
    start = pd.Timestamp("2022-01-01")
    if prices.loc[prices.index.year == 2022].empty:
        ctx.warn("Simulation indisponible : aucun historique de prix commun en 2022 pour ce titre.")
        ctx.decide("Simuler ?", "non", "Aucun historique de prix commun en 2022 pour ce portefeuille.")
        return
    value = simulation.portfolio_value(prices, weights, start, INITIAL_CAD)
    cash = starter.adj_close_cad(CASH_PROXY)
    res = simulation.simulate_panic(value, cash, ctx.opt("sell_point"), ctx.opt("reentry"))
    sell_rule = f"option sell_point = {ctx.opt('sell_point')}"
    if res.sell_date is None:
        ctx.decide("Quand vendre ?", "jamais", "La valeur n'est jamais descendue à −20 % de la valeur initiale en "
                   "2022 : conserver et vendre donnent le même résultat.", sell_rule)
    else:
        ctx.decide("Quand vendre ?", res.sell_date, (f"Creux de 2022 : valeur la plus basse de l'année ({res.sell_value:,.0f} $)."
                   if ctx.opt("sell_point") == "trough" else "Premier jour de 2022 à −20 % de la valeur initiale.")
                   .replace(",", " "), sell_rule, {"baisse à la vente": res.drawdown_at_sale})
        ctx.decide("Où placer le produit de la vente ?", f"{CASH_PROXY} (obligations ultra-courtes)",
                   "Équivalent de liquidités du kit, en CAD.")
        ctx.decide("Réinvestir ?", res.reentry_date or "non",
                   "Jamais, par option." if ctx.opt("reentry") == "never" else
                   ("Dès le retour à la valeur initiale." if res.reentry_date is not None else
                    "La valeur initiale n'a pas été retrouvée avant la fin du kit."),
                   f"option reentry = {ctx.opt('reentry')}")
    ctx.decide("Conserver ou vendre en panique ?", "conserver" if res.difference >= 0 else "vendre",
               f"Valeur finale au {res.end.date()} : {res.hold_final:,.0f} $ en conservant contre "
               f"{res.panic_final:,.0f} $ après la vente.".replace(",", " "), "plus grande valeur finale",
               {"écart": res.difference})
    ctx.source(starter.STARTER_SOURCE_ID, "AlphaForge starter kit, prices_daily.csv (Yahoo Finance via yfinance)")
    ctx.source("boc_fx", "Banque du Canada, FXUSDCAD (fx_usdcad_daily.csv du kit)")
    label = "60/40 SPY/AGG" if choice == "60_40" else ticker
    ctx.state["simulation"] = res
    series = pd.DataFrame({"hold": res.hold_path, "panic": res.panic_path})
    quarterly = series.groupby(series.index.to_period("Q"), sort=True).tail(1)
    sampled = pd.concat([series.iloc[[0]], quarterly, series.iloc[[-1]]])
    sampled = sampled.loc[~sampled.index.duplicated(keep="last")].dropna().sort_index()
    ctx.state["simulation_data"] = {
        "ticker": label, "start": res.start.date().isoformat(), "end": res.end.date().isoformat(),
        "sell_date": res.sell_date.date().isoformat() if res.sell_date is not None else None,
        "initial": res.initial, "hold_final": res.hold_final, "panic_final": res.panic_final,
        "points": [{"date": d.date().isoformat(), "hold": float(r["hold"]), "panic": float(r["panic"])}
                   for d, r in sampled.iterrows()],
    }
    ctx.metric("portefeuille", label)
    ctx.metric("date d'achat", res.start)
    ctx.metric("date de vente", res.sell_date or "aucune vente")
    ctx.metric("date de réentrée", res.reentry_date or "aucune")
    ctx.metric("valeur finale conservation", res.hold_final)
    ctx.metric("valeur finale vente panique", res.panic_final)
    monthly = pd.DataFrame({"hold": res.hold_path, "panic": res.panic_path}).resample("QE").last()
    ctx.preview(["fin de trimestre", "conservation (CAD)", "vente panique (CAD)"],
                [[d, r["hold"], r["panic"]] for d, r in monthly.iterrows()])
    ctx.dataset("quarterly_values", "Valeurs de fin de trimestre",
                ["fin de trimestre", "conservation (CAD)", "vente panique (CAD)"],
                ([d, r["hold"], r["panic"]] for d, r in monthly.iterrows()), starter.STARTER_SOURCE_ID)
    if ctx.collect_datasets:
        daily = prices.rename(columns=lambda t: f"{t} (CAD)")
        daily[f"{CASH_PROXY} (CAD)"] = cash
        daily["conservation (CAD)"] = res.hold_path
        daily["vente panique (CAD)"] = res.panic_path
        ctx.dataset_frame("daily_paths", f"Simulation quotidienne : prix en CAD et valeur du portefeuille {label}",
                          daily.loc[daily.index >= res.start], starter.STARTER_SOURCE_ID, index="date")
    src = starter.STARTER_SOURCE_ID
    ctx.report.factor("Simulation 2022 — portefeuille", label)
    ctx.report.factor("Montant initial simulé", INITIAL_CAD, "$", source_id=src, digits=0)
    if res.sell_date is not None:
        ctx.report.factor(f"Valeur à la vente du {res.sell_date.date()}", res.sell_value, "$", source_id=src, digits=0)
        ctx.report.factor("Baisse au moment de la vente", res.drawdown_at_sale, "ratio", source_id=src)
    else:
        ctx.warn("Le seuil de vente n'a jamais été atteint en 2022 : les deux stratégies sont identiques.")
    if res.reentry_date is not None:
        ctx.report.factor(f"Réinvestissement le {res.reentry_date.date()}", "après retour à la valeur initiale")
    ctx.report.factor(f"Valeur finale en conservant ({res.end.date()})", res.hold_final, "$", source_id=src, digits=0)
    ctx.report.factor(f"Valeur finale après vente panique ({res.end.date()})", res.panic_final, "$", source_id=src, digits=0)
    ctx.report.factor("Écart conservation − vente panique", res.difference, "$", source_id=src, digits=0)
    ctx.report.factor("Rendement annualisé en conservant", simulation.cagr(res.initial, res.hold_final, res.start, res.end),
                      "ratio", source_id=src)
    ctx.report.factor("Rendement annualisé après vente panique",
                      simulation.cagr(res.initial, res.panic_final, res.start, res.end), "ratio", source_id=src)
    ctx.report.assume(f"Simulation en CAD : achat de {INITIAL_CAD:,.0f} $ le premier jour de bourse de 2022, sans "
                      "rééquilibrage ; produit de la vente placé dans ZST.TO (obligations ultra-courtes) comme "
                      "équivalent de liquidités.".replace(",", " "))
    sp = "au creux de 2022" if ctx.opt("sell_point") == "trough" else "le premier jour à −20 % de la valeur initiale"
    ctx.report.assume(f"Vente {sp} ; réentrée : "
                      + ("jamais." if ctx.opt("reentry") == "never" else "dès le retour à la valeur initiale."))
    ctx.report.limit("Vendre exactement au creux est un cas extrême, connu seulement après coup ; le résultat "
                     "dépend de la période du kit (fin 2026) et du biais du survivant.")


def _key(ctx: Context) -> dict:
    n = len(ctx.state.get("signals", [])) + (1 if ctx.state.get("hype") else 0)
    return {"label": "Biais détectés", "value": n}


STEP = StepSpec(
    id="bias",
    label="4. Biais",
    inputs=(
        InputSpec("message", "Message de l'investisseur", "textarea",
                  "Tout le monde achète NVDA, je mets toute ma retraite dessus !"),
        InputSpec("ticker", "Titre (facultatif)", "text", "", "Vide = détection dans le message."),
    ),
    stages=(
        StageSpec("message_analysis", "Analyse du message",
                  "Émotions et battage (FOMO, panique, autorité sociale…) avec extraits du message.",
                  message_analysis,
                  (OptionSpec("method", "Méthode",
                              (Choice("lexicon", "Lexique"), Choice("haiku", "Claude Haiku"),
                               Choice("both", "Les deux")), "both",
                              "Les extraits proposés par Haiku sont rejetés s'ils ne figurent pas mot pour mot."),),
                  degradable=False),
        StageSpec("hype_signal", "Signal de battage",
                  "Hausse et volume anormaux récents (kit) et pic de couverture GDELT.", hype_signal,
                  (OptionSpec("enabled", "Activé", (Choice("on", "Oui"), Choice("off", "Non")), "on"),)),
        StageSpec("profile_check", "Confrontation au profil", "Risque, horizon et concentration du profil.",
                  profile_check),
        StageSpec("simulation_2022", "Simulation 2022", "Vente panique en 2022 contre conservation jusqu'à aujourd'hui.",
                  simulation_2022,
                  (OptionSpec("portfolio", "Portefeuille",
                              (Choice("60_40", "60/40 SPY/AGG"), Choice("ticker", "Titre du message")), "60_40"),
                   OptionSpec("sell_point", "Moment de la vente",
                              (Choice("trough", "Au creux de 2022"),
                               Choice("first_minus_20", "Premier jour à −20 %")), "trough"),
                   OptionSpec("reentry", "Réentrée",
                              (Choice("never", "Jamais"), Choice("after_recovery", "Après le retour à la valeur initiale")),
                              "never")),
                  degradable=False),
        StageSpec("narration", "Narration", "Explication rédigée par un agent à partir des faits.",
                  common.narration_stage, (common.NARRATION_MODEL,)),
        StageSpec("governance", "Gouvernance",
                  "Sources, mention de simulation, cohérence au profil, chiffres sourcés.",
                  common.governance_stage),
    ),
    request_model=BiasInputs,
    key_result=_key,
)

