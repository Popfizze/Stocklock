"""Gold: `indicateurs_bruts` (12 per title) -> `rangs` (capped, 0-100) -> `score_par_titre` (the API's table)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any

import pandas as pd

from app.score_pipeline import indicators as ind
from app.score_pipeline import store as st
from app.score_pipeline.cours import FX_SYMBOL
from app.score_pipeline.indicators import Value
from app.score_pipeline.runs import GOLD_LATEST_KEY, RunContext, StageRecorder, now_iso
from app.services.score_table import ScoreRow, ScoreTable

MIN_SECTOR = 5
MIN_PRICE_DAYS = 150
STALE_DAYS = 550
METHOD = (
    "Score StockLock 0-100, indépendant du profil : 6 sous-scores pondérés — rentabilité 25 % (ROE sur 12 mois "
    "et capitaux propres moyens, marge nette), solidité 20 % (dette / capitaux propres, couverture des intérêts), "
    "croissance 15 % (croissance annuelle composée sur 3 ans du chiffre d'affaires et du BPA), valorisation 15 % "
    "(C/B et C/VC, rangés dans le secteur, bénéfice négatif au dernier rang), momentum et risque 15 % (rendement "
    "12-1 mois, volatilité annualisée, repli maximal sur 1 an), événements 10 % (90 jours, pondérés par la "
    "pertinence et une demi-vie de 30 jours, 50 = neutre). Chaque indicateur est plafonné aux 5e et 95e centiles "
    "puis converti en rang 0-100 ; un sous-score est la moyenne de ses rangs ; un sous-score manquant cède son "
    "poids aux autres et la ligne est marquée partielle."
)


@dataclass
class TitleData:
    symbol: str
    asset_type: str
    sector: str
    price_currency: str | None
    market_cap: float | None
    releves: pd.DataFrame | None
    closes: pd.Series | None
    events: list[tuple[date, float, float]] = field(default_factory=list)
    events_status: str = "failed"   # ok | failed | skipped


# --- Fundamentals --------------------------------------------------------------------------------------

def _ttm(q: pd.DataFrame, end_idx: int, column: str) -> float | None:
    if end_idx < 3:
        return None
    window = q.iloc[end_idx - 3:end_idx + 1]
    span = (window["period_end"].iloc[-1] - window["period_end"].iloc[0]).days
    if not 250 <= span <= 300 or window[column].isna().any():
        return None
    return float(window[column].sum())


def trailing(rel: pd.DataFrame, column: str) -> float | None:
    """Trailing twelve months: the last 4 consecutive quarters, else the last fiscal year."""
    q = rel[rel["period_type"] == "Q"].reset_index(drop=True)
    value = _ttm(q, len(q) - 1, column) if len(q) else None
    if value is not None:
        return value
    fy = rel[(rel["period_type"] == "FY") & rel[column].notna()]
    if len(fy) and (q.empty or fy["period_end"].iloc[-1] >= q["period_end"].iloc[-1] - timedelta(days=200)):
        return float(fy[column].iloc[-1])
    return None


def growth_3y(rel: pd.DataFrame, column: str) -> Value:
    """3-year CAGR: trailing 12 months now vs 3 years earlier, else fiscal year vs 3 fiscal years earlier."""
    q = rel[rel["period_type"] == "Q"].reset_index(drop=True)
    if len(q) >= 16:
        last = len(q) - 1
        target = q["period_end"].iloc[last] - timedelta(days=3 * 365)
        candidates = [j for j in range(3, last) if abs((q["period_end"].iloc[j] - target).days) <= 45]
        if candidates:
            now, then = _ttm(q, last, column), _ttm(q, candidates[-1], column)
            if now is not None and then is not None:
                return ind.cagr(then, now, 3)
    fy = rel[(rel["period_type"] == "FY") & rel[column].notna()].reset_index(drop=True)
    if len(fy) >= 2:
        last_end = fy["period_end"].iloc[-1]
        older = fy[(fy["period_end"] - (last_end - timedelta(days=3 * 365))).abs() <= timedelta(days=45)]
        if len(older):
            return ind.cagr(float(older[column].iloc[-1]), float(fy[column].iloc[-1]), 3)
    return ind.missing("Historique insuffisant (3 ans)")


def _latest(rel: pd.DataFrame, column: str) -> tuple[float | None, pd.Timestamp | None]:
    q = rel[rel[column].notna()]
    if q.empty:
        return None, None
    return float(q[column].iloc[-1]), q["period_end"].iloc[-1]


def _equity_avg(rel: pd.DataFrame) -> float | None:
    eq = rel[rel["equity"].notna()]
    if eq.empty:
        return None
    last_end = eq["period_end"].iloc[-1]
    year_ago = eq[(eq["period_end"] - (last_end - timedelta(days=365))).abs() <= timedelta(days=45)]
    values = [float(eq["equity"].iloc[-1])] + ([float(year_ago["equity"].iloc[-1])] if len(year_ago) else [])
    return sum(values) / len(values)


def fx_factor(stmt: str | None, price: str | None, usdcad: float | None) -> float | None:
    """Multiplier from the statements' currency to the price's currency (USD and CAD only)."""
    stmt, price = (stmt or "USD").upper(), (price or "USD").upper()
    if stmt == price:
        return 1.0
    if usdcad and {stmt, price} == {"USD", "CAD"}:
        return usdcad if stmt == "USD" else 1 / usdcad
    return None


def fundamentals(t: TitleData, run_date: date, usdcad: float | None, last_close: float | None) -> dict[str, Value]:
    ids = ("roe", "net_margin", "debt_to_equity", "interest_coverage", "revenue_cagr_3y", "eps_cagr_3y", "pe", "pb")
    if t.asset_type != "action":
        return {i: ind.missing("FNB : pas de relevés financiers") for i in ids}
    rel = t.releves
    if rel is None or rel.empty:
        return {i: ind.missing("Relevés financiers indisponibles") for i in ids}
    if (pd.Timestamp(run_date) - rel["period_end"].max()).days > STALE_DAYS:
        return {i: ind.missing("Relevés trop anciens (plus de 18 mois)") for i in ids}
    out: dict[str, Value] = {}
    ni, rev = trailing(rel, "net_income"), trailing(rel, "revenue")
    equity_avg = _equity_avg(rel)
    equity, _ = _latest(rel, "equity")
    debt, _ = _latest(rel, "total_debt")
    if ni is None or equity_avg is None:
        out["roe"] = ind.missing("Résultat net ou capitaux propres manquants")
    elif equity_avg <= 0:
        out["roe"] = Value(None, True, "Capitaux propres négatifs : classé au dernier rang")
    else:
        out["roe"] = Value(ni / equity_avg)
    margin = ind.ratio(ni, rev) if rev and rev > 0 else None
    out["net_margin"] = Value(margin) if margin is not None else ind.missing("Chiffre d'affaires ou résultat manquant")
    if equity is not None and equity <= 0:
        out["debt_to_equity"] = Value(None, True, "Capitaux propres négatifs : classé au dernier rang")
    elif debt is None or equity is None:
        out["debt_to_equity"] = ind.missing("Dette non publiée dans les relevés")
    else:
        out["debt_to_equity"] = Value(debt / equity)
    op, interest = trailing(rel, "operating_income"), trailing(rel, "interest_expense")
    if op is None or not interest:
        out["interest_coverage"] = ind.missing("Résultat d'exploitation ou charge d'intérêts non publiés")
    else:
        out["interest_coverage"] = Value(op / abs(interest))
    out["revenue_cagr_3y"] = growth_3y(rel, "revenue")
    out["eps_cagr_3y"] = growth_3y(rel, "eps")
    stmt_currency = rel["currency"].dropna().iloc[-1] if rel["currency"].notna().any() else None
    factor = fx_factor(stmt_currency, t.price_currency, usdcad)
    eps = trailing(rel, "eps")
    if factor is None:
        note = f"Devises différentes ({stmt_currency} / {t.price_currency}) : non convertibles"
        out["pe"], out["pb"] = ind.missing(note), ind.missing(note)
        return out
    if eps is None or last_close is None:
        out["pe"] = ind.missing("BPA ou cours manquant")
    elif eps <= 0:
        out["pe"] = Value(None, True, "Bénéfice négatif : classé au dernier rang")
    else:
        out["pe"] = Value(last_close / (eps * factor))
    if equity is None or not t.market_cap:
        out["pb"] = ind.missing("Capitaux propres ou capitalisation manquants")
    elif equity <= 0:
        out["pb"] = Value(None, True, "Capitaux propres négatifs : classé au dernier rang")
    else:
        out["pb"] = Value(float(t.market_cap) / (equity * factor))
    return out


def price_indicators(t: TitleData) -> tuple[dict[str, Value], pd.Timestamp | None]:
    closes = t.closes
    if closes is None or closes.dropna().empty:
        note = "Cours indisponibles"
        return {i: ind.missing(note) for i in ("momentum_12_1", "volatility_1y", "max_drawdown_1y")}, None
    as_of = closes.index.max()
    year = closes[closes.index > as_of - pd.DateOffset(years=1)]
    ppy = 365.0 if t.asset_type == "crypto" else 252.0
    out: dict[str, Value] = {}
    momentum = ind.momentum_12_1(closes, as_of)
    out["momentum_12_1"] = Value(momentum) if momentum is not None else ind.missing("Moins de 12 mois de cours")
    if len(year) < MIN_PRICE_DAYS:
        note = f"Moins de {MIN_PRICE_DAYS} séances sur 1 an"
        out["volatility_1y"], out["max_drawdown_1y"] = ind.missing(note), ind.missing(note)
    else:
        out["volatility_1y"] = Value(ind.annualized_volatility(year, ppy))
        out["max_drawdown_1y"] = Value(ind.max_drawdown(year))
    return out, as_of


def events_indicator(t: TitleData, run_date: date) -> Value:
    if t.events_status == "skipped" or t.asset_type != "action":
        return ind.missing("FNB : pas d'actualités d'entreprise")
    if t.events_status != "ok":
        return ind.missing("Actualités non collectées pour ce titre")
    value, n = ind.events_value(t.events, run_date)
    return Value(value, note=None if n else "Aucun événement sur 90 jours : neutre (50)")


# --- Ranks and rows ------------------------------------------------------------------------------------

def rank_all(raw: dict[str, dict[str, Value]], sectors: dict[str, str]
             ) -> tuple[dict[str, dict[str, float]], dict[str, dict[str, float]], dict[str, str]]:
    """(capped values, ranks) by indicator then symbol, and each title's valuation comparison group."""
    capped: dict[str, dict[str, float]] = {}
    ranks: dict[str, dict[str, float]] = {}
    groups: dict[str, str] = {}
    for indicator in ind.INDICATORS:
        values = {s: v[indicator] for s, v in raw.items() if v[indicator].present}
        if indicator not in ind.VALUATION:
            capped[indicator], ranks[indicator] = ind.rank_indicator(indicator, values)
            continue
        capped[indicator], ranks[indicator] = {}, {}
        by_sector: dict[str, dict[str, Value]] = {}
        for s, v in values.items():
            by_sector.setdefault(sectors.get(s) or "Non classé", {})[s] = v
        small = {s: v for sec, members in by_sector.items() if len(members) < MIN_SECTOR for s, v in members.items()}
        for sector, members in by_sector.items():
            if len(members) < MIN_SECTOR:
                continue
            c, r = ind.rank_indicator(indicator, members)
            capped[indicator].update(c)
            ranks[indicator].update(r)
            for s in members:
                groups.setdefault(s, f"{sector}, {len(members)} titres")
        if small:
            pool = values  # small sectors are ranked against every stock with a value
            c, r = ind.rank_indicator(indicator, pool)
            for s in small:
                if s in r:
                    ranks[indicator][s] = r[s]
                if s in c:
                    capped[indicator][s] = c[s]
                groups.setdefault(s, f"Toutes les actions ({len(pool)} titres ; secteur {sectors.get(s)} trop petit)")
    return capped, ranks, groups


