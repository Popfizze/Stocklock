"""Analysis of a portfolio the client sends (no login: holdings live in the browser, per profile).

- Weights are normalised to sum to 1 (the client may send percentages or amounts); repeated symbols
  are merged; symbols Yahoo does not know are reported in `missing` and left out.
- Diversification: weights by sector (Yahoo sector; ETFs and cryptos « non classé »), asset class and
  country; the largest positions against the persona's maximum position; volatility as Σ w·σ (no
  correlation) and from the covariance of one year of daily returns; Herfindahl index Σ w² and its
  inverse, the effective number of positions (concentration « faible » < 0,10 ≤ « modérée » < 0,20).
- Findings: positions above the maximum, titles out of profile or to watch, portfolio volatility vs the
  persona's maximum, concentration, a sector above 40 %, cryptos above the maximum position.
- Scores: each holding's default and custom score and rank (app.services.custom_score: the gold table
  rescored with the user's weights and factors; the default method when none are sent).
- Suggestions: the best custom scores of the gold table `score_par_titre` that are compatible with the
  persona and fill a sector (or asset class) the portfolio lacks or holds little of, each saying how the
  user's weights moved its rank; without the table, the same ranking over the titles of the persona's
  sections and of « Les plus grandes capitalisations ».
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

import pandas as pd

from app.data import universe, yf_market
from app.data.cache import ExternalUnavailable
from app.services import custom_score, fit, profile, sections

MAX_HOLDINGS = 40
SECTOR_WATCH = 0.40
CONCENTRATION_MODERATE, CONCENTRATION_HIGH = 0.10, 0.20
MIN_COMMON_DAYS = 60
MAX_SUGGESTIONS = 5
PER_BUCKET = 2
CANDIDATES = 60
SECTOR_LABELS = {
    "Basic Materials": "Matériaux de base", "Communication Services": "Services de communication",
    "Consumer Cyclical": "Consommation cyclique", "Consumer Defensive": "Consommation de base",
    "Energy": "Énergie", "Financial Services": "Services financiers", "Healthcare": "Santé",
    "Industrials": "Industrie", "Real Estate": "Immobilier", "Technology": "Technologie",
    "Utilities": "Services publics", "none": "Non classé (FNB, cryptoactifs)",
}
CLASS_LABELS = {"equity": "Actions", "etf": "FNB", "crypto": "Cryptoactifs", "fund": "Fonds"}
COUNTRY_LABELS = {"US": "États-Unis", "CA": "Canada", "none": "Sans pays (cryptoactifs)"}


def _country(symbol: str, kind: str, quote: dict[str, Any]) -> str | None:
    if kind == "crypto":
        return None
    try:
        listing = universe.get(symbol)
    except ExternalUnavailable:
        listing = None
    if listing:
        return listing.country
    return "CA" if symbol.endswith((".TO", ".V")) or quote.get("currency") == "CAD" else "US"


def _buckets(weights: dict[str, float], labels: dict[str, str]) -> list[dict[str, Any]]:
    return [{"key": k, "label": labels.get(k, k), "weight": round(w, 6)}
            for k, w in sorted(weights.items(), key=lambda kv: -kv[1])]


def _portfolio_volatility(weights: dict[str, float]) -> float | None:
    """Annualised volatility from one year of daily returns on common dates; None when too little history."""
    try:
        closes = yf_market.closes_1y(list(weights))
    except ExternalUnavailable:
        return None
    usable = {s: w for s, w in weights.items() if closes.get(s)}
    if sum(usable.values()) < 0.8:
        return None
    frame = pd.concat({s: pd.Series(dict((d, c) for d, c in closes[s])) for s in usable}, axis=1, join="inner")
    returns = frame.sort_index().pct_change().dropna()
    if len(returns) < MIN_COMMON_DAYS:
        return None
    w = pd.Series(usable) / sum(usable.values())
    variance = float(w @ returns[w.index].cov() @ w)
    return math.sqrt(max(variance, 0.0) * 252)


def _diversification(persona: dict[str, Any], holdings: list[dict[str, Any]]) -> dict[str, Any]:
    c = persona["constraints"]
    by_sector: dict[str, float] = defaultdict(float)
    by_class: dict[str, float] = defaultdict(float)
    by_country: dict[str, float] = defaultdict(float)
    for h in holdings:
        by_sector[h["sector"] or "none"] += h["weight"]
        by_class[h["asset_class"]] += h["weight"]
        by_country[h["country"] or "none"] += h["weight"]
    ranked = sorted(holdings, key=lambda h: -h["weight"])
    known = [h for h in holdings if h["volatility_1y"] is not None]
    known_weight = sum(h["weight"] for h in known)
    weighted = sum(h["weight"] * h["volatility_1y"] for h in known) / known_weight if known_weight else None
    hhi = sum(h["weight"] ** 2 for h in holdings)
    return {
        "by_sector": _buckets(by_sector, SECTOR_LABELS), "by_asset_class": _buckets(by_class, CLASS_LABELS),
        "by_country": _buckets(by_country, COUNTRY_LABELS),
        "largest": [{"ticker": h["ticker"], "weight": h["weight"], "over_max": h["over_max_position"]}
                    for h in ranked[:3]],
        "max_position": c["max_single_position"],
        "positions_over_max": [h["ticker"] for h in ranked if h["over_max_position"]],
        "weighted_volatility": weighted,
        "portfolio_volatility": _portfolio_volatility({h["ticker"]: h["weight"] for h in holdings}),
        "max_volatility": c["max_volatility"],
        "hhi": round(hhi, 6), "effective_positions": round(1 / hhi, 2) if hhi else 0.0,
        "concentration": "elevee" if hhi >= CONCENTRATION_HIGH else ("moderee" if hhi >= CONCENTRATION_MODERATE
                                                                     else "faible"),
    }


def _findings(persona: dict[str, Any], holdings: list[dict[str, Any]], d: dict[str, Any]) -> list[dict[str, Any]]:
    c, name, pct = persona["constraints"], persona["name"], profile.pct
    out = []
    for h in holdings:
        if h["over_max_position"]:
            out.append({"severity": "bloquant", "message": f"{h['ticker']} pèse {pct(h['weight'])} du portefeuille, "
                        f"au-dessus du maximum de {pct(c['max_single_position'], 0)} par titre du profil {of(name)}."})
    for verdict, severity, label in (("hors_profil", "bloquant", "hors profil"), ("a_surveiller", "attention",
                                                                                   "à surveiller")):
        hits = [h["ticker"] for h in holdings if h["fit"]["verdict"] == verdict]
        if hits:
            out.append({"severity": severity, "message": f"{len(hits)} titre(s) {label} : {', '.join(hits)}."})
    vol = d["portfolio_volatility"] if d["portfolio_volatility"] is not None else d["weighted_volatility"]
    how = "corrélations sur 1 an" if d["portfolio_volatility"] is not None else "moyenne pondérée, sans corrélations"
    if vol is not None:
        over = vol > c["max_volatility"]
        out.append({"severity": "attention" if over else "ok",
                    "message": f"Volatilité du portefeuille de {pct(vol)} ({how}), "
                               f"{'au-dessus' if over else 'sous'} le maximum de {pct(c['max_volatility'], 0)} du profil."})
    effective = str(d["effective_positions"]).replace(".", ",")
    concentration = {"faible": "faible", "moderee": "modérée", "elevee": "élevée"}[d["concentration"]]
    out.append({"severity": "attention" if d["concentration"] == "elevee" else "ok",
                "message": f"Concentration {concentration} : équivalent de {effective} positions égales."})
    for bucket in d["by_sector"]:
        if bucket["key"] != "none" and bucket["weight"] > SECTOR_WATCH:
            out.append({"severity": "attention", "message": f"Le secteur {bucket['label']} représente "
                        f"{pct(bucket['weight'])} du portefeuille (au-dessus de {pct(SECTOR_WATCH, 0)})."})
    crypto = next((b["weight"] for b in d["by_asset_class"] if b["key"] == "crypto"), 0.0)
    if crypto > c["max_single_position"] and c["allow_crypto"]:
        out.append({"severity": "attention", "message": f"Cryptoactifs : {pct(crypto)} du portefeuille, plus que "
                    f"la position maximale de {pct(c['max_single_position'], 0)} ; à garder minoritaire."})
    order = profile.SEVERITY_ORDER
    return sorted(out, key=lambda f: order[f["severity"]])


def of(name: str) -> str:
    return profile.of_name(name)


def _candidates(persona: dict[str, Any], held: set[str], table: dict[str, Any],
                scored: dict[str, dict[str, Any]]) -> tuple[str, str | None, list[str]]:
    """(source, message, symbols) of the titles to rank: the best custom scores of the gold table, or the
    titles of the persona's sections when the table is not available."""
    if table["status"] == "available" and scored:
        ranked = sorted((r for r in scored.values() if r["custom_rank"] is not None), key=lambda r: r["custom_rank"])
        return "score_table", None, [r["symbol"] for r in ranked if r["symbol"] not in held][:CANDIDATES]
    message = ((table["message"] or "La table des scores n'est pas disponible.")
               + " Suggestions tirées des sections du profil, sans score.")
    picked = [s for s, _ in sections.persona_sections(persona)] + [sections.BY_ID["grandes-capitalisations"]]
    symbols: list[str] = []
    for section in picked:
        try:
            symbols += [q["symbol"] for q in sections.screened(section, 24, persona)]
        except ExternalUnavailable:
            continue
    return "sections", message, [s for s in dict.fromkeys(symbols) if s not in held][:CANDIDATES]


