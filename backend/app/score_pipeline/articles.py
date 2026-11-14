"""Bronze `articles_bruts`: news of the last 90 days per title.

- GDELT DOC 2.0 (`artlist`), several company names per request (`("A" OR "B" ...)`) so that a few hundred
  titles fit in GDELT's limit of one request every 5 seconds; each article goes to the titles whose name
  is in its headline. After 3 refusals in a row GDELT is left for the rest of the run.
- Federal Register (US issuers): documents naming the company (rules, notices, enforcement).
- Yahoo Finance news, as a fallback for titles GDELT could not cover.
A title is `ok` when at least one source answered for it (even with no article), `failed` otherwise;
ETFs are `skipped` (company news do not apply).
"""

from __future__ import annotations

import re
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.data import gdelt
from app.score_pipeline import net
from app.score_pipeline import store as st
from app.score_pipeline.runs import RunContext, StageRecorder

WINDOW_DAYS = 90
GDELT_NAMES_PER_QUERY = 6
GDELT_MAX_FAILURES = 3
FR_URL = "https://www.federalregister.gov/api/v1/documents.json"
FR_PER_TITLE = 2
SUFFIX = re.compile(r"[,.]?\s+(inc|incorporated|corp|corporation|co|company|ltd|limited|plc|llc|l\.?p|s\.?a|n\.?v|"
                    r"ag|se|holdings?|group|trust|the|class [a-z]|common stock|ordinary shares)\.?$", re.IGNORECASE)


def short_name(symbol: str, name: str) -> str | None:
    """Name as news write it: « Apple » for « Apple Inc. », « JPMorgan Chase » for « JPMorgan Chase & Co. »."""
    if symbol in gdelt.NAME_OVERRIDES:
        return gdelt.NAME_OVERRIDES[symbol]
    base = re.sub(r"\s*\(.*?\)", "", name or "").strip()
    base = re.sub(r"\s*&\s*co\.?$", "", base, flags=re.IGNORECASE)
    previous = None
    while previous != base:
        previous = base
        base = SUFFIX.sub("", base).strip(" ,.-")
    base = re.sub(r"^the\s+", "", base, flags=re.IGNORECASE)
    return base if len(base) >= 3 else None


def mentions(name: str, text: str) -> bool:
    return re.search(rf"(?<![A-Za-z0-9]){re.escape(name)}(?![A-Za-z0-9])", text, flags=re.IGNORECASE) is not None


def _gdelt_date(seen: str) -> str | None:
    try:
        return datetime.strptime(seen[:8], "%Y%m%d").date().isoformat()
    except (TypeError, ValueError):
        return None


class Gdelt:
    """Throttled GDELT client with a circuit breaker."""

    def __init__(self, sleep=time.sleep) -> None:
        self.sleep = sleep
        self.last = 0.0
        self.failures = 0
        self.calls = 0

    @property
    def open(self) -> bool:
        return self.failures >= GDELT_MAX_FAILURES

    def query(self, names: list[str], start: date, end: date) -> list[dict[str, Any]]:
        query = "(" + " OR ".join(f'"{n}"' for n in names) + ") sourcelang:english"
        if len(names) == 1:
            query = f'"{names[0]}" sourcelang:english'
        params = {"query": query, "mode": "artlist", "format": "json", "maxrecords": "250", "sort": "hybridrel",
                  "startdatetime": start.strftime("%Y%m%d000000"),
                  "enddatetime": (end + timedelta(days=1)).strftime("%Y%m%d000000")}
        for attempt in range(2):
            wait = gdelt.MIN_INTERVAL_S - (time.monotonic() - self.last)
            if wait > 0:
                self.sleep(wait)
            self.last = time.monotonic()
            self.calls += 1
            try:
                resp = net.get(gdelt.SOURCE, gdelt.API_URL, params=params, timeout_s=30, retries=0,
                               headers={"User-Agent": "StockLock datathon research"})
                body = resp.json()
                self.failures = 0
                return list(body.get("articles") or [])
            except ValueError:  # GDELT answers plain text when the query is malformed
                self.failures += 1
                raise
            except Exception:
                if attempt == 1:
                    self.failures += 1
                    raise
                self.sleep(gdelt.MIN_INTERVAL_S + 2)
        return []


