"""SEC EDGAR access: ticker->CIK mapping, XBRL companyfacts and the filings index.

Facts are selected by their filing date (`filed`), never by period end, so a value is only used
once it had actually been published.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.config import get_settings
from app.data import cache
from app.data.http import get_json

SOURCE = "SEC EDGAR"
TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
SUBMISSIONS_PAGE_URL = "https://data.sec.gov/submissions/{name}"

REVENUE_CONCEPTS = (
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "RevenuesNetOfInterestExpense",
    "SalesRevenueNet",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
)
DEBT_CONCEPTS = ("LongTermDebt", "LongTermDebtNoncurrent", "DebtLongtermAndShorttermCombinedAmount")

# Form 8-K items (SEC, « Form 8-K General Instructions »), in French.
ITEMS_8K = {
    "1.01": "accord important conclu",
    "1.02": "fin d'un accord important",
    "1.03": "faillite ou mise sous séquestre",
    "1.05": "incident de cybersécurité",
    "2.01": "acquisition ou cession d'actifs",
    "2.02": "résultats financiers",
    "2.03": "nouvelle obligation financière",
    "2.04": "événement déclencheur d'une obligation",
    "2.05": "coûts de sortie ou de restructuration",
    "2.06": "dépréciation importante",
    "3.01": "avis de radiation de la cote",
    "3.02": "vente de titres non enregistrée",
    "3.03": "modification des droits des porteurs",
    "4.01": "changement d'auditeur",
    "4.02": "états financiers antérieurs à ne plus utiliser",
    "5.01": "changement de contrôle",
    "5.02": "départ ou nomination de dirigeants",
    "5.03": "modification des statuts",
    "5.07": "vote des actionnaires",
    "5.08": "mise en candidature d'administrateurs",
    "7.01": "communication au marché (Reg FD)",
    "8.01": "autre événement important",
    "9.01": "états financiers et pièces jointes",
}


def describe_8k(items: str | None) -> str:
    """« 8-K : résultats financiers (2.02) » from the filing's items field ("2.02,9.01")."""
    codes = [c.strip() for c in (items or "").split(",") if c.strip()]
    shown = [c for c in codes if c != "9.01"] or codes
    if not shown:
        return "8-K"
    return "8-K : " + " ; ".join(f"{ITEMS_8K.get(c, 'item')} ({c})" for c in shown)


def _headers() -> dict[str, str]:
    return {"User-Agent": get_settings().sec_user_agent, "Accept-Encoding": "gzip, deflate"}


def _fetch(url: str) -> dict:
    return get_json(SOURCE, url, headers=_headers(), timeout_s=get_settings().http_timeout_s)


def cik_for(ticker: str) -> int | None:
    data, _ = cache.cached("edgar", TICKERS_URL, 7 * 86400, lambda: _fetch(TICKERS_URL))
    symbol = ticker.upper().replace(".", "-")
    for row in data.values():
        if str(row.get("ticker", "")).upper() == symbol:
            return int(row["cik_str"])
    return None


def company_facts(cik: int) -> tuple[dict, bool]:
    url = FACTS_URL.format(cik=cik)
    return cache.cached("edgar", url, 86400, lambda: _fetch(url))


@dataclass(frozen=True)
class FactValue:
    concept: str
    value: float
    end: date
    filed: date
    form: str
    accn: str


def _rows(facts: dict, concept: str) -> list[dict]:
    node = facts.get("facts", {}).get("us-gaap", {}).get(concept)
    if not node:
        return []
    units = node.get("units", {})
    return units.get("USD") or next(iter(units.values()), [])


def annual_values(facts: dict, concept: str, as_of: date) -> list[FactValue]:
    """Fiscal-year values (10-K, ~12-month duration or instant) known on `as_of`.

    One value per period end: the latest filing made on or before `as_of`.
    """
    best: dict[str, dict] = {}
    for r in _rows(facts, concept):
        if r.get("form") not in {"10-K", "10-K/A", "20-F", "40-F"} or r.get("fp") != "FY":
            continue
        if date.fromisoformat(r["filed"]) > as_of:
            continue
        if "start" in r:
            days = (date.fromisoformat(r["end"]) - date.fromisoformat(r["start"])).days
            if not 350 <= days <= 380:
                continue
        prev = best.get(r["end"])
        if prev is None or r["filed"] > prev["filed"]:
            best[r["end"]] = r
    out = [
        FactValue(concept, float(r["val"]), date.fromisoformat(r["end"]),
                  date.fromisoformat(r["filed"]), r["form"], r.get("accn", ""))
        for r in best.values()
    ]
    return sorted(out, key=lambda f: f.end)


def first_available(facts: dict, concepts: tuple[str, ...], as_of: date) -> list[FactValue]:
    """Annual series of the concept with the most recent fiscal-year end."""
    candidates = [annual_values(facts, c, as_of) for c in concepts]
    candidates = [c for c in candidates if c]
    if not candidates:
        return []
    return max(candidates, key=lambda series: series[-1].end)


def filings_between(cik: int, start: date, end: date,
                    forms: frozenset[str] = frozenset({"10-K", "10-Q", "8-K"})) -> tuple[list[dict], bool]:
    """Filings of the given forms dated within [start, end]."""
    url = SUBMISSIONS_URL.format(cik=cik)
    sub, hit = cache.cached("edgar", url, 86400, lambda: _fetch(url))
    tables = [sub.get("filings", {}).get("recent", {})]
    for page in sub.get("filings", {}).get("files", []):
        lo = date.fromisoformat(page["filingFrom"])
        hi = date.fromisoformat(page["filingTo"])
        if hi >= start and lo <= end:
            page_url = SUBMISSIONS_PAGE_URL.format(name=page["name"])
            data, _ = cache.cached("edgar", page_url, 7 * 86400, lambda u=page_url: _fetch(u))
            tables.append(data)
    out: list[dict] = []
    for t in tables:
        for form, filed, report, accn, doc, items in zip(
            t.get("form", []), t.get("filingDate", []), t.get("reportDate", []),
            t.get("accessionNumber", []), t.get("primaryDocument", []), t.get("items", []),
            strict=False,
        ):
            d = date.fromisoformat(filed)
            if form in forms and start <= d <= end:
                acc = accn.replace("-", "")
                out.append({
                    "form": form, "filed": filed, "report_date": report, "items": items,
                    "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc}/{doc}",
                })
    out.sort(key=lambda f: f["filed"])
    return out, hit
