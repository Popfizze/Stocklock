"""Group runs of the Labo: catalog flags, group resolution, time budget, per-title summaries and table."""

import time

import pandas as pd
import pytest

from app.data import http
from app.pipeline import batch
from app.pipeline.registry import STEPS
from app.services import lab_groups, sections

SCORE_INPUTS = {"portfolio": ["XIU.TO"]}
NO_NARRATION = {"narration.model": "none"}


@pytest.fixture(autouse=True)
def starter_sectors(monkeypatch):
    """No data bucket in tests: sectors come from the starter kit."""
    monkeypatch.setattr(lab_groups, "_scored_universe", lambda: None)
    lab_groups.reset()
    yield
    lab_groups.reset()


def _batch(client, step, group, inputs=None, options=None, persona="amira"):
    return client.post("/api/lab/run-batch", json={"step": step, "persona_id": persona, "group": group,
                                                  "inputs": inputs or {}, "options": options or NO_NARRATION})


def test_catalog_says_which_steps_run_on_a_group(client):
    steps = {s["id"]: s for s in client.get("/api/lab/pipelines").json()["steps"]}
    assert {k: (s["group_runnable"], s["group_input"]) for k, s in steps.items()} == {
        "score": (True, "ticker"), "explain_move": (True, "ticker"), "bias": (True, "ticker"), "tax": (False, None)}


def test_groups_catalog_lists_sections_and_kit_sectors(client):
    body = client.get("/api/lab/groups").json()
    assert body["max_titles"] == lab_groups.MAX_TITLES == 25
    assert [s["id"] for s in body["sections"]] == list(sections.BY_ID)
    sectors = {s["name"]: s["count"] for s in body["sectors"]}
    assert sectors["Financials"] >= 3 and body["sectors_source"] == lab_groups.STARTER_SOURCE


def test_score_batch_summarises_each_title_and_builds_the_table(client):
    r = _batch(client, "score", {"kind": "tickers", "tickers": ["aapl", "RY.TO", "AAPL", "ZZZZZZ"]}, SCORE_INPUTS)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["group"] == {"kind": "tickers", "ref": None, "label": "Titres choisis",
                             "source": "liste envoyée par le client", "tickers": ["AAPL", "RY.TO", "ZZZZZZ"],
                             "total": 3, "truncated": False}
    items = {i["ticker"]: i for i in body["items"]}
    assert [i["ticker"] for i in body["items"]] == ["AAPL", "RY.TO", "ZZZZZZ"]  # group order kept
    aapl = items["AAPL"]
    assert aapl["status"] in {"ok", "warning"} and aapl["governance_passed"] is True
    assert aapl["key_result"]["label"] == "Score sur 100" and isinstance(aapl["key_result"]["value"], float)
    assert aapl["name"].startswith("Apple") and aapl["run_id"] and aapl["error"] is None
    assert aapl["run_request"] == {"step": "score", "persona_id": "amira",
                                   "inputs": {"portfolio": ["XIU.TO"], "ticker": "AAPL"},
                                   "options": body["options_used"]}
    stages = {d["stage"] for d in aapl["decisions"]}
    assert {"fundamentals", "events", "scoring"} <= stages
    assert any(d["question"] == "Score global ?" and d["answer"] == round(aapl["key_result"]["value"], 1)
               for d in aapl["decisions"])
    bad = items["ZZZZZZ"]
    assert bad["status"] == "error" and bad["error"].startswith("Titre non analysable") and bad["key_result"] is None
    assert body["summary"]["requested"] == 3 and body["summary"]["error"] == 1
    table = body["table"]
    keys = [c["key"] for c in table["columns"]]
    assert keys[:3] == ["ticker", "name", "status"] and "score" in keys and keys[-1] == "governance"
    assert all(set(row) == set(keys) for row in table["rows"])
    row = next(row for row in table["rows"] if row["ticker"] == "AAPL")
    assert row["score"] == aapl["key_result"]["value"] and 0 < row["volatility"] < 2
    assert table["default_sort"] == {"key": "score", "direction": "desc"}
    assert body["budget"]["limit_s"] == batch.BUDGET_S and body["budget"]["estimated_s"] <= batch.BUDGET_S