def fetch_federal_register(name: str, start: date) -> list[dict[str, Any]]:
    params = {"conditions[term]": f'"{name}"', "per_page": str(FR_PER_TITLE), "order": "newest",
              "conditions[publication_date][gte]": start.isoformat(),
              "fields[]": ["title", "abstract", "publication_date", "html_url", "type", "agencies"]}
    body = net.get("Federal Register", FR_URL, params=params, timeout_s=20, retries=1).json()
    return list(body.get("results") or [])


def fetch_yahoo_news(symbol: str) -> list[dict[str, Any]]:
    import yfinance as yf

    out = []
    for item in yf.Ticker(symbol).news or []:
        content = item.get("content") if isinstance(item.get("content"), dict) else item
        when = content.get("pubDate") or content.get("displayTime")
        url = (content.get("canonicalUrl") or {}).get("url") if isinstance(content.get("canonicalUrl"), dict) else None
        provider = content.get("provider")
        out.append({"title": content.get("title"), "summary": content.get("summary") or content.get("description"),
                    "date": str(when)[:10] if when else None, "url": url or content.get("link"),
                    "publisher": provider.get("displayName") if isinstance(provider, dict) else None})
    return out


def _legal_name(name: str) -> str:
    return re.sub(r"[,.]", "", re.sub(r"\s*\(.*?\)", "", name or "")).strip()


