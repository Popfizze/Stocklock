"""Silver `evenements_structures`: Claude Haiku on Amazon Bedrock turns each article into one event row.

Articles are sent in batches (one Converse call per batch, a forced `record_events` tool for the JSON).
Each row: symbol, date (the article's, never the model's), event type, impact −1..+1, relevance 0..1, and
an excerpt that must be quoted from the article: an excerpt not found verbatim is replaced by the headline
and counted.
"""

from __future__ import annotations

import json
import re
import threading
from typing import Any, Callable

import pandas as pd

from app.config import get_settings
from app.score_pipeline import net
from app.score_pipeline import store as st
from app.score_pipeline.runs import RunContext, StageRecorder

BATCH = 20
WORKERS = 4
TEXT_CHARS = 600
EVENT_TYPES = ("resultats", "previsions", "fusion_acquisition", "reglementaire_juridique", "produit_contrat",
               "direction_gouvernance", "financement_dividende", "notation_analystes", "macro_secteur", "autre")
COLUMNS = ["symbol", "date", "event_type", "impact", "relevance", "excerpt", "rationale", "source", "title", "url",
           "article_id"]

SYSTEM = (
    "You read news headlines and short abstracts about listed companies and record, for each article, the "
    "event it reports for the named company. Judge only from the text given. impact: expected effect on the "
    "company's value, from -1 (very negative) to +1 (very positive), 0 when neutral or unclear. relevance: "
    "0 when the article is not about this company (a homonym, a passing mention), up to 1 when the company "
    "is its main subject. excerpt: an exact copy of consecutive words from the title or abstract (at most 25 "
    "words) that supports your judgement - never a paraphrase, a summary or a comment; when the article is not "
    "about the company, copy the first words of its title. rationale: your reason, in French, at most 15 words. "
    "Return exactly one entry per article id."
)
TOOL = {
    "toolSpec": {
        "name": "record_events",
        "description": "Record one event per article.",
        "inputSchema": {"json": {
            "type": "object",
            "properties": {"events": {"type": "array", "items": {
                "type": "object",
                "properties": {
                    "article_id": {"type": "string"},
                    "event_type": {"type": "string", "enum": list(EVENT_TYPES)},
                    "impact": {"type": "number", "minimum": -1, "maximum": 1},
                    "relevance": {"type": "number", "minimum": 0, "maximum": 1},
                    "excerpt": {"type": "string"},
                    "rationale": {"type": "string"},
                },
                "required": ["article_id", "event_type", "impact", "relevance", "excerpt", "rationale"],
            }}},
            "required": ["events"],
        }},
    }
}

Converse = Callable[[dict[str, Any]], dict[str, Any]]
_client_lock = threading.Lock()
_client: Any = None


def bedrock_converse(request: dict[str, Any]) -> dict[str, Any]:
    global _client
    with _client_lock:
        if _client is None:
            import boto3
            from botocore.config import Config

            _client = boto3.client("bedrock-runtime", region_name=get_settings().aws_region,
                                   config=Config(read_timeout=120, retries={"max_attempts": 8, "mode": "adaptive"}))
    return _client.converse(**request)


def build_request(batch: list[dict[str, Any]], model_id: str) -> dict[str, Any]:
    lines = [json.dumps({"article_id": a["id"], "company": a["company"], "symbol": a["symbol"], "date": a["date"],
                         "title": a["title"], "abstract": (a.get("text") or "")[:TEXT_CHARS]}, ensure_ascii=False)
             for a in batch]
    prompt = "Articles (one JSON object per line):\n" + "\n".join(lines)
    return {"modelId": model_id, "system": [{"text": SYSTEM}],
            "messages": [{"role": "user", "content": [{"text": prompt}]}],
            "inferenceConfig": {"maxTokens": 4000, "temperature": 0},
            "toolConfig": {"tools": [TOOL], "toolChoice": {"tool": {"name": "record_events"}}}}


def _norm(text: str) -> str:
    """Lower-case words only: quotes, dashes and spacing do not break a verbatim excerpt."""
    return " " + re.sub(r"[^0-9a-zà-ÿ]+", " ", (text or "").lower()).strip() + " "


