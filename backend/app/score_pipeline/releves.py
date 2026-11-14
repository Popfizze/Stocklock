"""Bronze `releves_bruts` (SEC EDGAR companyfacts, Yahoo Finance statements) and silver `releves_normalises`.

Silver has one row per quarter (`period_type` Q) and per fiscal year (FY), dated at its publication:
EDGAR's filing date of the first filing that reported the period, or for Yahoo (no filing dates) the
period end plus the Canadian filing deadline (45 days for a quarter, 90 for a year, NI 51-102).
"""

from __future__ import annotations

import json
import math
from datetime import date, timedelta
from typing import Any

import pandas as pd

from app.config import get_settings
from app.data import edgar, yf_fundamentals
from app.score_pipeline import net
from app.score_pipeline import store as st
from app.score_pipeline.runs import RunContext, StageRecorder

SEC_LIMITER = net.RateLimiter(8)  # SEC fair access: at most 10 requests per second
QUARTERS_KEPT = 20
YEARS_KEPT = 6
EDGAR_FORMS = {"10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"}
FIELDS = ("revenue", "net_income", "eps", "equity", "total_debt", "operating_income", "interest_expense")
FLOW_CONCEPTS: dict[str, tuple[str, ...]] = {
    "revenue": edgar.REVENUE_CONCEPTS,
    "net_income": ("NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"),
    "eps": ("EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "EarningsPerShareBasic"),
    "operating_income": ("OperatingIncomeLoss",),
    "interest_expense": ("InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt",
                         "InterestAndDebtExpense"),
}
EQUITY_CONCEPTS = ("StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest")
YAHOO_LINES: dict[str, tuple[str, ...]] = {
    "revenue": ("Total Revenue", "Operating Revenue"),
    "net_income": ("Net Income", "Net Income Common Stockholders",
                   "Net Income From Continuing Operation Net Minority Interest"),
    "eps": ("Diluted EPS", "Basic EPS"),
    "operating_income": ("Operating Income", "EBIT"),
    "interest_expense": ("Interest Expense", "Interest Expense Non Operating"),
    "equity": ("Stockholders Equity", "Common Stock Equity", "Total Equity Gross Minority Interest"),
    "total_debt": ("Total Debt",),
}
COLUMNS = ["symbol", "source", "period_type", "period_start", "period_end", "published", *FIELDS, "currency"]


# --- Bronze --------------------------------------------------------------------------------------------

def _has_gaap_income(facts: dict[str, Any]) -> bool:
    gaap = facts.get("facts", {}).get("us-gaap", {})
    return any(c in gaap for c in FLOW_CONCEPTS["net_income"])


def fetch_edgar(cik: int) -> bytes:
    headers = {"User-Agent": get_settings().sec_user_agent, "Accept-Encoding": "gzip, deflate"}
    return net.get(edgar.SOURCE, edgar.FACTS_URL.format(cik=cik), headers=headers, timeout_s=40,
                   limiter=SEC_LIMITER).content


def _frame(frame: Any) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    if frame is None or getattr(frame, "empty", True):
        return out
    for col in frame.columns:
        period = col.date().isoformat() if hasattr(col, "date") else str(col)[:10]
        for line, val in frame[col].items():
            if val == val and val is not None:
                out.setdefault(period, {})[str(line)] = float(val)
    return out


def fetch_yahoo(symbol: str) -> dict[str, Any]:
    import yfinance as yf

    t = yf.Ticker(symbol)
    payload = {"quarterly": {"income": _frame(t.quarterly_income_stmt), "balance": _frame(t.quarterly_balance_sheet)},
               "annual": {"income": _frame(t.income_stmt), "balance": _frame(t.balance_sheet)}}
    if not payload["quarterly"]["income"] and not payload["annual"]["income"]:
        raise LookupError(f"aucun état financier renvoyé pour {symbol}")
    return payload


def _int(value: Any) -> int | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return int(out) if math.isfinite(out) else None


def bronze(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    univ = st.get_csv(store, ctx.key("silver", "univers", "univers.csv"))
    stocks = univ[univ["asset_type"] == "action"]
    rec.decide("filter", "FNB : pas de relevés financiers, non téléchargés", int((univ["asset_type"] != "action").sum()))
    manifest: dict[str, dict[str, Any]] = {}
    edgar_jobs = [(r.symbol, _int(r.cik), r.financial_currency) for r in stocks.itertuples() if _int(r.cik)]
    yahoo_jobs = [(r.symbol, r.financial_currency) for r in stocks.itertuples() if not _int(r.cik)]

    def do_edgar(job: tuple[str, int, Any]) -> str:
        symbol, cik, _cur = job
        raw = fetch_edgar(cik)
        if not _has_gaap_income(json.loads(raw)):
            return "no_gaap"
        key = ctx.key("bronze", "releves_bruts", f"edgar/{symbol}.json.gz")
        st.put_raw(store, key, raw)
        manifest[symbol] = {"source": "edgar", "key": key, "cik": cik, "url": edgar.FACTS_URL.format(cik=cik)}
        return "ok"

    fallback = 0
    for (symbol, cik, cur), status, err in net.parallel(edgar_jobs, do_edgar, workers=6, deadline=deadline):
        if status != "ok":
            fallback += 1
            yahoo_jobs.append((symbol, cur))
            manifest[symbol] = {"source": None, "edgar_status": status if err is None else str(err)}
    rec.decide("source", "États-Unis : SEC EDGAR companyfacts (XBRL us-gaap), 8 requêtes/s au plus",
               len(edgar_jobs))
    rec.decide("fallback", "EDGAR sans faits us-gaap exploitables (IFRS) ou indisponible : repli sur Yahoo Finance",
               fallback)

    def do_yahoo(job: tuple[str, Any]) -> str:
        symbol, currency = job
        payload = fetch_yahoo(symbol)
        payload["currency"] = currency if isinstance(currency, str) else None
        key = ctx.key("bronze", "releves_bruts", f"yahoo/{symbol}.json.gz")
        st.put_json(store, key, payload)
        manifest[symbol] = {**manifest.get(symbol, {}), "source": "yahoo", "key": key,
                            "url": f"https://finance.yahoo.com/quote/{symbol}/financials"}
        return "ok"

    failed = 0
    for (symbol, _cur), _status, err in net.parallel(yahoo_jobs, do_yahoo, workers=4, deadline=deadline):
        if err is not None:
            failed += 1
            manifest[symbol] = {**manifest.get(symbol, {}), "source": None, "error": f"{type(err).__name__}: {err}"}
    rec.decide("source", "Canada (et repli) : états financiers Yahoo Finance (yfinance), trimestriels et annuels",
               len(yahoo_jobs))
    rec.decide("missing", "Titres sans relevés (aucune source n'a répondu) : sous-scores fondamentaux manquants",
               failed)
    st.put_json(store, rec.output(ctx.key("bronze", "releves_bruts", "manifest.json")), manifest)
    rec.outputs.append(st.ROOT_PREFIX + ctx.key("bronze", "releves_bruts", "edgar/") + "*.json.gz")
    rec.outputs.append(st.ROOT_PREFIX + ctx.key("bronze", "releves_bruts", "yahoo/") + "*.json.gz")
    rec.rows["releves_bruts"] = sum(1 for m in manifest.values() if m.get("source"))
    rec.rows["edgar"] = sum(1 for m in manifest.values() if m.get("source") == "edgar")
    rec.rows["yahoo"] = sum(1 for m in manifest.values() if m.get("source") == "yahoo")
    rec.source("sec_edgar", "SEC EDGAR companyfacts (XBRL)", "https://www.sec.gov/edgar/sec-api-documentation")
    rec.source("yahoo_financials", yf_fundamentals.SOURCE, "https://finance.yahoo.com/")
    rec.add_sample("releves_bruts", [{"symbole": s, "source": m.get("source"), "fichier": m.get("key")}
                                     for s, m in sorted(manifest.items())])


# --- Silver: EDGAR -------------------------------------------------------------------------------------

def _d(s: str) -> date:
    return date.fromisoformat(s)


def _unit_rows(gaap: dict[str, Any], concept: str) -> tuple[list[dict[str, Any]], str | None]:
    node = gaap.get(concept)
    if not node:
        return [], None
    units = node.get("units", {})
    for unit in ("USD", "USD/shares"):
        if unit in units:
            return units[unit], "USD"
    if not units:
        return [], None
    unit, rows = next(iter(units.items()))
    return rows, unit.split("/")[0]


def _first_published(rows: list[dict[str, Any]], with_start: bool) -> dict[tuple, dict[str, Any]]:
    """One fact per period, from the earliest filing that reported it."""
    best: dict[tuple, dict[str, Any]] = {}
    for r in rows:
        if r.get("form") not in EDGAR_FORMS or ("start" in r) != with_start or "filed" not in r:
            continue
        key = (r.get("start"), r["end"])
        if key not in best or r["filed"] < best[key]["filed"]:
            best[key] = r
    return best


def flow_series(rows: list[dict[str, Any]]) -> tuple[dict[date, tuple[float, str, date]],
                                                      dict[date, tuple[float, str, date]]]:
    """({quarter end: (value, filed, start)}, {fiscal year end: (value, filed, start)}); Q4 = FY − 9 months."""
    periods = _first_published(rows, with_start=True)
    quarters: dict[date, tuple[float, str, date]] = {}
    annual: dict[date, tuple[float, str, date]] = {}
    nine: dict[date, tuple[float, str, date]] = {}
    for (start, end), r in periods.items():
        days = (_d(end) - _d(start)).days
        entry = (float(r["val"]), r["filed"], _d(start))
        if 80 <= days <= 100:
            prev = quarters.get(_d(end))
            if prev is None or abs(days - 91) < abs((_d(end) - prev[2]).days - 91):
                quarters[_d(end)] = entry
        elif 350 <= days <= 380:
            annual[_d(end)] = entry
        elif 250 <= days <= 290:
            nine[_d(end)] = entry
    for end, (val, filed, start) in annual.items():
        if end in quarters:
            continue
        q3_end = next((e for e, (_v, _f, s) in nine.items() if abs((s - start).days) <= 7 and e < end), None)
        if q3_end is not None:
            quarters[end] = (val - nine[q3_end][0], filed, q3_end + timedelta(days=1))
            continue
        inside = [q for q, (_v, _f, s) in quarters.items() if s >= start - timedelta(days=7) and q < end]
        if len(inside) == 3:
            quarters[end] = (val - sum(quarters[q][0] for q in inside), filed, max(inside) + timedelta(days=1))
    return quarters, annual


def instant_series(rows: list[dict[str, Any]]) -> dict[date, float]:
    return {_d(end): float(r["val"]) for (_s, end), r in _first_published(rows, with_start=False).items()}


def _merged_flow(gaap: dict[str, Any], concepts: tuple[str, ...]) -> tuple[dict, dict, str | None]:
    """Quarterly and annual series merged over concepts, the most recently reported concept first."""
    series = []
    for concept in concepts:
        rows, unit = _unit_rows(gaap, concept)
        if rows:
            q, a = flow_series(rows)
            latest = max([*q, *a], default=date.min)
            series.append((latest, q, a, unit))
    series.sort(key=lambda s: s[0], reverse=True)
    quarters: dict = {}
    annual: dict = {}
    for _latest, q, a, _unit in series:
        for k, v in q.items():
            quarters.setdefault(k, v)
        for k, v in a.items():
            annual.setdefault(k, v)
    return quarters, annual, (series[0][3] if series else None)


def _at(series: dict[date, float], end: date, tolerance: int = 5) -> float | None:
    if end in series:
        return series[end]
    near = [d for d in series if abs((d - end).days) <= tolerance]
    return series[min(near, key=lambda d: abs((d - end).days))] if near else None


def _debt_series(gaap: dict[str, Any]) -> dict[date, float]:
    def inst(concept: str) -> dict[date, float]:
        return instant_series(_unit_rows(gaap, concept)[0])

    combined = inst("DebtLongtermAndShorttermCombinedAmount")
    long_term = inst("LongTermDebt") or inst("LongTermDebtAndCapitalLeaseObligations")
    noncurrent, current = inst("LongTermDebtNoncurrent"), inst("LongTermDebtCurrent")
    short = inst("ShortTermBorrowings") or inst("CommercialPaper")
    out: dict[date, float] = {}
    for end in {*combined, *long_term, *noncurrent, *short}:
        if end in combined:
            out[end] = combined[end]
            continue
        lt = long_term.get(end)
        if lt is None and end in noncurrent:
            lt = noncurrent[end] + current.get(end, 0.0)
        if lt is None and end not in short:
            continue
        out[end] = (lt or 0.0) + short.get(end, 0.0)
    return out


def edgar_rows(symbol: str, facts: dict[str, Any]) -> list[dict[str, Any]]:
    gaap = facts.get("facts", {}).get("us-gaap", {})
    flows = {f: _merged_flow(gaap, c) for f, c in FLOW_CONCEPTS.items()}
    currency = flows["net_income"][2] or "USD"
    equity: dict[date, float] = {}
    for concept in EQUITY_CONCEPTS:
        for k, v in instant_series(_unit_rows(gaap, concept)[0]).items():
            equity.setdefault(k, v)
    debt = _debt_series(gaap)
    out: list[dict[str, Any]] = []
    for kind, idx, keep in (("Q", 0, QUARTERS_KEPT), ("FY", 1, YEARS_KEPT)):
        anchor = flows["net_income"][idx] or flows["revenue"][idx]
        for end in sorted(anchor)[-keep:]:
            _val, filed, start = anchor[end]
            row = {"symbol": symbol, "source": "SEC EDGAR", "period_type": kind,
                   "period_start": start.isoformat(), "period_end": end.isoformat(), "published": filed,
                   "currency": currency}
            for field in FLOW_CONCEPTS:
                entry = flows[field][idx].get(end)
                row[field] = entry[0] if entry else None
            row["equity"] = _at(equity, end)
            row["total_debt"] = _at(debt, end)
            out.append(row)
    return out


# --- Silver: Yahoo -------------------------------------------------------------------------------------

def _line(values: dict[str, float], field: str) -> float | None:
    for line in YAHOO_LINES[field]:
        if line in values:
            return values[line]
    return None


def yahoo_rows(symbol: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for kind, part, lag in (("Q", "quarterly", yf_fundamentals.QUARTERLY_LAG_DAYS),
                            ("FY", "annual", yf_fundamentals.ANNUAL_LAG_DAYS)):
        income = payload.get(part, {}).get("income", {})
        balance = payload.get(part, {}).get("balance", {})
        for end in sorted({*income, *balance}):
            values = {**balance.get(end, {}), **income.get(end, {})}
            if _line(values, "net_income") is None and _line(values, "revenue") is None:
                continue
            period_end = date.fromisoformat(end)
            row = {"symbol": symbol, "source": "Yahoo Finance", "period_type": kind,
                   "period_start": None, "period_end": end,
                   "published": (period_end + timedelta(days=lag)).isoformat(),
                   "currency": payload.get("currency") or None}
            for field in FIELDS:
                row[field] = _line(values, field)
            out.append(row)
    return out


def silver(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    manifest = st.get_json(store, ctx.key("bronze", "releves_bruts", "manifest.json"))
    rows: list[dict[str, Any]] = []
    empty = 0
    by_source = {"edgar": 0, "yahoo": 0}
    for symbol, entry in sorted(manifest.items()):
        if not entry.get("source"):
            continue
        payload = st.get_json(store, entry["key"])
        parsed = edgar_rows(symbol, payload) if entry["source"] == "edgar" else yahoo_rows(symbol, payload)
        if not parsed:
            empty += 1
            continue
        by_source[entry["source"]] += 1
        rows.extend(parsed)
    frame = pd.DataFrame(rows, columns=COLUMNS)
    st.put_csv(store, rec.output(ctx.key("silver", "releves_normalises", "releves_normalises.csv")), frame)
    rec.rows["releves_normalises"] = len(frame)
    rec.rows["titres"] = int(frame["symbol"].nunique()) if len(frame) else 0
    rec.rows["trimestres"] = int((frame["period_type"] == "Q").sum()) if len(frame) else 0
    rec.decide("info", f"EDGAR : trimestres pris dans la première publication (10-Q/10-K) ; T4 = exercice − 9 mois ; "
                       f"{QUARTERS_KEPT} derniers trimestres et {YEARS_KEPT} derniers exercices gardés",
               by_source["edgar"])
    rec.decide("info", "Yahoo Finance : date de publication estimée = fin de période + 45 jours (trimestre) "
                       "ou + 90 jours (exercice), délais du Règlement 51-102", by_source["yahoo"])
    rec.decide("missing", "Relevés téléchargés mais sans ligne exploitable (ni résultat net ni chiffre d'affaires)",
               empty)
    if len(frame):
        missing = {f: int(frame[f].isna().sum()) for f in FIELDS}
        for field, n in missing.items():
            if n:
                rec.decide("missing", f"Lignes sans {field} (indicateur concerné non calculé)", n)
        latest = frame.sort_values("period_end").groupby("symbol").tail(1)
        rec.add_sample("releves_normalises", latest[["symbol", "period_type", "period_end", "published", "revenue",
                                                     "net_income", "eps", "equity", "total_debt"]])
