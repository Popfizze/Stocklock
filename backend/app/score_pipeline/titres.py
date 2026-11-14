"""Bronze `titres_bruts` (SEC + TMX directories, Yahoo screeners) and silver `univers` (the scored set).

The universe is the SEC's and TMX's live lists (as in `app.data.universe`). Yahoo Finance screeners,
sorted by market capitalisation (stocks) or net assets (ETFs), only rank it: a screener title outside the
universe is dropped. The scored set is an explicit run parameter (`max_titles`, split US / Canada / ETF by
`ca_share` and `etf_share`), never a ticker list.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

import pandas as pd

from app.config import get_settings
from app.data import universe, yf_market
from app.score_pipeline import net
from app.score_pipeline import store as st
from app.score_pipeline.runs import RunContext, StageRecorder

US_EXCHANGES = ("NMS", "NYQ", "NGM", "NCM", "ASE")
PAGE = 250
INACTIVE_DAYS = 10
SCREENS: dict[str, dict[str, Any]] = {
    "us_actions": {"kind": "equity", "region": "us", "exchanges": US_EXCHANGES, "sort": "intradaymarketcap",
                   "asset_type": "action", "label": "actions américaines (capitalisation)"},
    "ca_actions": {"kind": "equity", "region": "ca", "exchanges": ("TOR",), "sort": "intradaymarketcap",
                   "asset_type": "action", "label": "actions de la Bourse de Toronto (capitalisation)"},
    "us_fnb": {"kind": "etf", "region": "us", "exchanges": (), "sort": "fundnetassets",
               "asset_type": "FNB", "label": "FNB américains (actif net)"},
    "ca_fnb": {"kind": "etf", "region": "ca", "exchanges": ("TOR",), "sort": "fundnetassets",
               "asset_type": "FNB", "label": "FNB de la Bourse de Toronto (actif net)"},
}
YAHOO_SCREENER_URL = "https://finance.yahoo.com/research-hub/screener/"


def quotas(max_titles: int, ca_share: float, etf_share: float) -> dict[str, int]:
    n_etf = round(max_titles * etf_share)
    n_stocks = max_titles - n_etf
    n_ca = round(n_stocks * ca_share)
    ca_fnb = n_etf // 2
    return {"us_actions": n_stocks - n_ca, "ca_actions": n_ca, "us_fnb": n_etf - ca_fnb, "ca_fnb": ca_fnb}


# --- Bronze --------------------------------------------------------------------------------------------

def _screen_page(spec: dict[str, Any], offset: int, size: int) -> dict[str, Any]:
    import yfinance as yf
    from yfinance import EquityQuery
    from yfinance.screener.query import ETFQuery

    q = ETFQuery if spec["kind"] == "etf" else EquityQuery
    parts = [q("eq", ["region", spec["region"]])]
    if spec["exchanges"]:
        parts.append(q("is-in", ["exchange", *spec["exchanges"]]))
    query = parts[0] if len(parts) == 1 else q("and", parts)
    return yf.screen(query, offset=offset, size=size, sortField=spec["sort"], sortAsc=False) or {}


def fetch_screen(spec: dict[str, Any], wanted: int) -> list[dict[str, Any]]:
    quotes: list[dict[str, Any]] = []
    while len(quotes) < wanted:
        page = _screen_page(spec, len(quotes), min(PAGE, wanted - len(quotes)))
        got = list(page.get("quotes") or [])
        quotes.extend(got)
        if len(got) == 0 or len(quotes) >= int(page.get("total") or 0):
            break
    return quotes


def bronze(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    sec_ua = {"User-Agent": get_settings().sec_user_agent, "Accept-Encoding": "gzip, deflate"}
    failures = 0
    try:
        sec = net.get(universe.SEC_SOURCE, universe.SEC_URL, headers=sec_ua, timeout_s=30)
        st.put_raw(store, rec.output(ctx.key("bronze", "titres_bruts", "sec_company_tickers_exchange.json.gz")),
                   sec.content)
        rec.rows["sec"] = len(json.loads(sec.content).get("data") or [])
        rec.source("sec_tickers", universe.SEC_SOURCE, universe.SEC_URL)
    except Exception as exc:
        failures += 1
        rec.decide("missing", f"Liste SEC indisponible ({exc}) : univers limité au Canada")
    for board in universe.TMX_BOARDS:
        try:
            resp = net.get(universe.TMX_SOURCE, universe.TMX_URL.format(board=board),
                           headers={"User-Agent": "Mozilla/5.0 (StockLock datathon)"}, timeout_s=40)
            st.put_raw(store, rec.output(ctx.key("bronze", "titres_bruts", f"tmx_{board}.json.gz")), resp.content)
            rec.rows[f"tmx_{board}"] = len(json.loads(resp.content).get("results") or [])
            rec.source("tmx", universe.TMX_SOURCE, "https://www.tsx.com/listings/listing-with-us/listed-company-directory")
        except Exception as exc:
            failures += 1
            rec.decide("missing", f"Répertoire TMX {board.upper()} indisponible ({exc})")
    if failures == 1 + len(universe.TMX_BOARDS):
        raise RuntimeError("Ni la liste SEC ni le répertoire TMX ne sont joignables : aucun univers")

    p = ctx.params
    wanted = quotas(p.max_titles, p.ca_share, p.etf_share)
    screens: dict[str, Any] = {}
    for screen_id, spec in SCREENS.items():
        size = min(1000, wanted[screen_id] * 2 + 20) if wanted[screen_id] else 0
        if not size:
            continue
        try:
            quotes = fetch_screen(spec, size)
            screens[screen_id] = {"spec": {k: v for k, v in spec.items() if k != "label"}, "quotes": quotes}
            rec.rows[f"yahoo_{screen_id}"] = len(quotes)
        except Exception as exc:
            rec.decide("missing", f"Filtre Yahoo « {spec['label']} » indisponible ({type(exc).__name__})")
    if not screens:
        raise RuntimeError("Aucun filtre Yahoo Finance n'a répondu : impossible de classer l'univers")
    rec.source("yahoo_screener", "Yahoo Finance (filtres de titres)", YAHOO_SCREENER_URL)
    st.put_json(store, rec.output(ctx.key("bronze", "titres_bruts", "yahoo_screeners.json.gz")), screens)
    rec.rows["titres_bruts"] = sum(v for k, v in rec.rows.items() if k.startswith(("sec", "tmx")))
    rec.decide("source", "Univers : liste SEC (company_tickers_exchange.json) + répertoire TMX (TSX, TSXV), "
                         "copiés bruts du jour")
    rec.decide("source", "Popularité : filtres Yahoo Finance triés par capitalisation (actions) ou actif net "
                         "(FNB), " + ", ".join(f"{k} {v}" for k, v in rec.rows.items() if k.startswith("yahoo_")))
    sample_rows = [{"filtre": sid, "symbole": q.get("symbol"), "nom": q.get("longName") or q.get("shortName"),
                    "capitalisation": q.get("marketCap"), "devise": q.get("currency")}
                   for sid, s in screens.items() for q in s["quotes"][:2]]
    rec.add_sample("titres_bruts", sample_rows)


# --- Silver --------------------------------------------------------------------------------------------

def parse_sec(body: dict[str, Any]) -> list[dict[str, Any]]:
    fields = body.get("fields") or []
    i_cik, i_name, i_ticker, i_exchange = (fields.index(f) for f in ("cik", "name", "ticker", "exchange"))
    out = []
    for row in body.get("data") or []:
        if not row[i_ticker] or not row[i_exchange]:
            continue
        out.append({"symbol": str(row[i_ticker]).upper(), "name": str(row[i_name]).strip(),
                    "exchange": str(row[i_exchange]), "country": "US", "cik": int(row[i_cik]),
                    "company_key": f"cik:{int(row[i_cik])}"})
    return out


def parse_tmx(board: str, body: dict[str, Any]) -> list[dict[str, Any]]:
    exchange, suffix = universe.TMX_BOARDS[board]
    out = []
    for company in body.get("results") or []:
        root = str(company.get("symbol") or "")
        for instrument in company.get("instruments") or []:
            symbol = str(instrument.get("symbol") or "")
            if not symbol or not universe._keep_tmx(symbol):
                continue
            out.append({"symbol": universe.tmx_to_yahoo(symbol, suffix),
                        "name": str(company.get("name") or "").strip(), "exchange": exchange, "country": "CA",
                        "cik": None, "company_key": f"tmx:{board}:{root}"})
    return out


def is_cdr(quote: dict[str, Any]) -> bool:
    names = f" {quote.get('shortName') or ''} {quote.get('longName') or ''}".upper()
    return " CDR" in names


def _active(quote: dict[str, Any], run_date: date) -> bool:
    ts = quote.get("regularMarketTime")
    if not ts or not quote.get("averageDailyVolume3Month"):
        return False
    traded = datetime.fromtimestamp(float(ts), tz=timezone.utc).date()
    return traded >= run_date - timedelta(days=INACTIVE_DAYS)


def select(universe_rows: dict[str, dict[str, Any]], screens: dict[str, Any], wanted: dict[str, int],
           run_date: date) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Titles picked in each screener's order, within its quota; returns (rows, filter counts)."""
    counts = {"hors_univers": 0, "cdr": 0, "type": 0, "inactifs": 0, "doublons_societe": 0, "deja_retenus": 0}
    chosen: list[dict[str, Any]] = []
    seen_symbols: set[str] = set()
    seen_companies: set[str] = set()
    leftovers: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
    # Share classes of one company (BRK-A / BRK-B, GOOGL / GOOG): the most traded one stands for it.
    most_traded: dict[str, tuple[float, str]] = {}
    for screen in screens.values():
        for quote in (screen or {}).get("quotes") or []:
            symbol = str(quote.get("symbol") or "").upper()
            listing = universe_rows.get(symbol)
            if listing is not None:
                volume = float(quote.get("averageDailyVolume3Month") or 0)
                if volume > most_traded.get(listing["company_key"], (-1.0, ""))[0]:
                    most_traded[listing["company_key"]] = (volume, symbol)
    for screen_id in SCREENS:
        quotes = (screens.get(screen_id) or {}).get("quotes") or []
        taken = 0
        for quote in quotes:
            symbol = str(quote.get("symbol") or "").upper()
            listing = universe_rows.get(symbol)
            if listing is None:
                counts["hors_univers"] += 1
                continue
            if most_traded[listing["company_key"]][1] != symbol:
                counts["doublons_societe"] += 1
                continue
            if is_cdr(quote):
                counts["cdr"] += 1
                continue
            if quote.get("quoteType") not in {"EQUITY", "ETF"}:
                counts["type"] += 1
                continue
            if not _active(quote, run_date):
                counts["inactifs"] += 1
                continue
            if symbol in seen_symbols:
                counts["deja_retenus"] += 1
                continue
            if listing["company_key"] in seen_companies:
                counts["doublons_societe"] += 1
                continue
            if taken >= wanted.get(screen_id, 0):
                if SCREENS[screen_id]["asset_type"] == "action":
                    leftovers.append((screen_id, quote, listing))
                continue
            chosen.append(_row(screen_id, quote, listing, len(chosen) + 1))
            seen_symbols.add(symbol)
            seen_companies.add(listing["company_key"])
            taken += 1
    missing = sum(wanted.values()) - len(chosen)
    for screen_id, quote, listing in leftovers:
        if missing <= 0:
            break
        symbol = str(quote["symbol"]).upper()
        if symbol in seen_symbols or listing["company_key"] in seen_companies:
            continue
        chosen.append(_row(screen_id, quote, listing, len(chosen) + 1))
        seen_symbols.add(symbol)
        seen_companies.add(listing["company_key"])
        missing -= 1
    return chosen, counts


