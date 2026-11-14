"""Investable universe, fetched live: the SEC's ticker list (US) and the TMX company directory (TSX, TSXV).

Every symbol is stored in Yahoo Finance's format, so quotes and histories need no further mapping:
- SEC tickers already use Yahoo's dash for share classes (BRK-B).
- TMX symbols get Yahoo's exchange suffix (.TO for the TSX, .V for the TSX Venture) and a dash as the
  class separator: BBD.B -> BBD-B.TO, AP.UN -> AP-UN.TO, BTCQ.U -> BTCQ-U.TO.
Preferred shares, debentures, warrants, notes and rights are left out: Yahoo has little or no daily data
for them, and they are not what an investor looks for on a stock page.

The merged list is cached on disk for 24 h (so refreshed at most daily) and kept in memory. When one
source fails, the other is still served and the failure is reported in `meta()["warnings"]`.
"""

from __future__ import annotations

import re
import threading
import time
import unicodedata
from dataclasses import asdict, dataclass
from typing import Any

from app.config import get_settings
from app.data import cache, http
from app.data.cache import ExternalUnavailable

SEC_URL = "https://www.sec.gov/files/company_tickers_exchange.json"
TMX_URL = "https://www.tsx.com/json/company-directory/search/{board}/%5E*"
SEC_SOURCE = "SEC EDGAR (company_tickers_exchange.json)"
TMX_SOURCE = "TMX Group (répertoire des sociétés TSX/TSXV)"
TTL_S = 24 * 3600
TMX_BOARDS = {"tsx": ("TSX", ".TO"), "tsxv": ("TSXV", ".V")}
# Instrument kinds left out of the universe (segments of a TMX symbol after the root).
EXCLUDED_SEGMENTS = {"PR", "PF", "DB", "WT", "NT", "CV", "RT"}
# Exchanges listed first in search results when two matches rank the same.
MAJOR_EXCHANGES = {"NYSE", "Nasdaq", "TSX", "CBOE"}


@dataclass(frozen=True)
class Listing:
    symbol: str      # Yahoo Finance symbol: AAPL, BRK-B, RY.TO, BBD-B.TO, ONE.V
    name: str
    exchange: str    # Nasdaq, NYSE, OTC, CBOE, TXSE, TSX, TSXV
    country: str     # US or CA
    source: str      # sec or tmx


def tmx_to_yahoo(symbol: str, suffix: str) -> str:
    return symbol.strip().upper().replace(".", "-") + suffix


def _keep_tmx(symbol: str) -> bool:
    return not any(part in EXCLUDED_SEGMENTS for part in symbol.upper().split(".")[1:])


def _fetch_sec() -> list[dict[str, str]]:
    body = http.get_json(SEC_SOURCE, SEC_URL, headers={"User-Agent": get_settings().sec_user_agent},
                         timeout_s=20)
    fields = body.get("fields") or []
    try:
        i_name, i_ticker, i_exchange = fields.index("name"), fields.index("ticker"), fields.index("exchange")
    except ValueError as exc:
        raise ExternalUnavailable(SEC_SOURCE, "format inattendu (champs manquants)") from exc
    out = []
    for row in body.get("data") or []:
        ticker, exchange = row[i_ticker], row[i_exchange]
        if not ticker or not exchange:
            continue  # no exchange: delisted or not traded
        out.append(asdict(Listing(str(ticker).upper(), str(row[i_name]).strip(), str(exchange), "US", "sec")))
    if not out:
        raise ExternalUnavailable(SEC_SOURCE, "liste vide")
    return out


def _fetch_tmx() -> list[dict[str, str]]:
    out = []
    for board, (exchange, suffix) in TMX_BOARDS.items():
        body = http.get_json(TMX_SOURCE, TMX_URL.format(board=board),
                             headers={"User-Agent": "Mozilla/5.0 (StockLock datathon)"}, timeout_s=20)
        for company in body.get("results") or []:
            company_name = str(company.get("name") or "").strip()
            root = str(company.get("symbol") or "")
            for instrument in company.get("instruments") or []:
                symbol = str(instrument.get("symbol") or "")
                if not symbol or not _keep_tmx(symbol):
                    continue
                name = company_name if symbol == root else f"{company_name} ({instrument.get('name') or symbol})"
                out.append(asdict(Listing(tmx_to_yahoo(symbol, suffix), name, exchange, "CA", "tmx")))
    if not out:
        raise ExternalUnavailable(TMX_SOURCE, "liste vide")
    return out