def _bucket(item: dict[str, Any]) -> str:
    return item["sector"] or ("crypto" if item["asset_class"] == "crypto" else "none")


def ordinal(n: int) -> str:
    return "1er" if n == 1 else f"{n}e"


def _score_reasons(ranking: dict[str, Any] | None, scoring: custom_score.Choice, total: int) -> list[str]:
    """How the score, and the user's weights, place a suggestion."""
    if not ranking or ranking["custom_score"] is None:
        return []
    if not scoring.custom:
        return [f"Score StockLock de {ranking['default_score']:.0f} sur 100 ({ordinal(ranking['default_rank'])} "
                f"sur {total})."]
    out = [f"Score StockLock de {ranking['custom_score']:.0f} sur 100 avec vos pondérations "
           f"({ranking['default_score']:.0f} par défaut)."]
    change = ranking["rank_change"]
    if change:
        out.append(f"Vos pondérations le font passer du {ordinal(ranking['default_rank'])} au "
                   f"{ordinal(ranking['custom_rank'])} rang ({change:+d} place{'s' if abs(change) > 1 else ''}).")
    else:
        out.append(f"Vos pondérations ne changent pas son rang ({ordinal(ranking['custom_rank'])} sur {total}).")
    return out


def _suggestions(persona: dict[str, Any], holdings: list[dict[str, Any]], scoring: custom_score.Choice,
                 table: dict[str, Any], scored: dict[str, dict[str, Any]]) -> dict[str, Any]:
    held = {h["ticker"] for h in holdings}
    weights: dict[str, float] = defaultdict(float)
    for h in holdings:
        weights[_bucket(h)] += h["weight"]
    source, message, symbols = _candidates(persona, held, table, scored)
    scores = {s: scored[s]["custom_score"] for s in symbols if s in scored}
    try:
        evaluated = fit.evaluate(persona, symbols)["items"] if symbols else []
    except ExternalUnavailable:
        evaluated = []
    fitting = [i for i in evaluated if i["verdict"] == "compatible" and _bucket(i) != "none"]
    fitting.sort(key=lambda i: (weights.get(_bucket(i), 0.0), -(scores.get(i["ticker"]) or 0),
                                i["volatility_1y"] if i["volatility_1y"] is not None else 9))
    per_bucket: dict[str, int] = defaultdict(int)
    names = {h["name"] for h in holdings}
    items = []
    for i in fitting:
        bucket = _bucket(i)
        if per_bucket[bucket] >= PER_BUCKET or len(items) == MAX_SUGGESTIONS or i["name"] in names:
            continue  # at most 2 per sector, and one share class per company (BRK-A / BRK-B)
        per_bucket[bucket] += 1
        names.add(i["name"])
        what = "Cryptoactifs" if bucket == "crypto" else f"Secteur « {SECTOR_LABELS.get(bucket, bucket)} »"
        share = weights.get(bucket, 0.0)
        ranking = _ranking(scored.get(i["ticker"]))
        reasons = _score_reasons(ranking, scoring, len(scored))
        vol = f" (volatilité sur 1 an de {profile.pct(i['volatility_1y'])})" if i["volatility_1y"] is not None else ""
        reasons.append(f"Compatible avec le profil {of(persona['name'])}{vol}.")
        reasons.append(f"{what} absent du portefeuille : améliore la diversification." if share == 0 else
                       f"{what} à {profile.pct(share)} du portefeuille seulement : renforce la diversification.")
        items.append({"ticker": i["ticker"], "name": i["name"], "sector": i["sector"], "asset_class": i["asset_class"],
                      "score": scores.get(i["ticker"]), "ranking": ranking, "verdict": i["verdict"],
                      "reasons": reasons})
    if not items and message is None:
        message = "Aucun titre de la table des scores n'est à la fois compatible avec le profil et diversifiant."
    return {"source": source, "message": message, "items": items}