def parse_response(response: dict[str, Any], batch: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """(event rows, excerpts replaced by the headline) from a Converse response."""
    by_id = {a["id"]: a for a in batch}
    content = (((response.get("output") or {}).get("message") or {}).get("content")) or []
    tool_input = next((c["toolUse"].get("input") for c in content if "toolUse" in c), None) or {}
    rows, replaced, seen = [], 0, set()
    for ev in tool_input.get("events") or []:
        art = by_id.get(str(ev.get("article_id")))
        if art is None or art["id"] in seen:
            continue
        seen.add(art["id"])
        excerpt = str(ev.get("excerpt") or "").strip()
        if not excerpt or _norm(excerpt) not in _norm(f"{art['title']} {art.get('text') or ''}"):
            excerpt = art["title"][:240]
            replaced += 1
        event_type = ev.get("event_type") if ev.get("event_type") in EVENT_TYPES else "autre"
        rows.append({"symbol": art["symbol"], "date": art["date"], "event_type": event_type,
                     "impact": max(-1.0, min(1.0, float(ev.get("impact") or 0))),
                     "relevance": max(0.0, min(1.0, float(ev.get("relevance") or 0))),
                     "excerpt": excerpt, "rationale": str(ev.get("rationale") or "")[:200],
                     "source": art["source"], "title": art["title"], "url": art["url"], "article_id": art["id"]})
    return rows, replaced


def cap_articles(index: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    """At most `limit` articles, taken round-robin over titles (newest first) so every title gets some."""
    queues = {s: [dict(a, symbol=s, company=v["name"]) for a in v["articles"] if a.get("date")]
              for s, v in index.items()}
    out: list[dict[str, Any]] = []
    depth = 0
    while len(out) < limit and any(len(q) > depth for q in queues.values()):
        for q in queues.values():
            if depth < len(q) and len(out) < limit:
                out.append(q[depth])
        depth += 1
    return out


def silver(ctx: RunContext, store: st.Store, rec: StageRecorder, deadline: float,
           converse: Converse = bedrock_converse) -> None:
    index = st.get_json(store, ctx.key("bronze", "articles_bruts", "articles_par_titre.json.gz"))
    total = sum(len(v["articles"]) for v in index.values())
    selected = cap_articles(index, ctx.params.max_llm_articles)
    rec.decide("parameter", f"Au plus {ctx.params.max_llm_articles} articles envoyés au modèle par run "
                            f"({total} collectés)", len(selected))
    batches = [selected[i:i + BATCH] for i in range(0, len(selected), BATCH)]
    model_id = get_settings().bedrock_fast_model_id
    usage = {"input": 0, "output": 0}
    lock = threading.Lock()

    def job(batch: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
        response = converse(build_request(batch, model_id))
        with lock:
            usage["input"] += int((response.get("usage") or {}).get("inputTokens") or 0)
            usage["output"] += int((response.get("usage") or {}).get("outputTokens") or 0)
        return parse_response(response, batch)

    rows: list[dict[str, Any]] = []
    replaced = failed_calls = 0
    failed_symbols: set[str] = set()
    ok_symbols: set[str] = set()
    for batch, result, err in net.parallel(batches, job, workers=WORKERS, deadline=deadline):
        if err is not None or result is None:
            failed_calls += 1
            failed_symbols.update(a["symbol"] for a in batch)
            rec.warnings.append(f"Lot Bedrock en échec : {type(err).__name__}: {str(err)[:160]}")
            continue
        batch_rows, n_replaced = result
        rows.extend(batch_rows)
        replaced += n_replaced
        ok_symbols.update(a["symbol"] for a in batch)
    coverage = {}
    for symbol, v in index.items():
        if v["status"] != "ok":
            coverage[symbol] = "failed"
        elif symbol in failed_symbols and symbol not in ok_symbols:
            coverage[symbol] = "failed"
        else:
            coverage[symbol] = "ok"
    frame = pd.DataFrame(rows, columns=COLUMNS)
    st.put_csv(store, rec.output(ctx.key("silver", "evenements_structures", "evenements_structures.csv")), frame)
    st.put_json(store, rec.output(ctx.key("silver", "evenements_structures", "couverture.json")), coverage)
    rec.rows["evenements_structures"] = len(frame)
    rec.rows["titres_avec_evenements"] = int(frame["symbol"].nunique()) if len(frame) else 0
    rec.metrics.update(bedrock_calls=len(batches), failed_calls=failed_calls, input_tokens=usage["input"],
                       output_tokens=usage["output"], articles_sent=len(selected), model_id=model_id)
    rec.decide("source", f"Claude Haiku sur Amazon Bedrock ({model_id}) : {BATCH} articles par appel, "
                         f"{WORKERS} appels en parallèle", len(batches))
    rec.decide("info", "Extraits non retrouvés mot pour mot dans l'article, remplacés par le titre", replaced)
    rec.decide("missing", "Appels Bedrock en échec (articles non structurés)", failed_calls)
    rec.decide("missing", "Titres sans événements exploitables faute de source ou d'appel réussi "
                          "(sous-score événements manquant)", sum(1 for v in coverage.values() if v == "failed"))
    rec.source("bedrock_haiku", f"Amazon Bedrock, {model_id}", "https://aws.amazon.com/bedrock/")
    if len(frame):
        rec.add_sample("evenements_structures",
                       frame.sort_values("relevance", ascending=False)[["symbol", "date", "event_type", "impact",
                                                                         "relevance", "excerpt"]])