def bronze(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float) -> None:
    univ = st.get_csv(store, ctx.key("silver", "univers", "univers.csv"))
    end = date.fromisoformat(ctx.date)
    start = end - timedelta(days=WINDOW_DAYS)
    titles = []
    for r in univ.itertuples():
        if r.asset_type != "action":
            continue
        titles.append({"symbol": r.symbol, "name": r.name, "query_name": short_name(r.symbol, str(r.name)),
                       "legal_name": _legal_name(str(r.listing_name)), "country": r.country})
    rec.decide("filter", "FNB : pas d'actualités d'entreprise, sous-score événements non calculé",
               int((univ["asset_type"] != "action").sum()))
    coverage: dict[str, dict[str, str]] = {t["symbol"]: {} for t in titles}
    articles: dict[str, list[dict[str, Any]]] = {t["symbol"]: [] for t in titles}
    lock = threading.Lock()

    def add(symbol: str, item: dict[str, Any]) -> None:
        with lock:
            if item["url"] and any(a["url"] == item["url"] for a in articles[symbol]):
                return
            articles[symbol].append(item)

    # Federal Register in the background (US titles), GDELT in the foreground (one request at a time).
    us_titles = [t for t in titles if t["country"] == "US" and len(t["legal_name"]) >= 4]
    fr_raw: dict[str, Any] = {}

    def fr_job(t: dict[str, Any]) -> int:
        results = fetch_federal_register(t["legal_name"], start)
        fr_raw[t["symbol"]] = results
        for doc in results:
            add(t["symbol"], {"source": "federal_register", "date": doc.get("publication_date"),
                              "title": doc.get("title") or "", "text": doc.get("abstract") or "",
                              "url": doc.get("html_url"), "publisher": "Federal Register"})
        return len(results)

    fr_thread_results: list[Any] = []
    fr_thread = threading.Thread(
        target=lambda: fr_thread_results.extend(net.parallel(us_titles, fr_job, workers=3, deadline=deadline)))
    fr_thread.start()

    client = Gdelt()
    gdelt_raw: list[dict[str, Any]] = []
    named = [t for t in titles if t["query_name"]]
    batches = [named[i:i + GDELT_NAMES_PER_QUERY] for i in range(0, len(named), GDELT_NAMES_PER_QUERY)]
    stopped_for_time = 0
    for batch in batches:
        if client.open:
            break
        if time.monotonic() > deadline - 90:
            stopped_for_time += len(batch)
            continue
        names = [t["query_name"] for t in batch]
        try:
            found = client.query(names, start, end)
        except Exception as exc:
            gdelt_raw.append({"names": names, "status": "failed", "error": f"{type(exc).__name__}: {exc}"})
            continue
        gdelt_raw.append({"names": names, "status": "ok", "articles": found})
        for t in batch:
            coverage[t["symbol"]]["gdelt"] = "ok"
        for art in found:
            title = str(art.get("title") or "")
            for t in batch:
                if mentions(t["query_name"], title):
                    add(t["symbol"], {"source": "gdelt", "date": _gdelt_date(str(art.get("seendate") or "")),
                                      "title": title, "text": "", "url": art.get("url"),
                                      "publisher": art.get("domain")})
    rec.metrics["gdelt_calls"] = client.calls
    rec.decide("source", f"GDELT DOC 2.0 : {GDELT_NAMES_PER_QUERY} noms par requête, une requête toutes les "
                         f"{gdelt.MIN_INTERVAL_S:g} s, articles attribués par le nom dans le titre", client.calls)
    if client.open:
        rec.decide("fallback", f"GDELT a refusé {GDELT_MAX_FAILURES} requêtes de suite : abandonné pour ce run")
    if stopped_for_time:
        rec.decide("missing", "Titres non interrogés dans GDELT faute de temps", stopped_for_time)
    rec.decide("missing", "Titres sans nom exploitable pour GDELT", len(titles) - len(named))

    fr_thread.join()
    for t, _n, err in fr_thread_results:
        coverage[t["symbol"]]["federal_register"] = "ok" if err is None else "failed"
    rec.decide("source", "Federal Register : documents fédéraux américains nommant la société (2 au plus)",
               len(us_titles))

    need_yahoo = [t for t in titles if coverage[t["symbol"]].get("gdelt") != "ok"]
    yahoo_raw: dict[str, Any] = {}

    def yahoo_job(t: dict[str, Any]) -> int:
        items = fetch_yahoo_news(t["symbol"])
        yahoo_raw[t["symbol"]] = items
        for it in items:
            if it["title"] and it["date"] and it["date"] >= start.isoformat():
                add(t["symbol"], {"source": "yahoo", "date": it["date"], "title": it["title"],
                                  "text": it.get("summary") or "", "url": it["url"], "publisher": it["publisher"]})
        return len(items)

    for t, _n, err in net.parallel(need_yahoo, yahoo_job, workers=4, deadline=deadline):
        coverage[t["symbol"]]["yahoo"] = "ok" if err is None else "failed"
    rec.decide("fallback", "Titres non couverts par GDELT : actualités récentes de Yahoo Finance", len(need_yahoo))

    per_title = ctx.params.news_per_title
    index: dict[str, Any] = {}
    n_articles = 0
    for t in titles:
        items = sorted(articles[t["symbol"]], key=lambda a: a["date"] or "", reverse=True)
        fr_items = [a for a in items if a["source"] == "federal_register"][:FR_PER_TITLE]
        news = [a for a in items if a["source"] != "federal_register"][:per_title]
        kept = sorted(fr_items + news, key=lambda a: a["date"] or "", reverse=True)
        for i, a in enumerate(kept):
            a["id"] = f"{t['symbol']}#{i}"
        status = "ok" if any(v == "ok" for v in coverage[t["symbol"]].values()) else "failed"
        index[t["symbol"]] = {"name": t["name"], "query_name": t["query_name"], "status": status,
                              "sources": coverage[t["symbol"]], "articles": kept}
        n_articles += len(kept)
    rec.decide("parameter", f"Au plus {per_title} actualités et {FR_PER_TITLE} documents fédéraux par titre, "
                            f"{WINDOW_DAYS} derniers jours", per_title)
    failed = sum(1 for v in index.values() if v["status"] == "failed")
    rec.decide("missing", "Titres dont aucune source d'actualités n'a répondu (sous-score événements manquant)", failed)

    key = lambda name: ctx.key("bronze", "articles_bruts", name)  # noqa: E731
    st.put_json(store, rec.output(key("gdelt.json.gz")), gdelt_raw)
    st.put_json(store, rec.output(key("federal_register.json.gz")), fr_raw)
    st.put_json(store, rec.output(key("yahoo_news.json.gz")), yahoo_raw)
    st.put_json(store, rec.output(key("articles_par_titre.json.gz")), index)
    rec.rows["articles_bruts"] = n_articles
    rec.rows["titres_couverts"] = len(index) - failed
    rec.metrics["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rec.source("gdelt", gdelt.SOURCE, gdelt.API_URL)
    rec.source("federal_register", "Federal Register API", "https://www.federalregister.gov/developers/api/v1")
    rec.source("yahoo_news", "Yahoo Finance (actualités)", "https://finance.yahoo.com/")
    rec.add_sample("articles_bruts", [{"symbole": s, **{k: a[k] for k in ("source", "date", "title")}}
                                      for s, v in index.items() for a in v["articles"][:1]])
