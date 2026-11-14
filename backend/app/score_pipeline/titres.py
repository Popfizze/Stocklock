"""Bronze `titres_bruts` (SEC + TMX directories, Yahoo quotes) and silver `univers` (the scored set).

The universe is the SEC's and TMX's live lists (as in `app.data.universe`). The run's group (groups.py)
says which of its titles are scored:
- auto: Yahoo screeners sorted by market capitalisation (stocks) or net assets (ETFs) rank the universe,
  `max_titles` split US / Canada / ETF by `ca_share` and `etf_share`;
- sector: the same stock screeners restricted to one Yahoo sector;
- section: a dashboard section's live screener (or the best scores of the latest gold table);
- tickers: the requested symbols, with their live Yahoo quotes.
A title outside the universe is never scored; a requested one is reported as unknown.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

import pandas as pd

from app.config import get_settings
from app.data import universe, yf_market
from app.score_pipeline import groups, net
from app.score_pipeline import store as st
from app.score_pipeline.runs import GOLD_LATEST_KEY, RunContext, StageRecorder
from app.services import sections

US_EXCHANGES = ("NMS", "NYQ", "NGM", "NCM", "ASE")
PAGE = 250
QUOTE_BATCH = 50
INACTIVE_DAYS = 10
SCREENS: dict[str, dict[str, Any]] = {
    "us_actions": {"kind": "equity", "region": "us", "exchanges": US_EXCHANGES, "sort": "intradaymarketcap",
                   "label": "actions américaines (capitalisation)"},
    "ca_actions": {"kind": "equity", "region": "ca", "exchanges": ("TOR",), "sort": "intradaymarketcap",
                   "label": "actions de la Bourse de Toronto (capitalisation)"},
    "us_fnb": {"kind": "etf", "region": "us", "exchanges": (), "sort": "fundnetassets",
               "label": "FNB américains (actif net)"},
    "ca_fnb": {"kind": "etf", "region": "ca", "exchanges": ("TOR",), "sort": "fundnetassets",
               "label": "FNB de la Bourse de Toronto (actif net)"},
}
YAHOO_SCREENER_URL = "https://finance.yahoo.com/research-hub/screener/"
SCREENS_FILE = "yahoo_screeners.json.gz"
GROUP_FILE = "groupe.json"
MAX_EXCLUDED_LISTED = 100


def quotas(max_titles: int, ca_share: float, etf_share: float) -> dict[str, int]:
    n_etf = round(max_titles * etf_share)
    n_stocks = max_titles - n_etf
    n_ca = round(n_stocks * ca_share)
    ca_fnb = n_etf // 2
    return {"us_actions": n_stocks - n_ca, "ca_actions": n_ca, "us_fnb": n_etf - ca_fnb, "ca_fnb": ca_fnb}


def plan(group: Any) -> dict[str, tuple[dict[str, Any], int]]:
    """Screeners of an auto or sector group: {screen id: (spec, titles wanted)}."""
    if group.kind == "auto":
        wanted = quotas(group.max_titles, group.ca_share, group.etf_share)
        return {k: (SCREENS[k], n) for k, n in wanted.items()}
    wanted = quotas(group.max_titles, group.ca_share, 0)
    label = groups.SECTORS[group.name]
    return {f"sector_{k[:2]}": ({**SCREENS[k], "sector": group.name,
                                 "label": f"{SCREENS[k]['label'].split(' (')[0]}, secteur {label}"}, wanted[k])
            for k in ("us_actions", "ca_actions")}


# --- Bronze --------------------------------------------------------------------------------------------

def _screen_page(spec: dict[str, Any], offset: int, size: int) -> dict[str, Any]:
    import yfinance as yf
    from yfinance import EquityQuery
    from yfinance.screener.query import ETFQuery

    q = ETFQuery if spec["kind"] == "etf" else EquityQuery
    parts = [q("eq", ["region", spec["region"]])]
    if spec["exchanges"]:
        parts.append(q("is-in", ["exchange", *spec["exchanges"]]))
    if spec.get("sector"):
        parts.append(q("eq", ["sector", spec["sector"]]))
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


def fetch_quotes(symbols: list[str]) -> list[dict[str, Any]]:
    """Raw Yahoo v7 quotes (same fields as a screener row), in batches of 50."""
    out: list[dict[str, Any]] = []
    for i in range(0, len(symbols), QUOTE_BATCH):
        status, body = yf_market._get(yf_market.QUOTE_URL, {"symbols": ",".join(symbols[i:i + QUOTE_BATCH])})
        if status >= 400:
            raise RuntimeError(f"cotations Yahoo indisponibles (HTTP {status})")
        out.extend(((body or {}).get("quoteResponse") or {}).get("result") or [])
    return out


def universe_rows(sec_body: dict[str, Any] | None, tmx_bodies: dict[str, dict[str, Any]]
                  ) -> tuple[dict[str, dict[str, Any]], int]:
    """({symbol: listing}, TMX symbols already listed by the SEC)."""
    rows: dict[str, dict[str, Any]] = {}
    if sec_body is not None:
        rows.update((r["symbol"], r) for r in parse_sec(sec_body))
    duplicates = 0
    for board, body in tmx_bodies.items():
        for r in parse_tmx(board, body):
            if r["symbol"] in rows:
                duplicates += 1
                continue
            rows[r["symbol"]] = r
    return rows, duplicates


def _best_of_latest_table(store: st.Store, limit: int) -> tuple[list[str], str | None]:
    try:
        table = st.get_json(store, GOLD_LATEST_KEY)
    except st.NotFound:
        return [], None
    rows = sorted(table.get("rows") or [], key=lambda r: (-float(r["score"]), r["symbol"]))
    return [r["symbol"] for r in rows[:limit]], table.get("generated_at")


def _group_screens(ctx: RunContext, store: st.Store, rec: StageRecorder,
                   listings: dict[str, dict[str, Any]]) -> tuple[dict[str, Any], dict[str, Any]]:
    """({screen id: {"spec", "quotes"}}, group notes) for the run's group."""
    group = ctx.params.group
    screens: dict[str, Any] = {}
    notes: dict[str, Any] = {"kind": group.kind, "label": groups.label(group)}
    if group.kind in ("auto", "sector"):
        for screen_id, (spec, wanted) in plan(group).items():
            if not wanted:
                continue
            try:
                quotes = fetch_screen(spec, min(1000, wanted * 2 + 20))
            except Exception as exc:
                rec.decide("missing", f"Filtre Yahoo « {spec['label']} » indisponible ({type(exc).__name__})")
                continue
            screens[screen_id] = {"spec": {k: v for k, v in spec.items() if k != "label"}, "quotes": quotes}
            rec.rows[f"yahoo_{screen_id}"] = len(quotes)
        rec.source("yahoo_screener", "Yahoo Finance (filtres de titres)", YAHOO_SCREENER_URL)
    elif group.kind == "section":
        section = sections.BY_ID[group.id]
        if section.screen is not None:
            quotes = yf_market._run_screen(section.screen, min(250, group.limit * 2 + 20))
            rec.source("yahoo_screener", f"Yahoo Finance, section « {section.title} »", YAHOO_SCREENER_URL)
        else:
            symbols, generated = _best_of_latest_table(store, group.limit)
            notes["table_generated_at"] = generated
            if not symbols:
                raise RuntimeError("La section « Meilleurs scores » est vide : aucune table gold à reprendre")
            quotes = fetch_quotes(symbols)
            rec.decide("source", f"Section « {section.title} » : les {len(symbols)} meilleurs titres de la table "
                                 f"gold du {generated}", len(symbols))
        screens["section"] = {"spec": {"section": group.id}, "quotes": quotes}
        rec.rows["yahoo_section"] = len(quotes)
    else:
        resolved, aliases, unknown = groups.resolve_tickers(group.tickers, lambda s: s in listings)
        notes.update(requested=group.tickers, resolved=resolved, aliases=aliases, unknown=unknown)
        quotes = fetch_quotes(resolved) if resolved else []
        screens["tickers"] = {"spec": {"tickers": resolved}, "quotes": quotes}
        rec.rows["yahoo_cotations"] = len(quotes)
        rec.source("yahoo_quotes", "Yahoo Finance (cotations)", "https://finance.yahoo.com/")
    return screens, notes