def build_row(symbol: str, as_of: str, raw: dict[str, Value], ranks: dict[str, dict[str, float]],
              comparison: str, sources: list[dict[str, Any]]) -> dict[str, Any] | None:
    sub_scores: dict[str, float | None] = {}
    blocks = []
    for sub in ind.SUBSCORES:
        indicators = []
        for d in sub.indicators:
            v = raw[d.id]
            rank = ranks[d.id].get(symbol)
            indicators.append({"id": d.id, "label": d.label, "value": None if v.value is None else round(v.value, 6),
                               "unit": d.unit, "better": d.better, "rank": rank, "note": v.note})
        sub_scores[sub.id] = ind.mean(i["rank"] for i in indicators)
        blocks.append((sub, indicators))
    score, effective, partiel = ind.combine(sub_scores)
    if score is None:
        return None
    out = []
    for sub, indicators in blocks:
        s = sub_scores[sub.id]
        out.append({"id": sub.id, "label": sub.label, "weight": sub.weight,
                    "effective_weight": round(effective[sub.id], 4),
                    "score": None if s is None else round(s, 2),
                    "contribution": round((s or 0.0) * effective[sub.id], 2), "indicators": indicators})
    return {"symbol": symbol, "date": as_of, "score": round(min(100.0, max(0.0, score)), 2), "partiel": partiel,
            "comparison_set": comparison, "sub_scores": out, "sources": sources}