def _row(screen_id: str, quote: dict[str, Any], listing: dict[str, Any], rank: int) -> dict[str, Any]:
    asset_type = "FNB" if quote.get("quoteType") == "ETF" else "action"
    return {
        "symbol": listing["symbol"], "name": quote.get("longName") or quote.get("shortName") or listing["name"],
        "listing_name": listing["name"], "exchange": listing["exchange"], "country": listing["country"],
        "currency": quote.get("currency"), "financial_currency": quote.get("financialCurrency"),
        "asset_type": asset_type, "sector": None, "industry": None, "cik": listing["cik"],
        "market_cap": quote.get("marketCap") or quote.get("netAssets"),
        "avg_volume_3m": quote.get("averageDailyVolume3Month"),
        "shares_outstanding": quote.get("sharesOutstanding"), "price": quote.get("regularMarketPrice"),
        "bucket": screen_id, "popularity_rank": rank,
    }


def silver(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    rows: dict[str, dict[str, Any]] = {}
    sec_key = ctx.key("bronze", "titres_bruts", "sec_company_tickers_exchange.json.gz")
    try:
        sec = parse_sec(st.get_json(store, sec_key))
        rows.update((r["symbol"], r) for r in sec)
        rec.rows["sec"] = len(sec)
    except st.NotFound:
        rec.decide("missing", "Pas de liste SEC ce jour : titres américains absents")
    duplicates = 0
    for board in universe.TMX_BOARDS:
        try:
            tmx = parse_tmx(board, st.get_json(store, ctx.key("bronze", "titres_bruts", f"tmx_{board}.json.gz")))
        except st.NotFound:
            continue
        rec.rows[f"tmx_{board}"] = len(tmx)
        for r in tmx:
            if r["symbol"] in rows:
                duplicates += 1
                continue
            rows[r["symbol"]] = r
    rec.rows["univers_complet"] = len(rows)
    rec.decide("filter", "Titres en double entre les listes SEC et TMX retirés", duplicates)
    rec.decide("filter", "Actions privilégiées, débentures, bons de souscription, billets et droits exclus "
                         "du répertoire TMX (règle de app.data.universe)")
    screens = st.get_json(store, ctx.key("bronze", "titres_bruts", "yahoo_screeners.json.gz"))
    p = ctx.params
    wanted = quotas(p.max_titles, p.ca_share, p.etf_share)
    chosen, counts = select(rows, screens, wanted, date.fromisoformat(ctx.date))
    rec.decide("parameter", f"Titres notés : max_titles = {p.max_titles} ; répartition visée "
                            + ", ".join(f"{SCREENS[k]['label']} {v}" for k, v in wanted.items()), p.max_titles)
    labels = {"hors_univers": "Titres des filtres Yahoo absents de l'univers SEC/TMX écartés",
              "cdr": "Certificats de dépôt canadiens (CDR) écartés",
              "type": "Instruments qui ne sont ni des actions ni des FNB écartés",
              "inactifs": f"Titres inactifs écartés (aucune séance depuis {INACTIVE_DAYS} jours ou volume nul)",
              "doublons_societe": "Autres catégories d'actions d'une même société écartées (la plus échangée gardée)",
              "deja_retenus": "Titres présents dans deux filtres comptés une fois"}
    for key, label in labels.items():
        rec.decide("filter", label, counts[key])
    if len(chosen) < p.max_titles:
        rec.decide("missing", f"Seulement {len(chosen)} titres retenus sur {p.max_titles} demandés", len(chosen))

    stocks = [r for r in chosen if r["asset_type"] == "action"]
    results = net.parallel(stocks, lambda r: yf_market.profile(r["symbol"]), workers=6, deadline=deadline)
    no_sector = 0
    for row, profile, _err in results:
        row["sector"] = (profile or {}).get("sector") or None
        row["industry"] = (profile or {}).get("industry") or None
        if not row["sector"]:
            no_sector += 1
            row["sector"] = "Non classé"
    for row in chosen:
        if row["asset_type"] == "FNB":
            row["sector"] = "FNB"
    rec.decide("source", "Secteur : profil Yahoo Finance (assetProfile) ; FNB regroupés à part")
    rec.decide("missing", "Actions sans secteur publié, classées « Non classé »", no_sector)
    rec.source("yahoo_profile", "Yahoo Finance (profil de société)", "https://finance.yahoo.com/")

    frame = pd.DataFrame(chosen)
    st.put_csv(store, rec.output(ctx.key("silver", "univers", "univers.csv")), frame)
    rec.rows["univers"] = len(frame)
    for asset_type, n in frame["asset_type"].value_counts().items() if len(frame) else []:
        rec.rows[f"univers_{asset_type}"] = int(n)
    rec.add_sample("univers", frame[["symbol", "name", "exchange", "currency", "asset_type", "sector",
                                     "market_cap"]] if len(frame) else frame)