def _ranking(row: dict[str, Any] | None) -> dict[str, Any] | None:
    """The `ScoreComparison` of a rescored gold-table row."""
    keys = ("default_score", "custom_score", "delta", "default_rank", "custom_rank", "rank_change", "partiel")
    return {k: row[k] for k in keys} if row else None


def analyze(persona: dict[str, Any], holdings: list[dict[str, Any]],
            scoring: custom_score.Choice = custom_score.DEFAULT) -> dict[str, Any]:
    """The `PortfolioAnalysis` payload, holdings and suggestions scored with `scoring` (the user's weights).

    Raises ExternalUnavailable when Yahoo's quotes are unreachable."""
    merged: dict[str, float] = defaultdict(float)
    for h in holdings:
        symbol = str(h["ticker"]).strip().upper()
        if symbol and h["weight"] > 0:
            merged[symbol] += float(h["weight"])
    total_input = sum(merged.values())
    table, scored = custom_score.rescore_table(scoring)
    evaluated = fit.evaluate(persona, list(merged))
    present = {i["ticker"]: i for i in evaluated["items"]}
    quotes = yf_market.quotes(list(present)) if present else {}
    present_total = sum(merged[s] for s in present) or 1.0
    max_position = persona["constraints"]["max_single_position"]
    analyzed = []
    for symbol, item in present.items():
        weight = merged[symbol] / present_total
        analyzed.append({"ticker": symbol, "name": item["name"], "weight": round(weight, 6),
                         "asset_class": item["asset_class"], "sector": item["sector"],
                         "country": _country(symbol, item["asset_class"], quotes.get(symbol, {})),
                         "volatility_1y": item["volatility_1y"], "over_max_position": weight > max_position + 1e-9,
                         "fit": item, "score": _ranking(scored.get(symbol))})
    analyzed.sort(key=lambda h: -h["weight"])
    diversification = _diversification(persona, analyzed) if analyzed else None
    return {"persona_id": persona["id"], "total_input_weight": round(total_input, 6), "holdings": analyzed,
            "missing": evaluated["missing"], "diversification": diversification,
            "findings": _findings(persona, analyzed, diversification) if analyzed else [],
            "suggestions": _suggestions(persona, analyzed, scoring, table, scored), "scoring": scoring.applied()}