# --- Stage ---------------------------------------------------------------------------------------------

def _load(ctx: RunContext, store: st.Store) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame, dict]:
    univ = st.get_csv(store, ctx.key("silver", "univers", "univers.csv"))
    rel = st.get_csv(store, ctx.key("silver", "releves_normalises", "releves_normalises.csv"))
    prices = st.get_csv(store, ctx.key("silver", "cours_propres", "cours_propres.csv.gz"))
    events = st.get_csv(store, ctx.key("silver", "evenements_structures", "evenements_structures.csv"))
    coverage = st.get_json(store, ctx.key("silver", "evenements_structures", "couverture.json"))
    return univ, rel, prices, events, coverage


def _sources(ctx: RunContext, store: st.Store) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        manifest = st.get_json(store, ctx.key("bronze", "releves_bruts", "manifest.json"))
    except st.NotFound:
        manifest = {}
    try:
        index = st.get_json(store, ctx.key("bronze", "articles_bruts", "articles_par_titre.json.gz"))
    except st.NotFound:
        index = {}
    return manifest, index


def row_sources(symbol: str, manifest: dict[str, Any], index: dict[str, Any], rel: pd.DataFrame | None,
                price_as_of: str | None, run_date: str, has_events: bool) -> list[dict[str, Any]]:
    out = []
    m = manifest.get(symbol) or {}
    published = None if rel is None or rel.empty else str(rel["published"].max())[:10]
    if m.get("source") == "edgar":
        out.append({"id": "sec_edgar", "title": f"SEC EDGAR companyfacts (CIK {m.get('cik')})", "url": m.get("url"),
                    "as_of": published})
    elif m.get("source") == "yahoo":
        out.append({"id": "yahoo_financials", "title": "Yahoo Finance, états financiers", "url": m.get("url"),
                    "as_of": published})
    if price_as_of:
        out.append({"id": "yahoo_prices", "title": "Yahoo Finance, cours quotidiens ajustés",
                    "url": f"https://finance.yahoo.com/quote/{symbol}/history", "as_of": price_as_of})
    sources = (index.get(symbol) or {}).get("sources") or {}
    titles = {"gdelt": ("GDELT DOC 2.0", "https://api.gdeltproject.org/api/v2/doc/doc"),
              "federal_register": ("Federal Register", "https://www.federalregister.gov/"),
              "yahoo": ("Yahoo Finance, actualités", f"https://finance.yahoo.com/quote/{symbol}/news")}
    for key, status in sources.items():
        if status == "ok" and key in titles:
            out.append({"id": f"news_{key}", "title": titles[key][0], "url": titles[key][1], "as_of": run_date})
    if has_events:
        out.append({"id": "bedrock_haiku", "title": "Événements extraits par Claude Haiku (Amazon Bedrock)",
                    "url": None, "as_of": run_date})
    return out


