"""Builders of the Lab's complete datasets: every column and every row a fetcher returned or a stage
produced, attached to the running stage with `Context.dataset*`.

Each builder returns at once when the run does not collect datasets (business routes), so the
flattening below only costs something in the Lab. Raw fetched tables keep the source's own field
names; tables produced by StockLock use French column names.
"""

from __future__ import annotations

import dataclasses
from collections.abc import Iterator
from typing import Any

import pandas as pd

from app.data import starter
from app.pipeline.core import Context
from app.services import scoring

EDGAR_FACT_FIELDS = ("start", "end", "val", "accn", "fy", "fp", "form", "filed", "frame")

FUNDAMENTAL_LABELS = {
    "source": "Source", "period": "Période", "period_end": "Fin de période", "available_on": "Publiée le",
    "currency_reported": "Devise d'origine", "usd_per_unit": "USD par unité",
    "revenue": "Chiffre d'affaires (USD)", "revenue_prev": "Chiffre d'affaires période précédente (USD)",
    "net_income": "Résultat net (USD)", "equity": "Capitaux propres (USD)", "assets": "Actifs (USD)",
    "debt": "Dette (USD)", "debt_concept": "Concept de dette",
    "excluded_by_pit": "Périodes ou faits exclus (publiés après la date d'analyse)", "notes": "Notes",
    "net_margin": "Marge nette", "roe": "Rendement des capitaux propres", "revenue_growth": "Croissance du CA",
    "debt_to_equity": "Dette / capitaux propres", "equity_to_assets": "Capitaux propres / actifs",
}


def flatten(value: Any, prefix: str = "") -> Iterator[tuple[str, Any]]:
    """Nested mappings as dotted keys; lists of mappings indexed; other lists kept whole."""
    if isinstance(value, dict):
        for k, v in value.items():
            yield from flatten(v, f"{prefix}.{k}" if prefix else str(k))
    elif isinstance(value, list) and any(isinstance(v, dict) for v in value):
        for i, v in enumerate(value):
            yield from flatten(v, f"{prefix}[{i}]")
    else:
        yield prefix, value


# --- identification and prices ----------------------------------------------------------------------

def asset(ctx: Context, info: dict[str, Any], origin: str) -> None:
    """The identification record: universe row (or yfinance profile) with the SEC CIK."""
    ticker = info["ticker"]
    source = "starter_universe" if origin == "starter_universe" else f"yfinance_info_{ticker}"
    row = dict(info)
    if "cik" in row:
        row["cik"] = f"{row['cik']:010d}" if row["cik"] else None
    ctx.dataset_records(f"asset_{ticker}", f"Fiche de l'actif {ticker}", [row], source)


def price_history(ctx: Context, ticker: str, df: pd.DataFrame, used: str, cnq_fix: bool,
                  start: pd.Timestamp, end: pd.Timestamp) -> None:
    """Daily prices loaded for `ticker`: every kit column (OHLC, volume, currency) or the yfinance rows."""
    if not ctx.collect_datasets:
        return
    if used == "starter":
        full = starter.prices(cnq_fix)
        rows = full.loc[(full["ticker"] == ticker) & (full["date"] >= start) & (full["date"] <= end)]
        ctx.dataset_frame(f"prices_{ticker}", f"Prix quotidiens {ticker} (kit, prices_daily.csv)",
                          rows.sort_values("date"), starter.STARTER_SOURCE_ID)
    else:
        ctx.dataset_frame(f"prices_{ticker}", f"Prix quotidiens {ticker} (yfinance en direct)", df,
                          f"yfinance_history_{ticker}", index="date")


# --- fundamentals -----------------------------------------------------------------------------------

def raw_fundamentals(ctx: Context, raw: Any, source_id: str) -> None:
    """Every EDGAR companyfacts fact (and its concept), or every yfinance statement line."""
    if not ctx.collect_datasets:
        return
    if raw.source == "edgar":
        _edgar_facts(ctx, raw.payload, source_id)
    else:
        _yf_statements(ctx, raw.payload, source_id)


def _edgar_facts(ctx: Context, payload: dict, source_id: str) -> None:
    rows: list[tuple] = []
    concepts: list[list[Any]] = []
    for taxonomy, nodes in (payload.get("facts") or {}).items():
        for concept, node in nodes.items():
            units = node.get("units") or {}
            count = 0
            for unit, facts in units.items():
                for f in facts:
                    rows.append((taxonomy, concept, unit, *(f.get(k) for k in EDGAR_FACT_FIELDS)))
                    count += 1
            concepts.append([taxonomy, concept, node.get("label"), node.get("description"),
                             ", ".join(units), count])
    # Most recent filings first (they are the ones the score uses), then by concept and period end.
    rows.sort(key=lambda r: (r[0], r[1], r[4] or ""))
    rows.sort(key=lambda r: r[10] or "", reverse=True)
    name = payload.get("entityName") or ""
    ctx.dataset("edgar_facts", f"Faits XBRL EDGAR (companyfacts) {name}".strip(),
                ["taxonomy", "concept", "unit", *EDGAR_FACT_FIELDS], rows, source_id)
    ctx.dataset("edgar_concepts", "Concepts XBRL EDGAR (libellé, description, unités)",
                ["taxonomy", "concept", "label", "description", "units", "faits"], concepts, source_id)