_lock = threading.Lock()
_memo: dict[str, Any] = {}


def _load() -> dict[str, Any]:
    """{"listings": {symbol: Listing}, "warnings": [...], "loaded_at": epoch, "counts": {...}}."""
    with _lock:
        if _memo and time.time() - _memo["loaded_at"] < TTL_S:
            return _memo
        listings: dict[str, Listing] = {}
        warnings: list[str] = []
        counts: dict[str, int] = {}
        for source, fetch in (("sec", _fetch_sec), ("tmx", _fetch_tmx)):
            try:
                rows, _ = cache.cached("universe", source, TTL_S, fetch)
            except ExternalUnavailable as exc:
                warnings.append(f"{exc.source} indisponible : {exc.reason}")
                continue
            counts[source] = len(rows)
            for row in rows:
                listings.setdefault(row["symbol"], Listing(**row))
        if not listings:
            raise ExternalUnavailable("Univers de titres", "; ".join(warnings) or "aucune source")
        _memo.clear()
        _memo.update(listings=listings, warnings=warnings, counts=counts, loaded_at=time.time(),
                     index=[_index_entry(listing) for listing in listings.values()])
        return _memo


def reset() -> None:
    """Forget the in-memory universe (tests, forced refresh)."""
    with _lock:
        _memo.clear()


def listings() -> dict[str, Listing]:
    return _load()["listings"]


def get(symbol: str) -> Listing | None:
    return listings().get(symbol.strip().upper())


def meta() -> dict[str, Any]:
    data = _load()
    return {"count": len(data["listings"]), "by_source": data["counts"], "warnings": data["warnings"],
            "loaded_at": data["loaded_at"],
            "sources": [{"id": "sec", "title": SEC_SOURCE, "url": SEC_URL},
                        {"id": "tmx", "title": TMX_SOURCE, "url": "https://www.tsx.com/listings/listing-with-us/listed-company-directory"}]}


def _fold(text: str) -> str:
    """Upper case without accents; « Société » and « societe » compare equal."""
    return unicodedata.normalize("NFD", text).encode("ascii", "ignore").decode().upper().strip()


def _compact(text: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", _fold(text))


@dataclass(frozen=True)
class _Entry:
    listing: Listing
    symbol: str          # compact symbol: BRKB, RYTO
    base: str            # compact symbol without the Canadian exchange suffix: RY
    name: str            # folded name
    words: tuple[str, ...]
    major: bool


def _index_entry(listing: Listing) -> _Entry:
    base = listing.symbol.rsplit(".", 1)[0] if listing.country == "CA" else listing.symbol
    name = _fold(listing.name)
    return _Entry(listing, _compact(listing.symbol), _compact(base), name,
                  tuple(w for w in re.split(r"[^A-Z0-9&]+", name) if w), listing.exchange in MAJOR_EXCHANGES)


def _rank(entry: _Entry, query: str, compact: str) -> int | None:
    """0 exact symbol, 1 symbol prefix, 2 name prefix, 3 a name word starts with it, 4 name contains it."""
    if compact and compact in (entry.symbol, entry.base):
        return 0
    if compact and entry.base.startswith(compact):
        return 1
    if entry.name.startswith(query):
        return 2
    if any(word.startswith(query) for word in entry.words):
        return 3
    if len(query) >= 3 and query in entry.name:
        return 4
    return None


def search(query: str, limit: int = 20) -> dict[str, Any]:
    """Listings matching `query` on symbol or name, best matches first."""
    q = _fold(query)
    compact = _compact(query)
    if not q:
        return {"query": query, "total": 0, "results": []}
    ranked = []
    for entry in _load()["index"]:
        rank = _rank(entry, q, compact)
        if rank is not None:
            ranked.append((rank, not entry.major, len(entry.listing.symbol), entry.listing.symbol, entry.listing))
    ranked.sort(key=lambda item: item[:4])
    return {"query": query, "total": len(ranked),
            "results": [{"ticker": item[4].symbol, "name": item[4].name, "exchange": item[4].exchange,
                         "country": item[4].country} for item in ranked[:limit]]}