def bronze(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    sec_ua = {"User-Agent": get_settings().sec_user_agent, "Accept-Encoding": "gzip, deflate"}
    sec_body: dict[str, Any] | None = None
    tmx_bodies: dict[str, dict[str, Any]] = {}
    try:
        sec = net.get(universe.SEC_SOURCE, universe.SEC_URL, headers=sec_ua, timeout_s=30)
        st.put_raw(store, rec.output(ctx.key("bronze", "titres_bruts", "sec_company_tickers_exchange.json.gz")),
                   sec.content)
        sec_body = json.loads(sec.content)
        rec.rows["sec"] = len(sec_body.get("data") or [])
        rec.source("sec_tickers", universe.SEC_SOURCE, universe.SEC_URL)
    except Exception as exc:
        rec.decide("missing", f"Liste SEC indisponible ({exc}) : univers limité au Canada")
    for board in universe.TMX_BOARDS:
        try:
            resp = net.get(universe.TMX_SOURCE, universe.TMX_URL.format(board=board),
                           headers={"User-Agent": "Mozilla/5.0 (StockLock datathon)"}, timeout_s=40)
            st.put_raw(store, rec.output(ctx.key("bronze", "titres_bruts", f"tmx_{board}.json.gz")), resp.content)
            tmx_bodies[board] = json.loads(resp.content)
            rec.rows[f"tmx_{board}"] = len(tmx_bodies[board].get("results") or [])
            rec.source("tmx", universe.TMX_SOURCE, "https://www.tsx.com/listings/listing-with-us/listed-company-directory")
        except Exception as exc:
            rec.decide("missing", f"Répertoire TMX {board.upper()} indisponible ({exc})")
    if sec_body is None and not tmx_bodies:
        raise RuntimeError("Ni la liste SEC ni le répertoire TMX ne sont joignables : aucun univers")
    rec.rows["titres_bruts"] = sum(v for k, v in rec.rows.items() if k.startswith(("sec", "tmx")))
    rec.decide("source", "Univers : liste SEC (company_tickers_exchange.json) + répertoire TMX (TSX, TSXV), "
                         "copiés bruts du jour")

    listings, _dups = universe_rows(sec_body, tmx_bodies)
    screens, notes = _group_screens(ctx, store, rec, listings)
    no_quote = not any(s["quotes"] for s in screens.values())
    if not screens or (no_quote and ctx.params.group.kind != "tickers"):  # unknown tickers: reported in silver
        raise RuntimeError("Aucune cotation Yahoo Finance pour le groupe : impossible de choisir les titres")
    st.put_json(store, rec.output(ctx.key("bronze", "titres_bruts", SCREENS_FILE)), screens)
    st.put_json(store, rec.output(ctx.key("bronze", "titres_bruts", GROUP_FILE)), notes)
    rec.decide("parameter", f"Groupe du run : {notes['label']}")
    if ctx.params.group.kind == "auto":
        rec.decide("source", "Popularité : filtres Yahoo Finance triés par capitalisation (actions) ou actif net "
                             "(FNB), " + ", ".join(f"{k} {v}" for k, v in rec.rows.items() if k.startswith("yahoo_")))
    sample_rows = [{"filtre": sid, "symbole": q.get("symbol"), "nom": q.get("longName") or q.get("shortName"),
                    "capitalisation": q.get("marketCap"), "devise": q.get("currency")}
                   for sid, s in screens.items() for q in s["quotes"][:3]]
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


REASONS = {"hors_univers": "absent de l'univers SEC/TMX", "cdr": "certificat de dépôt canadien (CDR)",
           "type": "ni une action ni un FNB", "inactifs": f"aucune séance depuis {INACTIVE_DAYS} jours ou volume nul",
           "doublons_societe": "autre catégorie d'actions de la même société, moins échangée"}


def select(universe_rows: dict[str, dict[str, Any]], screens: dict[str, Any], wanted: dict[str, int],
           run_date: date, *, explicit: bool = False, top_up: bool = True
           ) -> tuple[list[dict[str, Any]], dict[str, int], list[dict[str, str]]]:
    """Titles picked in each screener's order, within its quota: (rows, filter counts, excluded titles).

    explicit (a requested ticker list): CDRs and several share classes of a company are kept as asked.
    top_up: stocks beyond a quota fill the places another screener could not.
    """
    counts = {"hors_univers": 0, "cdr": 0, "type": 0, "inactifs": 0, "doublons_societe": 0, "deja_retenus": 0}
    excluded: list[dict[str, str]] = []
    chosen: list[dict[str, Any]] = []
    seen_symbols: set[str] = set()
    seen_companies: set[str] = set()
    leftovers: list[tuple[str, dict[str, Any], dict[str, Any]]] = []

    def drop(key: str, symbol: str) -> None:
        counts[key] += 1
        excluded.append({"symbol": symbol, "reason": REASONS[key]})

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
    for screen_id in wanted:
        taken = 0
        for quote in (screens.get(screen_id) or {}).get("quotes") or []:
            symbol = str(quote.get("symbol") or "").upper()
            listing = universe_rows.get(symbol)
            if listing is None:
                drop("hors_univers", symbol)
                continue
            if not explicit and most_traded[listing["company_key"]][1] != symbol:
                drop("doublons_societe", symbol)
                continue
            if not explicit and is_cdr(quote):
                drop("cdr", symbol)
                continue
            if quote.get("quoteType") not in {"EQUITY", "ETF"}:
                drop("type", symbol)
                continue
            if not _active(quote, run_date):
                drop("inactifs", symbol)
                continue
            if symbol in seen_symbols:
                counts["deja_retenus"] += 1
                continue
            if not explicit and listing["company_key"] in seen_companies:
                drop("doublons_societe", symbol)
                continue
            if taken >= wanted[screen_id]:
                if top_up and quote.get("quoteType") == "EQUITY":
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
    return chosen, counts, excluded


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


def _load_universe(ctx: RunContext, store: st.Store, rec: StageRecorder) -> dict[str, dict[str, Any]]:
    try:
        sec_body = st.get_json(store, ctx.key("bronze", "titres_bruts", "sec_company_tickers_exchange.json.gz"))
    except st.NotFound:
        sec_body = None
        rec.decide("missing", "Pas de liste SEC ce jour : titres américains absents")
    tmx_bodies = {}
    for board in universe.TMX_BOARDS:
        try:
            tmx_bodies[board] = st.get_json(store, ctx.key("bronze", "titres_bruts", f"tmx_{board}.json.gz"))
        except st.NotFound:
            continue
    rows, duplicates = universe_rows(sec_body, tmx_bodies)
    rec.rows["univers_complet"] = len(rows)
    rec.decide("filter", "Titres en double entre les listes SEC et TMX retirés", duplicates)
    rec.decide("filter", "Actions privilégiées, débentures, bons de souscription, billets et droits exclus "
                         "du répertoire TMX (règle de app.data.universe)")
    return rows


def _choose(ctx: RunContext, rows: dict[str, dict[str, Any]], screens: dict[str, Any], rec: StageRecorder
            ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """The group's titles and its resolution record (kind, label, requested, resolved, unknown, excluded)."""
    group = ctx.params.group
    run_date = date.fromisoformat(ctx.date)
    resolution = groups.preview(group)
    if group.kind in ("auto", "sector"):
        wanted = {k: n for k, (_spec, n) in plan(group).items()}
        chosen, counts, excluded = select(rows, screens, wanted, run_date)
        rec.decide("parameter", f"{resolution['label']} ; répartition visée "
                                + ", ".join(f"{k} {v}" for k, v in wanted.items()), sum(wanted.values()))
    elif group.kind == "section":
        chosen, counts, excluded = select(rows, screens, {"section": group.limit}, run_date, top_up=False)
        rec.decide("parameter", f"{resolution['label']}, dans l'ordre de la section", group.limit)
    else:
        resolved, aliases, unknown = groups.resolve_tickers(group.tickers, lambda s: s in rows)
        chosen, counts, excluded = select(rows, screens, {"tickers": len(resolved)}, run_date, explicit=True,
                                          top_up=False)
        quoted = {str(q.get("symbol") or "").upper() for q in screens.get("tickers", {}).get("quotes") or []}
        excluded += [{"symbol": s, "reason": "aucune cotation Yahoo Finance"} for s in resolved if s not in quoted]
        resolution.update(unknown=unknown, aliases=aliases)
        rec.decide("parameter", f"Titres demandés : {', '.join(group.tickers[:30])}", len(group.tickers))
        if aliases:
            rec.decide("info", "Symboles interprétés : " + ", ".join(f"{a} → {b}" for a, b in aliases.items()),
                       len(aliases))
        rec.decide("missing", "Titres inconnus de l'univers SEC/TMX, non notés"
                              + (f" : {', '.join(unknown[:30])}" if unknown else ""), len(unknown))
    labels = {"hors_univers": "Titres absents de l'univers SEC/TMX écartés",
              "cdr": "Certificats de dépôt canadiens (CDR) écartés",
              "type": "Instruments qui ne sont ni des actions ni des FNB écartés",
              "inactifs": f"Titres inactifs écartés (aucune séance depuis {INACTIVE_DAYS} jours ou volume nul)",
              "doublons_societe": "Autres catégories d'actions d'une même société écartées (la plus échangée gardée)",
              "deja_retenus": "Titres présents dans deux filtres comptés une fois"}
    for key, text in labels.items():
        rec.decide("filter", text, counts[key])
    if group.kind != "auto" and excluded:
        kept = [e for e in excluded if e["reason"] != REASONS["hors_univers"] or group.kind == "tickers"]
        resolution["excluded"] = kept[:MAX_EXCLUDED_LISTED]
        if kept and group.kind == "tickers":
            rec.decide("missing", "Titres demandés mais non notables : "
                                  + ", ".join(f"{e['symbol']} ({e['reason']})" for e in kept[:20]), len(kept))
    resolution["resolved"] = [r["symbol"] for r in chosen]
    return chosen, resolution


def silver(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    rows = _load_universe(ctx, store, rec)
    screens = st.get_json(store, ctx.key("bronze", "titres_bruts", SCREENS_FILE))
    chosen, resolution = _choose(ctx, rows, screens, rec)
    rec.metrics["group"] = resolution
    if not chosen:
        raise RuntimeError(f"Aucun titre notable dans le groupe ({resolution['label']}) : "
                           + "; ".join(f"{e['symbol']} {e['reason']}" for e in resolution["excluded"][:10])
                           + (f" ; inconnus : {', '.join(resolution['unknown'][:10])}" if resolution["unknown"] else ""))
    wanted = groups.requested_size(ctx.params.group)
    if len(chosen) < wanted:
        rec.decide("missing", f"Seulement {len(chosen)} titres retenus sur {wanted} demandés", len(chosen))

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
    for asset_type, n in frame["asset_type"].value_counts().items():
        rec.rows[f"univers_{asset_type}"] = int(n)
    rec.add_sample("univers", frame[["symbol", "name", "exchange", "currency", "asset_type", "sector",
                                     "market_cap"]])
