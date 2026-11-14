"""What Yahoo's screener knows about listed companies, fetched for many symbols at once: sector, ESG
risk band and highest controversy level.

Yahoo no longer serves ESG scores in quoteSummary for most symbols (observed in November 2026: the
`esgScores` module is missing or the request is a 404), but its equity screener still filters on
`esg_score` (Sustainalytics ESG risk, lower is better) and `highest_controversy` (0 to 5). A screener
row does not carry those values, so each one is found by asking which of the symbols fall in each band:
- one query lists the symbols the equity screener knows (ETFs, cryptos and many small caps are not);
- one query per Yahoo sector (11) gives each symbol's sector;
- one query per 5-point ESG risk band (11) and one per controversy level (6).
That is 29 small queries (about 0.1 s each) for up to 100 symbols, run in parallel; each symbol's facts
are cached 7 days. `esg_detail` reads quoteSummary's `esgScores` for one symbol, when Yahoo still has it.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.data import cache, yf_market
from app.data.cache import ExternalUnavailable

TTL_S = 7 * 86400
BATCH = 100
WORKERS = 6
# Yahoo's sectors (the screener's `sector` values).
SECTORS = ("Basic Materials", "Communication Services", "Consumer Cyclical", "Consumer Defensive", "Energy",
           "Financial Services", "Healthcare", "Industrials", "Real Estate", "Technology", "Utilities")
ESG_BANDS: tuple[tuple[int, int | None], ...] = tuple((lo, lo + 5) for lo in range(0, 50, 5)) + ((50, None),)
CONTROVERSY_LEVELS = tuple(range(6))
# quoteSummary `esgScores` product-involvement flags, in French.
INVOLVEMENT_LABELS = {
    "adult": "Divertissement pour adultes", "alcoholic": "Alcool", "animalTesting": "Tests sur les animaux",
    "coal": "Charbon", "controversialWeapons": "Armes controversées", "furLeather": "Fourrure et cuir",
    "gambling": "Jeux de hasard", "gmo": "OGM", "militaryContract": "Contrats militaires",
    "nuclear": "Nucléaire", "palmOil": "Huile de palme", "pesticides": "Pesticides",
    "smallArms": "Armes légères", "tobacco": "Tabac",
}


def _cond(operator: str, *operands: Any) -> dict[str, Any]:
    return {"operator": operator, "operands": list(operands)}


def _tickers(symbols: list[str]) -> dict[str, Any]:
    conditions = [_cond("eq", "ticker", s) for s in symbols]
    return conditions[0] if len(conditions) == 1 else _cond("or", *conditions)


def _symbols_of(query: dict[str, Any], size: int) -> set[str]:
    return {str(row.get("symbol") or "").upper() for row in yf_market.screen_raw(query, max(1, size))}


def _band_condition(lo: int, hi: int | None) -> dict[str, Any]:
    low = _cond("gte", "esg_score", lo)
    return low if hi is None else _cond("and", low, _cond("lt", "esg_score", hi))


def _fetch_batch(batch: list[str]) -> dict[str, Any]:
    """Facts of up to 100 symbols; raises ExternalUnavailable if any query fails (nothing half-known is cached)."""
    known = _symbols_of(_tickers(batch), len(batch))
    facts: dict[str, dict[str, Any]] = {
        s: {"listed": s in known, "sector": None, "esg_low": None, "esg_high": None, "controversy": None}
        for s in batch}
    if not known:
        return facts
    scope = _tickers(sorted(known))
    tasks: list[tuple[str, Any, dict[str, Any]]] = (
        [("sector", sector, _cond("eq", "sector", sector)) for sector in SECTORS]
        + [("esg", band, _band_condition(*band)) for band in ESG_BANDS]
        + [("controversy", level, _cond("eq", "highest_controversy", level)) for level in CONTROVERSY_LEVELS])

    def run(task: tuple[str, Any, dict[str, Any]]) -> tuple[str, Any, set[str]]:
        kind, value, condition = task
        return kind, value, _symbols_of(_cond("and", scope, condition), len(known))

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(run, tasks))
    for kind, value, symbols in results:
        for symbol in symbols & known:
            row = facts[symbol]
            if kind == "sector":
                row["sector"] = value
            elif kind == "esg":
                row["esg_low"], row["esg_high"] = value
            else:
                row["controversy"] = value
    return facts


def facts(symbols: list[str] | tuple[str, ...]) -> dict[str, dict[str, Any]]:
    """{symbol: {"listed", "sector", "esg_low", "esg_high", "controversy"}}; `listed` False when the equity
    screener does not know the symbol (ETF, crypto, small cap). Raises ExternalUnavailable when Yahoo is down."""
    return yf_market._per_symbol("yahoo-facts", TTL_S, symbols, BATCH, _fetch_batch)


def esg_detail(symbol: str) -> dict[str, Any] | None:
    """Exact ESG figures from quoteSummary `esgScores`, or None when Yahoo has none (the usual case)."""
    def _fetch() -> dict[str, Any]:
        status, body = yf_market._get(yf_market.PROFILE_URL.format(symbol=symbol), {"modules": "esgScores"})
        if status >= 400 and status != 404:
            raise ExternalUnavailable(yf_market.SOURCE, f"données ESG indisponibles (HTTP {status})")
        result = (((body or {}).get("quoteSummary") or {}).get("result") or [{}])[0] or {}
        esg = result.get("esgScores") or {}

        def raw(key: str) -> float | None:
            value = esg.get(key)
            return yf_market._num(value.get("raw") if isinstance(value, dict) else value)

        total = raw("totalEsg")
        if total is None:
            return {"found": False}
        return {"found": True, "total_esg": total, "controversy": raw("highestControversy"),
                "involvement": [label for key, label in INVOLVEMENT_LABELS.items() if esg.get(key) is True]}

    try:
        value, _ = cache.cached("yahoo-esg", symbol, TTL_S, _fetch)
    except ExternalUnavailable:
        return None
    return value if value.get("found") else None