def test_full_run_of_one_title_is_reachable_from_its_run_request(client):
    body = _batch(client, "score", {"kind": "tickers", "tickers": ["RY.TO"]}, SCORE_INPUTS).json()
    run = client.post("/api/lab/run", json=body["items"][0]["run_request"])
    assert run.status_code == 200
    assert run.json()["key_result"] == body["items"][0]["key_result"]
    assert any(s["datasets"] for s in run.json()["stages"])


def test_explain_move_and_bias_tables(client, fake_narrator):
    moves = _batch(client, "explain_move", {"kind": "portfolio", "tickers": ["NVDA", "XOM"]},
                   {"start": "2022-01-01", "end": "2022-12-31"}).json()
    assert moves["group"]["label"] == "Portefeuille du profil"
    row = moves["table"]["rows"][0]
    assert row["benchmark"] == "QQQ" and isinstance(row["abnormal"], float) and row["main_move"]
    assert any(d["question"].startswith("Niveau de confiance") for d in moves["items"][0]["decisions"])
    bias = _batch(client, "bias", {"kind": "tickers", "tickers": ["NVDA", "TSLA"]},
                  {"message": "Tout le monde achète, je mets toute ma retraite dessus !"},
                  {**NO_NARRATION, "message_analysis.method": "lexicon"}, persona="robert").json()
    assert [r["ticker"] for r in bias["table"]["rows"]] == ["NVDA", "TSLA"]
    assert all(r["hype"] in {"oui", "non"} and r["signals"] >= 1 for r in bias["table"]["rows"])
    assert any(d["question"] == "Battage détecté ?" for d in bias["items"][0]["decisions"])


def test_sector_and_section_groups_are_resolved_server_side(client, monkeypatch):
    fin = lab_groups.resolve("sector", ref="financials", limit=2)
    assert fin.kind == "sector" and len(fin.tickers) == 2 and fin.total >= 3 and fin.truncated
    cards = [{"ticker": t, "name": f"Nom {t}"} for t in ("AAPL", "MSFT", "NVDA")]
    monkeypatch.setattr(sections, "build", lambda sid, limit: {"title": "Les plus populaires", "source": "Yahoo",
                                                               "message": None, "items": cards[:limit]})
    sec = lab_groups.resolve("section", ref="populaires", limit=2)
    assert sec.tickers == ["AAPL", "MSFT"] and sec.label == "Les plus populaires" and sec.names["AAPL"] == "Nom AAPL"


@pytest.mark.parametrize("payload, needle", [
    ({"step": "tax", "group": {"kind": "tickers", "tickers": ["AAPL"]}}, "ne s'exécute pas sur un groupe"),
    ({"step": "score", "group": {"kind": "tickers", "tickers": [f"T{i}" for i in range(26)]}}, "25 au plus"),
    ({"step": "score", "group": {"kind": "tickers", "tickers": []}}, "aucun titre"),
    ({"step": "score", "group": {"kind": "section", "ref": "inconnue"}}, "Section inconnue"),
    ({"step": "score", "group": {"kind": "sector", "ref": "Licornes"}}, "Secteur inconnu"),
    ({"step": "score", "group": {"kind": "sector"}}, "référence"),
    ({"step": "score", "group": {"kind": "tickers", "tickers": ["AAPL"]}, "options": {"scoring.weights": "x"}},
     "invalide"),
])
def test_group_runs_that_cannot_start_are_422(client, payload, needle):
    r = client.post("/api/lab/run-batch", json={"persona_id": "amira", **payload})
    assert r.status_code == 422 and needle in str(r.json()["detail"])