def run(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    univ, rel, prices, events, coverage = _load(ctx, store)
    manifest, index = _sources(ctx, store)
    run_date = date.fromisoformat(ctx.date)
    rel["period_end"] = pd.to_datetime(rel["period_end"])
    rel = rel[pd.to_datetime(rel["published"]) <= pd.Timestamp(run_date)].sort_values(["symbol", "period_end"])
    prices["date"] = pd.to_datetime(prices["date"])
    closes = {s: g.set_index("date")["adj_close"].sort_index() for s, g in prices.groupby("symbol")}
    fx = closes.get(FX_SYMBOL)
    usdcad = float(fx.iloc[-1]) if fx is not None and len(fx) else None
    rec.decide("info", f"Taux de change USD→CAD du jour (Yahoo {FX_SYMBOL}) pour les C/B et C/VC en devise "
                       f"de cotation : {usdcad:.4f}" if usdcad else "Taux USD→CAD indisponible : "
                       "valorisation limitée aux titres cotés dans la devise de leurs relevés")
    ev_by_symbol: dict[str, list[tuple[date, float, float]]] = {}
    for e in events.itertuples():
        if isinstance(e.date, str):
            ev_by_symbol.setdefault(e.symbol, []).append((date.fromisoformat(e.date[:10]), float(e.impact),
                                                          float(e.relevance)))
    rel_by_symbol = {s: g.reset_index(drop=True) for s, g in rel.groupby("symbol")}

    raw: dict[str, dict[str, Value]] = {}
    as_of: dict[str, str] = {}
    sectors: dict[str, str] = {}
    for u in univ.itertuples():
        t = TitleData(u.symbol, u.asset_type, u.sector if isinstance(u.sector, str) else "Non classé",
                      u.currency if isinstance(u.currency, str) else None,
                      float(u.market_cap) if u.market_cap == u.market_cap else None,
                      rel_by_symbol.get(u.symbol), closes.get(u.symbol), ev_by_symbol.get(u.symbol, []),
                      "skipped" if u.asset_type != "action" else coverage.get(u.symbol, "failed"))
        values, price_as_of = price_indicators(t)
        last_close = float(t.closes.iloc[-1]) if price_as_of is not None else None
        values.update(fundamentals(t, run_date, usdcad, last_close))
        values["events_90d"] = events_indicator(t, run_date)
        raw[u.symbol] = values
        as_of[u.symbol] = price_as_of.date().isoformat() if price_as_of is not None else ctx.date
        if u.asset_type == "action":
            sectors[u.symbol] = t.sector
    capped, ranks, groups = rank_all(raw, sectors)

    rows, rejected = [], 0
    for u in univ.itertuples():
        comparison = groups.get(u.symbol) or f"Ensemble, {len(raw)} titres"
        srcs = row_sources(u.symbol, manifest, index, rel_by_symbol.get(u.symbol),
                           as_of[u.symbol] if u.symbol in closes else None, ctx.date,
                           raw[u.symbol]["events_90d"].value is not None and bool(ev_by_symbol.get(u.symbol)))
        row = build_row(u.symbol, as_of[u.symbol], raw[u.symbol], ranks, comparison, srcs)
        if row is None:
            rejected += 1
            continue
        rows.append(ScoreRow.model_validate(row).model_dump(mode="json"))
    rows.sort(key=lambda r: -r["score"])
    rec.decide("missing", "Titres sans aucun sous-score calculable (ni cours ni relevés) : non notés", rejected)
    partial = sum(1 for r in rows if r["partiel"])
    rec.decide("info", "Lignes partielles : un sous-score manquant cède son poids aux autres", partial)
    for sub in ind.SUBSCORES:
        n = sum(1 for r in rows for s in r["sub_scores"] if s["id"] == sub.id and s["score"] is None)
        rec.decide("missing", f"Sous-score « {sub.label} » manquant", n)
    rec.decide("info", f"Valorisation rangée dans le secteur (au moins {MIN_SECTOR} titres), sinon parmi "
                       "toutes les actions ; autres indicateurs rangés sur l'ensemble des titres notés")

    long_raw = [{"symbol": s, "indicator": i, "value": v.value, "worst": v.worst, "note": v.note}
                for s, vals in raw.items() for i, v in vals.items()]
    long_ranks = [{"symbol": s, "indicator": i, "capped_value": capped[i].get(s), "rank": r,
                   "comparison": groups.get(s) if i in ind.VALUATION else "Ensemble"}
                  for i, by_symbol in ranks.items() for s, r in by_symbol.items()]
    st.put_csv(store, rec.output(ctx.key("gold", "indicateurs_bruts", "indicateurs_bruts.csv")), pd.DataFrame(long_raw))
    st.put_csv(store, rec.output(ctx.key("gold", "rangs", "rangs.csv")), pd.DataFrame(long_ranks))
    table = {"schema_version": 1, "generated_at": now_iso(), "method": METHOD, "run_id": ctx.run_id,
             "date": ctx.date, "rows": rows}
    ScoreTable.model_validate(table)
    st.put_json(store, rec.output(ctx.key("gold", "score_par_titre", "score_par_titre.json")), table)
    st.put_json(store, rec.output(GOLD_LATEST_KEY), table)
    rec.rows.update(indicateurs_bruts=len(long_raw), rangs=len(long_ranks), score_par_titre=len(rows))
    rec.metrics.update(titles_scored=len(rows), partial=partial, table_key=st.ROOT_PREFIX + GOLD_LATEST_KEY,
                       mean_score=round(sum(r["score"] for r in rows) / len(rows), 2) if rows else None,
                       top=[{"symbol": r["symbol"], "score": r["score"], "partiel": r["partiel"]} for r in rows[:5]])
    wide = pd.DataFrame([{"symbol": s, **{i: v.value for i, v in vals.items()}} for s, vals in raw.items()])
    rec.add_sample("indicateurs_bruts", wide)
    rec.add_sample("rangs", pd.DataFrame([{"symbol": s, **{i: ranks[i].get(s) for i in ind.INDICATORS}}
                                          for s in raw]))
    rec.add_sample("score_par_titre", [{"symbol": r["symbol"], "score": r["score"], "partiel": r["partiel"],
                                        **{s["id"]: s["score"] for s in r["sub_scores"]}} for r in rows])
