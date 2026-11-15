"""Step 2, the dated events and how they are read (diagram « 2. Comprendre : pipeline des fluctuations »).

- policy_events: Bank of Canada and Fed rate decisions, dated on their announcement day;
- political_events: U.S. presidential documents on trade, tariffs, sanctions, industry or energy
  (Federal Register) and the peaks of world coverage of tariffs and sanctions (GDELT); the political,
  rate and leadership (8-K 5.02) events the title reacted to most become the period's key events;
- crawl: the articles, 8-K press releases and presidential documents near each marked move (and the
  key events) are read by the crawler (robots.txt honoured), so that few pages are fetched;
- digest: Claude Haiku summarizes and dates each article or 8-K from the page read (a few events per
  call, the calls side by side); a summary with a number absent from the page, or a date outside the
  week before publication, is rejected;
- plausibility: Claude Haiku says whether the nearby events plausibly explain each move, quoting the
  event word for word; each move ends up explained by a dated fact, a hypothesis, or no event;
- key_events: the key events with the title's and the index's reaction over two sessions.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlsplit

import numpy as np
import pandas as pd

from app.data import crawler, federal_register, gdelt
from app.data.cache import ExternalUnavailable, OverBudget
from app.pipeline import explain_move_fetch as fetch
from app.pipeline.core import Choice, Context, OptionSpec, StageSkipped
from app.services import governance, narration
from app.services import policy_events as policy

EVENT_LOOKBACK_DAYS = 3     # an event is tied to a move on the same day or in the 3 days before
READ_AFTER_DAYS = 2         # an article can come out a day or two after the event it reports
DIGEST_MAX_SHIFT_DAYS = 7   # Haiku may date the reported fact at most a week before publication
JUDGED_MOVES_MAX = 8
DIGEST_CHUNK = 3            # events per Haiku digest call; the calls run side by side
LINKS_CHUNK = 4             # moves per Haiku link-judgement call
KEY_EVENTS_MAX = 8          # political, rate and leadership events kept for the period
KEY_EVENTS_PER_DAY = 2
POLITICAL_PEAKS_MAX = 8
US_POLICY = "décision politique US"
POLITICAL_PEAK = "pic politique GDELT"
CRAWLABLE = frozenset({"8-K", "pic GDELT", "article", US_POLICY, POLITICAL_PEAK})
NEWS_KINDS = frozenset({"pic GDELT", "article", POLITICAL_PEAK})
RATE_KINDS = frozenset({"décision BdC", "décision Fed"})
KIND_RANK = {"8-K": 0, US_POLICY: 1, "décision BdC": 1, "décision Fed": 1, "10-Q": 2, "10-K": 2}
CATEGORIES = ("entreprise", "direction", "économique", "politique", "marché", "autre")
GENERIC_TITLES = frozenset({"document", "untitled", "untitled document"})
VERDICTS = {"plausible": "plausible", "peu_plausible": "peu plausible", "indetermine": "indéterminé"}
EXPLANATIONS = {"fait": "fait daté", "hypothese": "hypothèse", "aucun_evenement": "aucun événement"}

HAIKU_MODEL = OptionSpec(
    "model", "Modèle", (Choice("none", "Aucun (règles)"), Choice("haiku", "Claude Haiku 4.5")), "haiku",
    "Agent Bedrock rapide ; ses réponses sont vérifiées avant d'être gardées.", lab_default="none")
POLICY_OPTIONS = (OptionSpec("enabled", "Activé", (Choice("on", "Oui"), Choice("off", "Non")), "on"),)
POLITICAL_OPTIONS = (OptionSpec(
    "source", "Source",
    (Choice("both", "Federal Register et GDELT"), Choice("federal_register", "Federal Register (présidence US)"),
     Choice("gdelt", "GDELT (couverture des tarifs et sanctions)"), Choice("none", "Aucune")), "both",
    "Décrets et proclamations de la présidence américaine sur le commerce, les tarifs, les sanctions, l'industrie "
    "ou l'énergie, et pics de couverture mondiale des tarifs et des sanctions."),)
CRAWL_OPTIONS = (
    OptionSpec("enabled", "Activé", (Choice("on", "Oui"), Choice("off", "Non")), "on",
               "Lit les articles et communiqués (pièce 99 des 8-K) proches des mouvements ; respecte robots.txt."),
    OptionSpec("max_pages", "Pages au plus", (Choice(5, "5"), Choice(10, "10"), Choice(20, "20")), 10),
)


def when(event: dict[str, Any]) -> date:
    """Date of the fact an event reports: Haiku's checked date, else the source's date."""
    return event.get("event_date") or event["date"]


def all_events(ctx: Context) -> list[dict[str, Any]]:
    return [*ctx.state.get("policy_events", []), *ctx.state.get("company_events", []),
            *ctx.state.get("world_events", []), *ctx.state.get("political_events", [])]


def is_leadership(event: dict[str, Any]) -> bool:
    """An 8-K filed for the departure or appointment of officers or directors (item 5.02)."""
    return event["kind"] == "8-K" and "(5.02)" in event["label"]


def default_category(e: dict[str, Any]) -> str:
    if e.get("category"):
        return e["category"]
    if e["kind"] in RATE_KINDS:
        return "économique"
    if e["kind"] in {US_POLICY, POLITICAL_PEAK}:
        return "politique"
    if is_leadership(e):
        return "direction"
    return "marché" if e["kind"] in NEWS_KINDS else "entreprise"


def _ensure_ids(events: list[dict[str, Any]]) -> None:
    used = {e["id"] for e in events if e.get("id")}
    n = len(used)
    for e in events:
        if not e.get("id"):
            n += 1
            while f"e{n}" in used:
                n += 1
            e["id"] = f"e{n}"
            used.add(e["id"])


def is_primary(event: dict[str, Any]) -> bool:
    """Issuer or central-bank source (filings, corporate actions, rate decisions), not press coverage."""
    return event["kind"] not in NEWS_KINDS


def confidence_level(n_days: int, n_moves: int, has_events: bool, fit: float, share: float
                     ) -> tuple[str, str, str]:
    """(level, why, rule): rules tested in order; `share` = moves explained / moves."""
    found = n_moves > 0
    if n_days < 20:
        return "je ne peux pas conclure", "moins de 20 séances dans la fenêtre", "séances < 20"
    if not found and fit < 0.1:
        return ("je ne peux pas conclure", "ni mouvement anormal marquant ni lien net avec l'indice",
                "aucun mouvement et ajustement < 0,1")
    if found and not has_events and fit < 0.25:
        return ("je ne peux pas conclure", "mouvements anormaux sans aucun événement daté disponible",
                "mouvements sans aucun événement et ajustement < 0,25")
    if fit >= 0.5 or (found and share >= 0.6):
        return ("élevée", "l'indice explique une grande part des variations ou la plupart des mouvements ont "
                "un événement proche", "ajustement ≥ 0,5 ou part rattachée ≥ 60 %")
    if fit >= 0.25 or (found and share >= 0.3):
        return ("moyenne", "lien partiel avec l'indice ou une partie des mouvements a un événement proche",
                "ajustement ≥ 0,25 ou part rattachée ≥ 30 %")
    return "faible", "peu de lien avec l'indice et peu d'événements proches des mouvements", \
        "aucune des règles précédentes"


# --- policy rate decisions -----------------------------------------------------------------------

def policy_events(ctx: Context) -> None:
    ctx.state["policy_events"] = []
    if ctx.opt("enabled") == "off":
        raise StageSkipped("Décisions de taux désactivées.")
    start, end = ctx.inputs.start, ctx.inputs.end
    sid = ctx.source("starter_macro", "AlphaForge starter kit, macro_rates.csv (Banque du Canada Valet, FRED)")
    events, rows = [], []
    for series_id, bank, series_label, url in policy.POLICY_SERIES:
        decisions = policy.rate_decisions(series_id, start, end)
        ctx.decide(f"Décisions de « {bank} » dans la fenêtre ?", len(decisions),
                   f"Sauts de la série {series_id} ({series_label}) entre deux observations, datés de "
                   "l'observation précédente : le jour de l'annonce (la série change le lendemain).",
                   f"saut ≥ {policy.MIN_STEP:.2f} point".replace(".", ","), {"série": series_id})
        kind = "décision BdC" if series_id == "V39079" else "décision Fed"
        for d in decisions:
            events.append({"date": d["date"], "kind": kind, "label": policy.label(bank, d), "source_id": sid,
                           "url": url})
            rows.append([d["date"], bank, d["before"], d["after"], d["change"], d["effective"]])
    events.sort(key=lambda e: e["date"])
    ctx.state["policy_events"] = events
    ctx.metric("décisions Banque du Canada", sum(1 for e in events if e["kind"] == "décision BdC"))
    ctx.metric("décisions Fed", sum(1 for e in events if e["kind"] == "décision Fed"))
    columns = ["date d'annonce", "banque", "taux avant", "taux après", "variation (points)", "date d'effet"]
    ctx.preview(columns, rows)
    ctx.dataset("policy_decisions", "Décisions de taux annoncées dans la fenêtre", columns, rows, sid)
    ctx.report.factor("Décisions de taux (Banque du Canada et Fed) dans la fenêtre", float(len(events)),
                      "décisions", source_id=sid, digits=0)
    ctx.report.assume("Décisions de taux datées le jour de l'annonce : la veille du premier jour où la série du "
                      "kit change (V39079 pour la Banque du Canada, DFF pour la Fed).")


# --- political events and the title's reaction -------------------------------------------------------

def reaction(ctx: Context, day: date) -> dict[str, Any] | None:
    """The title and its index over two sessions: the event's day (or the next session when it falls
    on a day without trading, or after the close) and the one after; abnormal = sum of daily ARs."""
    rets, ar = ctx.state.get("rets"), ctx.state.get("ar")
    if rets is None or ar is None or rets.empty:
        return None
    sessions = rets.index[rets.index >= pd.Timestamp(day)][:2]
    if len(sessions) == 0 or (sessions[0] - pd.Timestamp(day)).days > 4:
        return None
    sub = rets.loc[sessions]
    return {"start": sessions[0].date(), "end": sessions[-1].date(),
            "asset": float(np.prod(1 + sub["asset"]) - 1), "benchmark": float(np.prod(1 + sub["bench"]) - 1),
            "abnormal": float(ar.loc[sessions].sum())}


def _peaks(points: list[dict], limit: int) -> tuple[list[dict], float | None]:
    """Days above mean + 2 σ of the intensity, strongest first, at most one per 3 days, `limit` at most."""
    values = np.array([p["value"] for p in points])
    if values.size < 5:
        return [], None
    threshold = float(values.mean() + 2 * values.std())
    kept: list[dict] = []
    for p in sorted((p for p in points if p["value"] > threshold), key=lambda p: -p["value"]):
        day = date.fromisoformat(p["date"])
        if all(abs((day - date.fromisoformat(k["date"])).days) > 2 for k in kept):
            kept.append(p)
        if len(kept) >= limit:
            break
    return kept, threshold


def _federal_register(ctx: Context, start: date, end: date) -> list[dict[str, Any]]:
    question = "Quels documents de la présidence américaine garder ?"
    rule = f"mots clés du titre : {federal_register.TERMS_LABEL}"
    try:
        info = ctx.state.get("asset", {})
        sector = f"{info.get('sector') or ''} {info.get('asset_class') or ''}"
        docs, total, hit = fetch.get(ctx, "federal_register",
                                     lambda: federal_register.policy_documents(start, end, sector))
    except OverBudget as exc:
        fetch.over_budget(ctx, exc, "Federal Register", question, "aucun (budget de temps dépassé)",
                          "aucune décision politique américaine utilisée.", rule)
        return []
    except ExternalUnavailable as exc:
        ctx.warn(f"Federal Register indisponible ({exc.reason}) : aucune décision politique américaine utilisée.")
        ctx.decide(question, "aucun (Federal Register injoignable)", f"API indisponible ({exc.reason}) : rien "
                   "n'est inventé.", rule)
        return []
    sid = ctx.source("federal_register", "Federal Register, documents présidentiels (décrets, proclamations, "
                     "mémorandums)", federal_register.SEARCH_URL, end.isoformat())
    ctx.decide(question, f"{len(docs)} sur {total}", "Documents signés dans la fenêtre qui touchent au commerce, "
               f"aux tarifs ou aux sanctions, ou au secteur du titre ({info.get('sector') or 'n.d.'}) ; nominations, "
               "commémorations et renouvellements d'urgences écartés." + (" (cache)" if hit else ""), rule)
    ctx.dataset_records("federal_register", "Documents présidentiels retenus (Federal Register)", docs, sid,
                        ("signing_date", "subtype", "executive_order_number", "title", "html_url"))
    return [{"date": date.fromisoformat(d["signing_date"]), "kind": US_POLICY, "label": federal_register.label(d),
             "source_id": sid, "url": d.get("html_url"), "text_url": d.get("raw_text_url"), "category": "politique"}
            for d in docs]


def _political_coverage(ctx: Context, start: date, end: date) -> list[dict[str, Any]]:
    question = "Quels jours la couverture des tarifs et des sanctions culmine-t-elle ?"
    rule = f"seuil = moyenne + 2 écarts-types, un pic par 3 jours, {POLITICAL_PEAKS_MAX} au plus"
    try:
        tl = fetch.get(ctx, "gdelt_political", lambda: gdelt.timeline_for_query(gdelt.POLITICAL_QUERY, start, end))
    except OverBudget as exc:
        fetch.over_budget(ctx, exc, "Couverture GDELT des tarifs et sanctions", question,
                          "inconnu (budget de temps dépassé)", "seules les sources officielles sont utilisées.", rule)
        return []
    except ExternalUnavailable as exc:
        ctx.warn(f"GDELT indisponible pour les tarifs et sanctions ({exc.reason}) : seules les sources officielles "
                 "sont utilisées.")
        ctx.decide(question, "inconnu (GDELT injoignable)", f"GDELT indisponible ({exc.reason}).", rule)
        return []
    sid = ctx.source("gdelt_political", f"GDELT DOC 2.0, intensité de couverture, {tl.query}", tl.url,
                     end.isoformat())
    peaks, threshold = _peaks(tl.points, POLITICAL_PEAKS_MAX)
    ctx.decide(question, f"{len(peaks)} pic(s)", f"{len(tl.points)} jours de couverture mondiale" +
               (f" ; seuil d'intensité {threshold:.4f}." if threshold is not None else " : trop peu pour un seuil."),
               rule, {"requête": tl.query})
    return [{"date": date.fromisoformat(p["date"]), "kind": POLITICAL_PEAK,
             "label": (p["articles"][0]["title"] if p["articles"] else "pic de couverture des tarifs et sanctions"),
             "source_id": sid, "url": p["articles"][0]["url"] if p["articles"] else None, "intensity": p["value"],
             "category": "politique"} for p in peaks]


def political_events(ctx: Context) -> None:
    ctx.state["political_events"] = []
    source = ctx.opt("source")
    if source == "none":
        _mark_key_events(ctx)  # rate decisions and leadership changes stay key events
        raise StageSkipped("Événements politiques désactivés.")
    start, end = ctx.inputs.start, ctx.inputs.end
    events = []
    if source in {"both", "federal_register"}:
        events += _federal_register(ctx, start, end)
    if source in {"both", "gdelt"}:
        events += _political_coverage(ctx, start, end)
    events.sort(key=lambda e: e["date"])
    ctx.state["political_events"] = events
    ctx.metric("décisions politiques US", sum(1 for e in events if e["kind"] == US_POLICY))
    ctx.metric("pics de couverture tarifs et sanctions", sum(1 for e in events if e["kind"] == POLITICAL_PEAK))
    _mark_key_events(ctx)
    ctx.report.limit("Événements politiques : décisions de la présidence américaine (Federal Register) et couverture "
                     "médiatique mondiale (GDELT) ; les décisions politiques canadiennes ne sont vues qu'à travers la "
                     "presse.")


def _mark_key_events(ctx: Context) -> None:
    """Flags (`key`) the political, rate and leadership events the title reacted to most over two sessions,
    plus those whose reaction contains a marked move."""
    pool = [e for e in all_events(ctx) if e["kind"] in {US_POLICY, POLITICAL_PEAK} | RATE_KINDS or is_leadership(e)]
    marked = {m["date"] for m in ctx.state.get("moves") or []}
    for e in pool:
        e["reaction"] = reaction(ctx, e["date"])
        r = e["reaction"]
        e["on_move"] = bool(r) and any(r["start"] <= d <= r["end"] for d in marked)
    ranked = sorted((e for e in pool if e["reaction"]),
                    key=lambda e: (-abs(e["reaction"]["asset"]), KIND_RANK.get(e["kind"], 3)))
    key: list[dict[str, Any]] = []
    per_day: dict[date, int] = {}
    for e in ranked:
        day = e["reaction"]["start"]
        if len(key) < KEY_EVENTS_MAX and per_day.get(day, 0) < KEY_EVENTS_PER_DAY:
            key.append(e)
            per_day[day] = per_day.get(day, 0) + 1
    for e in key:
        e["key"] = True
    columns = ["date", "type", "libellé", "titre (2 séances)", "indice (2 séances)", "écart", "mouvement marquant",
               "retenu"]
    rows = [[e["date"], e["kind"], e["label"], e["reaction"]["asset"], e["reaction"]["benchmark"],
             e["reaction"]["abnormal"], e["on_move"], bool(e.get("key"))] for e in ranked]
    ctx.preview(columns, rows)
    ctx.dataset("reactions", "Réaction du titre et de l'indice sur deux séances à chaque événement politique, de "
                "taux ou de direction", columns, rows)
    ctx.decide("Quels événements clés retenir pour la période ?", f"{len(key)} sur {len(pool)}",
               f"Les {KEY_EVENTS_MAX} décisions politiques, pics de couverture, décisions de taux et changements de "
               "direction (8-K 5.02) où le titre a le plus bougé sur deux séances, "
               f"{KEY_EVENTS_PER_DAY} au plus par séance.", "classement par |rendement du titre sur deux séances|",
               {"événements": len(pool), "avec réaction calculable": len(ranked)})
    ctx.metric("événements clés", len(key))


# --- crawl ---------------------------------------------------------------------------------------

def _host(url: str) -> str:
    return urlsplit(url).netloc.removeprefix("www.")


def crawl(ctx: Context) -> None:
    ctx.state["candidates"] = []
    found = ctx.state.get("moves") or []
    events = all_events(ctx)
    candidates = []
    for e in events:
        near = [m for m in found if m["date"] - timedelta(days=EVENT_LOOKBACK_DAYS) <= e["date"]
                <= m["date"] + timedelta(days=READ_AFTER_DAYS)]
        if near or e.get("key"):
            # key events come after the events near a move, by the size of the title's reaction
            e["near_ar"] = max(abs(m["ar"]) for m in near) if near else abs(e["reaction"]["abnormal"]) / 10
            candidates.append(e)
    if not candidates:
        raise StageSkipped("Aucun événement proche d'un mouvement marquant ni événement clé : rien à lire.")
    _ensure_ids(candidates)
    ctx.state["candidates"] = candidates
    ctx.decide("Quels événements examiner ?", f"{len(candidates)} sur {len(events)}",
               f"Événements datés de {EVENT_LOOKBACK_DAYS} jours avant à {READ_AFTER_DAYS} jours après un mouvement "
               "marquant (un article paraît souvent après le fait qu'il rapporte), puis les événements clés de la "
               "période ; les autres sont écartés.",
               f"fenêtre de lecture : −{EVENT_LOOKBACK_DAYS} à +{READ_AFTER_DAYS} jours autour d'un mouvement",
               {"mouvements": len(found), "événements datés": len(events),
                "événements clés": sum(1 for e in candidates if e.get("key"))})
    readable = sorted((e for e in candidates if e.get("url") and e["kind"] in CRAWLABLE),
                      key=lambda e: -e["near_ar"])
    if ctx.opt("enabled") == "off":
        ctx.decide("Lire les pages des événements ?", "non", "Crawler désactivé : chaque événement garde son "
                   "libellé.", "option enabled = off")
        _crawl_outputs(ctx, candidates)
        return
    limit = int(ctx.opt("max_pages"))
    chosen = readable[:limit]
    ctx.decide("Quelles pages lire ?", f"{len(chosen)} sur {len(readable)}",
               "Articles, dépôts 8-K et documents présidentiels proches des plus grands mouvements d'abord, puis "
               "ceux des événements clés ; dividendes, 10-Q, 10-K et décisions de taux gardent leur libellé.",
               f"option max_pages = {limit}")
    budget = fetch.budget_of(ctx)
    crawl_deadline = fetch.deadline(ctx, budget.crawl_s) if budget else None
    # Federal Register: the raw text (its HTML pages refuse robots); 8-K: its press release, looked up side by side
    exhibit_of = crawler.press_releases([e["url"] for e in chosen if e["kind"] == "8-K"], crawl_deadline)
    targets: dict[str, str] = {}
    exhibits = 0
    for e in chosen:
        url = e.get("text_url") or e["url"]
        if e["kind"] == "8-K" and exhibit_of.get(url):
            url, exhibits = exhibit_of[url], exhibits + 1
        targets[e["id"]] = url
    if any(e["kind"] == "8-K" for e in chosen):
        n_8k = sum(1 for e in chosen if e["kind"] == "8-K")
        ctx.decide("Que lire pour un 8-K ?", f"{exhibits} communiqué(s) sur {n_8k} dépôt(s)",
                   "Le communiqué de presse joint au dépôt (pièce 99) quand l'index du dépôt en contient un, sinon "
                   "le formulaire lui-même.", "pièce 99.x de index.json, sinon document principal")
    pages = crawler.fetch_many(list(targets.values()), crawl_deadline)
    read, failed, late = 0, [], 0
    for e in chosen:
        e["read_url"] = targets[e["id"]]
        page = pages.get(targets[e["id"]])
        if isinstance(page, crawler.Page):
            read += 1
            # SEC documents are often titled « Document » or by their file name: the event's label says more
            title = page.title if " " in page.title and page.title.lower() not in GENERIC_TITLES \
                and e["kind"] != US_POLICY else e["label"]
            shown = e["url"] if e["kind"] == US_POLICY else page.final_url
            sid = ctx.source(f"web_{e['id']}", f"{_host(shown)} : {title}"[:200], shown, page.published)
            e.update(page_title=title, page_description=page.description, page_text=page.text,
                     published=page.published, page_source_id=sid,
                     read="lue (cache)" if page.from_cache else "lue")
        else:
            reason = page.reason if isinstance(page, ExternalUnavailable) else "non lue"
            e["read"] = f"non lue : {reason}"
            failed.append(f"{_host(targets[e['id']])} ({reason})")
            late += reason == crawler.OVER_BUDGET
    if chosen:
        ctx.decide("Combien de pages lues ?", f"{read} sur {len(chosen)}",
                   "Toutes les pages ont été lues." if not failed else
                   "Non lues : " + "; ".join(failed[:6]) + (" …" if len(failed) > 6 else "") + ".",
                   "robots.txt respecté ; HTML ou texte seulement ; 1,5 Mo au plus par page")
    if late and budget is not None:
        budget.skip(f"lecture de {late} page(s)")
        ctx.decide("Attendre les pages encore en lecture ?", f"non, {late} laissée(s) de côté",
                   f"{late} page(s) n'étaient pas lues au bout de {budget.crawl_s:g} s : leurs événements gardent leur "
                   "titre ; la lecture continue en arrière-plan et une prochaine analyse les reprend (cache).",
                   f"budget de temps de la page titre : {budget.crawl_s:g} s pour les pages")
    if failed:
        ctx.warn(f"{len(failed)} page(s) non lue(s) (robots.txt, accès refusé ou délai dépassé) : leurs événements "
                 "gardent leur titre seul.")
    ctx.metric("événements examinés", len(candidates))
    ctx.metric("pages demandées", len(chosen))
    ctx.metric("pages lues", read)
    ctx.metric("communiqués 8-K (pièce 99)", exhibits)
    _crawl_outputs(ctx, candidates)
    ctx.report.assume("Crawler web : seuls les articles et dépôts 8-K proches d'un mouvement marquant sont lus, "
                      "dans le respect du robots.txt de chaque site ; les pages payantes ou refusées gardent leur titre.")


def _crawl_outputs(ctx: Context, candidates: list[dict[str, Any]]) -> None:
    columns = ["id", "date", "type", "libellé", "lecture", "titre de la page", "url"]
    rows = [[e["id"], e["date"], e["kind"], e["label"], e.get("read", "non demandée"), e.get("page_title"),
             e.get("read_url") or e.get("url")] for e in candidates]
    ctx.preview(columns, rows)
    ctx.dataset("candidates", "Événements proches d'un mouvement et lecture de leur page", columns, rows)
    ctx.dataset_records("pages", "Texte retenu de chaque page lue (titre, description, date, extrait)",
                        ({"id": e["id"], "url": e.get("read_url"), "titre": e.get("page_title"),
                          "description": e.get("page_description"), "date de publication": e.get("published"),
                          "extrait": e.get("page_text")} for e in candidates if e.get("page_source_id")))


# --- digest ----------------------------------------------------------------------------------------

def _default_digest(e: dict[str, Any]) -> None:
    e["event_date"] = e["date"]
    e["summary"] = (e.get("page_description") or e.get("page_title") or e["label"]).strip()[:300]
    e["summary_by"] = "source"
    e["category"] = default_category(e)
    e.setdefault("relevant", True)


def _page_text(e: dict[str, Any]) -> str:
    return "\n".join(str(e.get(k) or "") for k in ("label", "page_title", "page_description", "page_text"))


def ungrounded_numbers(text: str, source: str) -> list[str]:
    """Numbers of `text` that the source does not contain (same tolerance as the governance check)."""
    pool = [t.value for t in governance.extract_numbers(source)]
    return governance.unsupported_numbers(text, pool)


def _day(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value)[:10]) if value else None
    except ValueError:
        return None


def digest(ctx: Context) -> None:
    candidates = ctx.state.get("candidates") or []
    for e in candidates:
        _default_digest(e)
    if not candidates:
        raise StageSkipped("Aucun événement proche d'un mouvement : rien à résumer.")
    to_read = [e for e in candidates if e["kind"] in CRAWLABLE]
    choice = ctx.opt("model")
    question, rule = "Qui résume et date les événements ?", f"option model = {choice}"
    if choice == "none" or not to_read:
        ctx.decide(question, "la source (titre ou description de la page)",
                   "Aucun modèle demandé." if choice == "none" else "Aucun article ni 8-K à résumer : décisions de "
                   "taux, dividendes et rapports gardent leur libellé.", rule)
        _digest_outputs(ctx, candidates)
        return
    info = ctx.state.get("asset", {})

    def facts(chunk: list[dict[str, Any]]) -> dict[str, Any]:
        return {"ticker": ctx.inputs.ticker, "name": info.get("name"), "events": [
            {"id": e["id"], "type": e["kind"], "published": e["date"].isoformat(),
             "title": e.get("page_title") or e["label"],
             "excerpt": "\n".join(x for x in (e.get("page_description"), e.get("page_text")) if x)[:1500]}
            for e in chunk]}

    model_id = narration.model_id_for(choice)
    chunks = fetch.chunked(to_read, DIGEST_CHUNK, fetch.MODEL_WORKERS)
    answers = fetch.parallel(lambda chunk: narration.digest_events(facts(chunk), choice), chunks)
    errors = [exc for _, exc in answers if exc is not None]
    items = [item for got, exc in answers if exc is None for item in got or []]
    if len(errors) == len(chunks):  # Bedrock / AgentCore failure: the sources' own titles are kept
        name = type(errors[0]).__name__
        ctx.state.setdefault("degraded", []).append("résumés Haiku")
        ctx.warn(f"Résumés Haiku indisponibles ({name}) : titres et descriptions des pages repris.")
        ctx.decide(question, "la source (repli)", f"Appel à {model_id} en échec ({name}) : rien "
                   "n'est inventé, les titres et descriptions des pages sont repris.", rule)
        _digest_outputs(ctx, candidates)
        return
    ctx.source("bedrock_digest", f"Amazon Bedrock, {model_id} (résumé et datation des événements)")
    ctx.decide(question, model_id, "Haiku résume chaque article ou 8-K à partir de la page lue ; chaque résumé et "
               "chaque date sont vérifiés avant d'être gardés.", rule,
               {"événements": len(to_read), "appels en parallèle": len(chunks)})
    if errors:
        missed = sum(len(c) for c, (_, exc) in zip(chunks, answers, strict=True) if exc is not None)
        ctx.state.setdefault("degraded", []).append("résumés Haiku (en partie)")
        ctx.warn(f"Résumés Haiku en partie indisponibles ({type(errors[0]).__name__}) : {missed} événement(s) gardent "
                 "le titre et la description de leur page.")
        ctx.decide("Que faire des événements dont l'appel a échoué ?", "titre et description de la page",
                   f"{len(errors)} appel(s) sur {len(chunks)} en échec : rien n'est inventé pour ces {missed} "
                   "événement(s).", f"{DIGEST_CHUNK} événements au plus par appel")
    by_id = {e["id"]: e for e in to_read}
    kept = refused = redated = off_topic = 0
    for item in items:
        e = by_id.get(str(item.get("id")))
        if e is None:
            continue
        summary = str(item.get("summary") or "").strip()
        bad = ungrounded_numbers(summary, _page_text(e)) if summary else []
        if summary and not bad:
            e["summary"], e["summary_by"] = summary[:400], "haiku"
            kept += 1
        elif summary:
            refused += 1
            ctx.decide(f"Garder le résumé Haiku de l'événement {e['id']} ?", "non",
                       f"Chiffres absents de la page : {', '.join(bad)} ; le titre de la source est repris.",
                       "chaque chiffre du résumé figure dans la page lue")
        category = _plain(str(item.get("category") or ""))
        e["category"] = next((c for c in CATEGORIES if _plain(c) == category), e["category"])
        proposed = _day(item.get("event_date"))
        if proposed and proposed != e["date"]:
            ok = e["date"] - timedelta(days=DIGEST_MAX_SHIFT_DAYS) <= proposed <= e["date"]
            redated += ok
            if ok:
                e["event_date"] = proposed
            ctx.decide(f"Redater l'événement {e['id']} ?", f"oui, au {proposed}" if ok else "non",
                       f"Haiku date le fait rapporté au {proposed}, publié le {e['date']}." if ok else
                       f"Date proposée ({proposed}) hors de la semaine qui précède la publication ({e['date']}).",
                       f"date du fait entre la publication − {DIGEST_MAX_SHIFT_DAYS} jours et la publication")
        if item.get("relevant") is False:
            e["relevant"] = False
            off_topic += 1
            ctx.decide(f"Garder l'événement {e['id']} ?", "non", f"Haiku juge que « {e['label'][:90]} » ne concerne "
                       f"pas {info.get('name') or ctx.inputs.ticker} : écarté du rapprochement.",
                       "événement hors sujet écarté")
    ctx.metric("résumés Haiku gardés", kept)
    ctx.metric("résumés refusés (chiffre absent de la page)", refused)
    ctx.metric("événements redatés", redated)
    ctx.metric("événements hors sujet écartés", off_topic)
    if refused:
        ctx.warn(f"{refused} résumé(s) Haiku refusé(s) : chiffre absent de la page lue.", limit=False)
    ctx.report.assume("Résumés et dates des événements proposés par Claude Haiku à partir des pages lues ; un résumé "
                      "n'est gardé que si chacun de ses chiffres figure dans la page, une date que si elle tombe dans "
                      "la semaine qui précède la publication.")
    _digest_outputs(ctx, candidates)


def _digest_outputs(ctx: Context, candidates: list[dict[str, Any]]) -> None:
    columns = ["id", "date de la source", "date du fait", "catégorie", "pertinent", "résumé", "résumé par"]
    rows = [[e["id"], e["date"], when(e), e["category"], e.get("relevant", True), e["summary"], e["summary_by"]]
            for e in candidates]
    ctx.preview(columns, rows)
    ctx.dataset("digest", "Résumé, date et catégorie de chaque événement", columns, rows)


# --- plausibility ------------------------------------------------------------------------------------

def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("’", "'")).strip().lower()


def _verbatim(excerpt: str, e: dict[str, Any]) -> bool:
    if len(excerpt.strip()) < 4:
        return False
    haystack = _norm(" ".join(str(e.get(k) or "") for k in ("summary", "label", "page_title")))
    return _norm(excerpt) in haystack




def best_event(move: dict[str, Any]) -> dict[str, Any] | None:
    """Without a judgement: an official source before press coverage; among them an 8-K (material event)
    first, then a political or rate decision, then a periodic report or a dividend; then the closest."""
    events = move.get("events") or []
    if not events:
        return None
    return min(events, key=lambda e: (not is_primary(e), KIND_RANK.get(e["kind"], 3),
                                      (move["date"] - when(e)).days))


def _plain(text: str) -> str:
    """Lower case, no accents, single spaces: « Économique » → « economique »."""
    return _norm(unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode())


def _verdict_key(raw: Any) -> str:
    key = _plain(str(raw or "")).replace(" ", "_")
    return key if key in VERDICTS else "indetermine"


def plausibility(ctx: Context) -> None:
    found = ctx.state.get("moves") or []
    for m in found:
        _ensure_ids(m.get("events") or [])
        m["link"] = {"verdict": "non jugé" if m.get("events") else "aucun événement", "event_id": None,
                     "reason": "Lien non jugé : simple proximité dans le temps." if m.get("events") else
                     "Aucun événement daté dans les jours qui précèdent ce mouvement.", "excerpt": "", "by": "règle"}
    judged = sorted((m for m in found if m.get("events")), key=lambda m: -abs(m["ar"]))[:JUDGED_MOVES_MAX]
    choice = ctx.opt("model")
    question, rule = "Qui juge les liens entre mouvements et événements ?", f"option model = {choice}"
    links = None
    if not judged:
        ctx.decide(question, "personne", "Aucun mouvement n'a d'événement proche : rien à juger.", rule)
    elif choice == "none":
        ctx.decide(question, "personne (proximité seulement)", "Aucun modèle demandé : chaque lien reste une simple "
                   "proximité dans le temps.", rule)
    else:
        model_id = narration.model_id_for(choice)
        info = ctx.state.get("asset", {})
        moves = [{"move_id": f"m{i}", "date": m["date"].isoformat(), "direction": "hausse" if m["ar"] > 0 else "baisse",
                  "events": [{"event_id": e["id"], "date": when(e).isoformat(), "type": e["kind"],
                              "title": e.get("page_title") or e["label"], "summary": e.get("summary")}
                             for e in m["events"]]} for i, m in enumerate(judged)]
        head = {"ticker": ctx.inputs.ticker, "name": info.get("name"), "benchmark": ctx.state.get("bench")}
        answers = fetch.parallel(lambda chunk: narration.judge_links({**head, "moves": chunk}, choice),
                                 fetch.chunked(moves, LINKS_CHUNK))
        errors = [exc for _, exc in answers if exc is not None]
        if len(errors) == len(answers):  # Bedrock / AgentCore failure: proximity only, nothing invented
            name = type(errors[0]).__name__
            ctx.state.setdefault("degraded", []).append("jugement Haiku des liens")
            ctx.warn(f"Jugement Haiku des liens indisponible ({name}) : simple proximité dans le temps.")
            ctx.decide(question, "personne (repli)", f"Appel à {model_id} en échec ({name}) : chaque "
                       "lien reste une simple proximité dans le temps.", rule)
        else:
            links = [item for got, exc in answers if exc is None for item in got or []]
            if errors:
                ctx.state.setdefault("degraded", []).append("jugement Haiku des liens (en partie)")
                ctx.warn(f"Jugement Haiku en partie indisponible ({type(errors[0]).__name__}) : les mouvements de "
                         "l'appel en échec restent une simple proximité dans le temps.")
        if links is not None:
            ctx.source("bedrock_links", f"Amazon Bedrock, {model_id} (jugement des liens mouvement-événement)")
            ctx.decide(question, model_id, f"Haiku juge les {len(judged)} plus grands mouvements qui ont un événement "
                       "proche ; un lien n'est gardé « plausible » que si l'événement est l'un des proches et que "
                       "l'extrait cité y figure mot pour mot.", f"{rule} ; {JUDGED_MOVES_MAX} mouvements au plus, "
                       f"{LINKS_CHUNK} par appel, appels en parallèle", {"appels": len(answers)})
            _apply_links(ctx, judged, links)
    for m in found:
        _explain(m)
    _confidence_after_links(ctx, found, links is not None)
    _links_outputs(ctx, found)


def _apply_links(ctx: Context, judged: list[dict[str, Any]], links: list[dict[str, Any]]) -> None:
    by_id = {f"m{i}": m for i, m in enumerate(judged)}
    for item in links:
        m = by_id.get(str(item.get("move_id")))
        if m is None:
            continue
        verdict = _verdict_key(item.get("verdict"))
        event = next((e for e in m["events"] if e["id"] == item.get("event_id")), None)
        excerpt = str(item.get("excerpt") or "").strip()
        why_not = None
        if verdict == "plausible" and event is None:
            why_not = "événement cité absent des événements proches"
        elif verdict == "plausible" and not _verbatim(excerpt, event):
            why_not = "extrait cité absent de l'événement"
        if why_not:
            verdict = "indetermine"
        reason = str(item.get("reason") or "").strip()
        if not reason or ungrounded_numbers(reason, _page_text(event or {"label": ""})):
            reason = "Raison non retenue (vide ou chiffrée sans source)."
        m["link"] = {"verdict": VERDICTS[verdict], "event_id": event["id"] if event else None, "reason": reason[:300],
                     "excerpt": excerpt if event and _verbatim(excerpt, event) else "", "by": "haiku"}
        ctx.decide(f"Lien du mouvement du {m['date']} ?", VERDICTS[verdict],
                   reason + (f" (« plausible » refusé : {why_not}.)" if why_not else ""),
                   "plausible seulement si l'événement est l'un des proches et que l'extrait y figure mot pour mot",
                   {"événement": event["label"][:120] if event else "aucun", "rendement anormal": m["ar"]})


def _explain(m: dict[str, Any]) -> None:
    link = m["link"]
    events = m.get("events") or []
    chosen = next((e for e in events if e["id"] == link["event_id"]), None) or best_event(m)
    if not events or link["verdict"] == "peu plausible":
        kind = "aucun_evenement"
    elif link["verdict"] == "plausible" and chosen is not None and is_primary(chosen):
        kind = "fait"
    else:
        kind = "hypothese"
    m["explanation"] = kind
    m["link_event"] = chosen if kind != "aucun_evenement" else None


def _confidence_after_links(ctx: Context, found: list[dict[str, Any]], judged: bool) -> None:
    inputs = ctx.state.get("confidence_inputs")
    if not judged or not inputs or not found:
        return
    plausible = sum(1 for m in found if m["link"]["verdict"] == "plausible")
    share = plausible / len(found)
    level, why, rule = confidence_level(inputs["n_days"], len(found), inputs["has_events"], inputs["fit"], share)
    before = ctx.state.get("confidence")
    ctx.decide("Niveau de confiance après le jugement des liens ?", level, why[0].upper() + why[1:] + ".",
               f"{rule} (règles testées dans l'ordre ; part = mouvements avec un lien jugé plausible)",
               {"part plausible": share, "confiance avant": before})
    ctx.state["confidence"] = level
    for i, f in enumerate(ctx.report.factors):
        if f.name == "Niveau de confiance de l'explication":
            ctx.report.factors[i] = f.model_copy(update={"value": level, "effect": why})
    ctx.report.factor("Part des mouvements avec un lien jugé plausible", share, "ratio")
    ctx.metric("liens jugés plausibles", plausible)


def _links_outputs(ctx: Context, found: list[dict[str, Any]]) -> None:
    columns = ["date du mouvement", "rendement anormal", "explication", "verdict", "événement", "raison", "extrait"]
    rows = [[m["date"], m["ar"], EXPLANATIONS[m["explanation"]], m["link"]["verdict"],
             (m["link_event"] or {}).get("label"), m["link"]["reason"], m["link"]["excerpt"]] for m in found]
    ctx.preview(columns, rows)
    ctx.dataset("explanations", "Explication de chaque mouvement : fait daté, hypothèse ou aucun événement",
                columns, rows)
    ctx.metric("faits datés", sum(1 for m in found if m["explanation"] == "fait"))
    ctx.metric("hypothèses", sum(1 for m in found if m["explanation"] == "hypothese"))
    ctx.metric("sans événement", sum(1 for m in found if m["explanation"] == "aucun_evenement"))
    for m in found[:5]:
        e = m["link_event"]
        if e is None:
            effect = "aucun événement daté proche" if not m.get("events") else \
                f"aucun lien plausible ({m['link']['reason'][:140]})"
            source_id = None
        else:
            head = "fait daté, lien jugé plausible" if m["explanation"] == "fait" else \
                f"hypothèse (lien {m['link']['verdict']})"
            effect = f"{head} : {e['kind']} du {when(e)} — {e.get('summary') or e['label']}"[:300]
            source_id = e.get("page_source_id") or e.get("source_id")
        ctx.report.factor(f"Mouvement du {m['date']}", m["ar"], "ratio", effect=effect, source_id=source_id)
    ctx.report.assume("Explication de chaque mouvement : « fait daté » si un événement de l'émetteur ou d'une banque "
                      "centrale le précède et que le lien est jugé plausible, « hypothèse » pour un lien possible "
                      "mais non établi, « aucun événement » sinon ; aucune n'est une preuve de causalité.")


# --- key events of the period -------------------------------------------------------------------------

def _pct(ratio: float) -> str:
    return f"{ratio * 100:+.1f} %".replace(".", ",").replace("-", "−")


def key_events(ctx: Context) -> None:
    every = [e for e in all_events(ctx) if e.get("key")]
    kept = sorted((e for e in every if e.get("relevant", True)), key=when)
    ctx.state["key_events"] = kept
    if not every:
        raise StageSkipped("Aucun événement politique, de taux ou de direction avec une réaction calculable.")
    ctx.decide("Quels événements clés montrer ?", f"{len(kept)} sur {len(every)}",
               "Événements clés de la période" + (f" ; {len(every) - len(kept)} jugé(s) hors sujet par Haiku "
                                                  "écarté(s)." if len(kept) < len(every) else "."),
               "événements pertinents seulement", {"sur un mouvement marquant": sum(e["on_move"] for e in kept)})
    bench = ctx.state.get("bench") or "l'indice"
    for e in sorted(kept, key=lambda e: -abs(e["reaction"]["asset"]))[:5]:
        r = e["reaction"]
        ctx.report.factor(f"Événement {default_category(e)} du {when(e)} : {(e.get('summary') or e['label'])[:140]}",
                          r["asset"], "ratio",
                          effect=f"titre {_pct(r['asset'])}, {bench} {_pct(r['benchmark'])} sur deux séances "
                                 f"({r['start']} → {r['end']}), écart {_pct(r['abnormal'])}",
                          source_id=e.get("page_source_id") or e.get("source_id"))
    columns = ["date", "catégorie", "type", "résumé", "titre", "indice", "écart", "mouvement marquant"]
    rows = [[when(e), default_category(e), e["kind"], e.get("summary") or e["label"], e["reaction"]["asset"],
             e["reaction"]["benchmark"], e["reaction"]["abnormal"], e["on_move"]] for e in kept]
    ctx.preview(columns, rows)
    ctx.dataset("key_events", "Événements clés et réaction du titre sur deux séances", columns, rows)
    ctx.metric("événements clés montrés", len(kept))
    ctx.report.assume("Réaction à un événement : rendement du titre et de l'indice sur la séance de l'événement (ou la "
                      "suivante s'il tombe un jour sans cotation) et la séance d'après ; écart = somme des rendements "
                      "anormaux quotidiens. Un événement politique ou une décision de taux touche souvent tout le "
                      "marché : l'écart avec l'indice isole ce qui est propre au titre.")