def test_schema_caps_the_limit(client):
    r = _batch(client, "score", {"kind": "sector", "ref": "Financials", "limit": 26})
    assert r.status_code == 422


def test_a_group_too_long_for_the_budget_is_refused_with_the_size_that_fits(client, monkeypatch):
    monkeypatch.setattr(batch, "BUDGET_S", 30.0)
    r = _batch(client, "score", {"kind": "tickers", "tickers": ["AAPL", "MSFT", "NVDA", "JPM", "XOM"]},
               options={**NO_NARRATION, "events.source": "gdelt"})
    detail = r.json()["detail"]
    assert r.status_code == 422 and "titres au plus" in detail and "GDELT" in detail
    fit = batch.largest_fitting("score", {"events.source": "gdelt", "narration.model": "none"})
    assert f"Lancez {fit} titres au plus" in detail and batch.estimate_s("score", {"events.source": "gdelt"}, fit) <= 30


def test_estimate_counts_serialized_gdelt_and_bedrock_calls():
    assert batch.gdelt_calls("score", {"events.source": "gdelt_then_yfinance_news"}, 10) == 10
    assert batch.gdelt_calls("score", {"events.source": "yfinance_news"}, 10) == 0
    assert batch.gdelt_calls("explain_move", {"world_events.source": "gdelt", "political_events.source": "both"},
                             10) == 11
    assert batch.bedrock_calls({"narration.model": "haiku", "digest.model": "none",
                                "message_analysis.method": "both"}) == 2
    assert batch.estimate_s("score", {"events.source": "gdelt"}, 25) == 25 * batch.GDELT_CALL_S + batch.OVERHEAD_S
    # every group-runnable step fits with its Lab defaults at the largest size
    for step_id, step in STEPS.items():
        if step.group_input:
            lab = {f"{s.id}.{o.key}": o.lab_default if o.lab_default is not None else o.default
                   for s in step.stages for o in s.options}
            assert batch.estimate_s(step_id, lab, lab_groups.MAX_TITLES) <= batch.BUDGET_S, step_id


def test_titles_past_the_deadline_are_reported_not_dropped(client, monkeypatch):
    monkeypatch.setattr(batch, "BUDGET_S", 0.0)
    monkeypatch.setattr(batch, "estimate_s", lambda *a: 0.0)
    body = _batch(client, "score", {"kind": "tickers", "tickers": ["AAPL", "RY.TO"]}, SCORE_INPUTS).json()
    assert [i["status"] for i in body["items"]] == ["timeout", "timeout"]
    assert all("temps imparti" in i["error"] and i["run_request"]["inputs"]["ticker"] == i["ticker"]
               for i in body["items"])
    assert body["summary"]["timeout"] == 2 and [r["status"] for r in body["table"]["rows"]] == ["timeout"] * 2


def test_scored_universe_sectors_are_preferred_and_sorted_by_market_cap(monkeypatch):
    frame = pd.DataFrame({"symbol": ["A", "B", "C"], "name": ["a", "b", "c"], "sector": ["Tech", "Tech", "Énergie"],
                          "market_cap": [1e9, 5e9, 2e9]})
    monkeypatch.setattr(lab_groups, "_scored_universe", lambda: frame)
    lab_groups.reset()
    group = lab_groups.resolve("sector", ref="tech")
    assert group.tickers == ["B", "A"] and group.source == lab_groups.SCORED_SOURCE


def test_sec_requests_share_a_rate_limit(monkeypatch):
    limiter = http.RateLimiter(20)  # 50 ms apart
    monkeypatch.setattr(http, "SEC_LIMITER", limiter)
    t0 = time.monotonic()
    for _ in range(4):
        http._throttle("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json")
    assert time.monotonic() - t0 >= 0.14
    t1 = time.monotonic()
    for _ in range(4):
        http._throttle("https://api.gdeltproject.org/api/v2/doc/doc")
    assert time.monotonic() - t1 < 0.05