def _yf_statements(ctx: Context, payload: dict, source_id: str) -> None:
    lines = list(dict.fromkeys(line for freq in ("annual", "quarterly")
                               for values in (payload.get(freq) or {}).values() for line in values))
    rows = [[freq, period, *(values.get(line) for line in lines)]
            for freq in ("annual", "quarterly")
            for period, values in sorted((payload.get(freq) or {}).items(), reverse=True)]
    currency = payload.get("currency") or "n.d."
    ctx.dataset("yfinance_statements", f"États financiers yfinance (devise {currency})",
                ["fréquence", "fin de période", *lines], rows, source_id)


def normalized_fundamentals(ctx: Context, fund: Any, source_id: str) -> None:
    """Every field of the normalized period and the ratios computed from it."""
    if not ctx.collect_datasets:
        return
    values = dataclasses.asdict(fund)
    for ratio in ("net_margin", "roe", "revenue_growth", "debt_to_equity", "equity_to_assets"):
        values[ratio] = getattr(fund, ratio)
    ctx.dataset("normalized_fundamentals", "Relevés normalisés et ratios", ["champ", "libellé", "valeur"],
                ([k, FUNDAMENTAL_LABELS.get(k, k), v] for k, v in values.items()), source_id)


# --- news (GDELT, yfinance) -------------------------------------------------------------------------

def gdelt_tone(ctx: Context, bins: list[dict], source_id: str) -> None:
    """Every tonechart bin and every top article GDELT listed in it."""
    ctx.dataset_records("gdelt_tone_bins", "Distribution du ton GDELT (tonechart)",
                        ({**{k: v for k, v in b.items() if k != "toparts"},
                          "articles en tête": len(b.get("toparts") or [])} for b in bins), source_id,
                        ("bin", "count", "articles en tête"))
    ctx.dataset_records("gdelt_tone_articles", "Articles GDELT en tête, par case de ton",
                        ({"bin": b.get("bin"), **a} for b in bins for a in (b.get("toparts") or [])), source_id,
                        ("bin", "title", "url"))


def gdelt_timeline(ctx: Context, tl: Any, source_id: str) -> None:
    """Every day of a GDELT coverage timeline and every top article returned with it."""
    ctx.dataset("gdelt_timeline", "Couverture GDELT quotidienne",
                ["date", "intensité (% des articles suivis)", "articles en tête"],
                ([p["date"], p["value"], len(p["articles"])] for p in tl.points), source_id)
    ctx.dataset_records("gdelt_timeline_articles", "Articles GDELT en tête, par jour",
                        ({"date": p["date"], **a} for p in tl.points for a in p["articles"]), source_id,
                        ("date", "title", "url"))


def yf_news(ctx: Context, items: list[dict], source_id: str) -> None:
    ctx.dataset_records("yfinance_news", "Actualités Yahoo Finance reçues", items, source_id,
                        ("date", "title", "publisher", "url"))


# --- score ------------------------------------------------------------------------------------------

def metric_scores(ctx: Context, metrics: dict[str, float | None], scores: dict[str, float | None],
                  peers: dict[str, list[float]] | None) -> None:
    """Each raw measure, its 0-100 score and how it was scored (fixed bounds or universe rank)."""
    def row(name: str) -> list[Any]:
        ranked = peers is not None and name in peers
        lo, hi = (None, None) if ranked else scoring.THRESHOLDS[name]
        return [name, metrics[name], scores.get(name), "rang dans l'univers" if ranked else "seuils fixes",
                lo, hi, len(peers[name]) if ranked else None]

    ctx.dataset("metric_scores", "Mesures brutes et notes 0-100",
                ["mesure", "valeur brute", "note /100", "méthode", "borne de la note 0", "borne de la note 100",
                 "pairs"], (row(m) for m in metrics), None)


def peer_prices(ctx: Context, as_of: pd.Timestamp, years: int) -> None:
    """Price measures of every universe asset, the peers of the universe ranking."""
    if not ctx.collect_datasets:
        return

    def row(ticker: str) -> list[Any]:
        pm = scoring.price_metrics(starter.adj_close(ticker), as_of, years)
        return [ticker, pm.as_of, pm.rows, *(getattr(pm, m) for m in scoring.PRICE_METRICS)]

    ctx.dataset("peers_prices", "Pairs de l'univers : mesures de prix",
                ["ticker", "date de calcul", "séances", *scoring.PRICE_METRICS],
                (row(t) for t in starter.universe()["ticker"]), starter.STARTER_SOURCE_ID)


def peer_fundamentals(ctx: Context, tickers: list[str], results: list[Any]) -> None:
    """Normalized fundamentals of every universe equity (same options), the peers of the ranking."""
    ctx.dataset("peers_fundamentals", "Pairs de l'univers : relevés normalisés",
                ["ticker", "source", "fin de période", *scoring.FUNDAMENTAL_METRICS],
                ([t, f.source if f else None, f.period_end if f else None,
                  *((getattr(f, m) if f else None) for m in scoring.FUNDAMENTAL_METRICS)]
                 for t, f in zip(tickers, results, strict=True)), "starter_universe")
