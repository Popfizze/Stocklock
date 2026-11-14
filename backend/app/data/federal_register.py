"""Federal Register API (no key): U.S. presidential documents — executive orders, proclamations, memoranda.

Each document is dated on its signing date (publication in the Register comes days later). Only the
documents whose title touches trade, tariffs or sanctions (`GENERAL_TERMS`), or the title's own industry
(`SECTOR_TERMS`), are kept: appointments, commemorations and yearly renewals of emergencies are left out.
"""

from __future__ import annotations

import re
from datetime import date

from app.config import get_settings
from app.data import cache, http

SOURCE = "Federal Register"
API_URL = "https://www.federalregister.gov/api/v1/documents.json"
SEARCH_URL = "https://www.federalregister.gov/presidential-documents"
FIELDS = ("title", "signing_date", "publication_date", "html_url", "raw_text_url", "subtype",
          "executive_order_number", "document_number")
MAX_PAGES = 5

# Trade measures that reach every listed company: kept for any title.
GENERAL_TERMS = re.compile(
    r"\b(tariffs?|duties|reciprocal|imports?|exports?|sanctions?|taxes|taxation|"
    r"trade (?:policy|agreements?|deals?|practices|deficits?|act|negotiations?))\b", re.IGNORECASE)
# Measures aimed at one industry: kept only for a title of that sector (sector or asset class, lower case).
SECTOR_TERMS: tuple[tuple[re.Pattern[str], tuple[str, ...]], ...] = (
    (re.compile(r"\b(semiconductors?|chips?|artificial intelligence)\b", re.I), ("technology", "communication")),
    (re.compile(r"\b(critical minerals?|steel|aluminum|copper|lumber|timber)\b", re.I), ("materials", "industrials")),
    (re.compile(r"\b(automobiles?|vehicles?|auto parts)\b", re.I),
     ("consumer discretionary", "consumer cyclical", "industrials")),
    (re.compile(r"\b(pharmaceuticals?|drug pric\w*|prescription drugs?)\b", re.I), ("health",)),
    (re.compile(r"\b(oil|energy|nuclear)\b", re.I), ("energy", "utilities")),
    (re.compile(r"\b(banking|banks?)\b", re.I), ("financ",)),
    (re.compile(r"\b(crypto\w*|digital assets?)\b", re.I), ("crypto",)),
)
# Commemorations (« World Trade Week, 2025 ») and yearly renewals of standing emergencies are routine.
ROUTINE = re.compile(r",\s*\d{4}$|^continuation of the national emergency", re.IGNORECASE)
TERMS_LABEL = ("pour tout titre : tarifs, droits, importations et exportations, sanctions, impôts, politique "
               "commerciale ; selon le secteur : semi-conducteurs et IA (technologie), minéraux, acier, aluminium, "
               "cuivre et bois (matériaux, industrie), automobiles, médicaments (santé), pétrole et énergie, "
               "banques, cryptoactifs ; commémorations et renouvellements d'urgences écartés")

SUBTYPES = {"Executive Order": "Décret", "Proclamation": "Proclamation", "Memorandum": "Mémorandum",
            "Notice": "Avis", "Determination": "Détermination", "Presidential Order": "Ordonnance"}


def presidential_documents(start: date, end: date) -> tuple[list[dict], bool]:
    """Every presidential document signed in [start, end]; cached one day."""
    params = [("conditions[type][]", "PRESDOCU"), ("conditions[signing_date][gte]", start.isoformat()),
              ("conditions[signing_date][lte]", end.isoformat()), ("per_page", "1000"), ("order", "oldest"),
              *(("fields[]", f) for f in FIELDS)]
    headers = {"User-Agent": "StockLock-datathon (projet etudiant)", "Accept": "application/json"}

    def _fetch() -> list[dict]:
        out: list[dict] = []
        url: str | None = API_URL
        query: list[tuple[str, str]] | None = params
        for _ in range(MAX_PAGES):
            data = http.get_json(SOURCE, url, headers=headers, timeout_s=get_settings().http_timeout_s,
                                 params=query)  # type: ignore[arg-type]
            out += data.get("results") or []
            url, query = data.get("next_page_url"), None  # the next page URL carries every condition
            if not url:
                break
        return out

    return cache.cached("federal_register", f"presdocu|{start}|{end}", 86400, _fetch)


def concerns(title: str, sector: str) -> bool:
    """Whether a presidential document can matter for a title of `sector` (sector and asset class)."""
    if not title or ROUTINE.search(title.strip()):
        return False
    sector = sector.lower()
    aimed = [targets for pattern, targets in SECTOR_TERMS if pattern.search(title)]
    if aimed:
        return any(t in sector for targets in aimed for t in targets)
    return bool(GENERAL_TERMS.search(title))


def policy_documents(start: date, end: date, sector: str) -> tuple[list[dict], int, bool]:
    """(documents that can matter for a title of `sector`, every document's count, from cache)."""
    docs, hit = presidential_documents(start, end)
    kept = [d for d in docs if d.get("signing_date") and concerns(d.get("title") or "", sector)]
    return kept, len(docs), hit


def label(doc: dict) -> str:
    """« Décret 14257 : Regulating Imports With a Reciprocal Tariff … »"""
    kind = SUBTYPES.get(doc.get("subtype") or "", doc.get("subtype") or "Document présidentiel")
    number = f" {doc['executive_order_number']}" if doc.get("executive_order_number") else ""
    return f"{kind}{number} de la présidence américaine : {doc['title']}"
