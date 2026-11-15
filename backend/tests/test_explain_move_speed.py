"""Step 2 on the stock page, fast: sources side by side, time budget, parallel model calls, warm session, cache."""

from __future__ import annotations

import io
import json
import re
import shutil
import threading
import time
from datetime import date

import pytest

from app.config import REPO_DIR, get_settings
from app.data import crawler, edgar, federal_register, gdelt
from app.data.cache import ExternalUnavailable, OverBudget
from app.personas import get_persona
from app.pipeline import explain_move
from app.pipeline import explain_move_events as ev
from app.pipeline import explain_move_fetch as fetch
from app.pipeline.core import Context, StageRecord, resolve_options
from app.pipeline.explain_move_fetch import Budget
from app.pipeline.registry import execute
from app.registry import store as rs
from app.schemas import ExplainMoveInputs
from app.score_pipeline import stages
from app.score_pipeline import store as st
from app.services import governance, moves_cache, narration
from app.services.report import Report

NVDA_CIK = 1045810
EMPTY_TIMELINE = gdelt.Timeline("q", [], False, "https://api.gdeltproject.org/test")


def _stock(client, ticker="NVDA", period="2022", persona="robert"):
    return client.post("/api/explain-move/stock", json={"persona_id": persona, "ticker": ticker, "period": period})


def _slow(seconds, value):
    def fn(*args, **kwargs):
        time.sleep(seconds)
        return value
    return fn


@pytest.fixture
def slow_sources(monkeypatch):
    """EDGAR, the Federal Register and both GDELT timelines each answer in 0.5 s."""
    monkeypatch.setattr(edgar, "cik_for", lambda ticker: NVDA_CIK)
    monkeypatch.setattr(edgar, "filings_between", _slow(0.5, ([], False)))
    monkeypatch.setattr(federal_register, "policy_documents", _slow(0.5, ([], 0, False)))
    monkeypatch.setattr(gdelt, "timeline", _slow(0.5, EMPTY_TIMELINE))
    monkeypatch.setattr(gdelt, "timeline_for_query", _slow(0.5, EMPTY_TIMELINE))


# --- sources side by side, within the budget -------------------------------------------------------------

def test_independent_sources_load_side_by_side(client, slow_sources):
    r = client.post("/api/lab/run", json={"persona_id": "robert", "step": "explain_move",
                                          "inputs": {"ticker": "NVDA", "start": "2022-01-01", "end": "2022-12-31"}})
    assert r.status_code == 200, r.text
    st_ = {s["id"]: s for s in r.json()["stages"]}
    waited = sum(st_[k]["duration_ms"] for k in ("company_events", "world_events", "political_events")) / 1000
    # one after the other: 4 × 0.5 s; side by side: the two GDELT requests in a row (its throttle), 1 s
    assert 0.8 <= waited < 1.6
    assert st_["company_events"]["metrics"]["dépôts EDGAR (8-K, 10-Q, 10-K)"] == 0
    assert st_["world_events"]["decisions"][0]["answer"] == "GDELT (intensité de couverture quotidienne)"
    assert all("budget" not in w for s in st_.values() for w in s["warnings"])  # the Lab has no time budget


def test_a_slow_source_is_left_out_within_the_budget_and_said_so(client, monkeypatch):
    monkeypatch.setattr(gdelt, "timeline", _slow(0.6, EMPTY_TIMELINE))
    monkeypatch.setattr("app.main.Budget", lambda: Budget(fetch_s=0.2))
    t0 = time.perf_counter()
    body = _stock(client).json()
    assert time.perf_counter() - t0 < 2.0
    warnings = " ".join(body["warnings"])
    assert "Couverture GDELT du titre laissé(e) de côté : pas de réponse dans le budget de temps (0.2 s)" in warnings
    assert body["cache"]["complete"] is False and "Couverture GDELT du titre" in body["cache"]["skipped"]
    assert body["moves"] and body["analysis"]["governance"]["passed"] is True
    time.sleep(0.7)  # let the abandoned request end inside the test


def test_the_budget_skip_is_a_recorded_decision(slow_sources, monkeypatch):
    monkeypatch.setattr(gdelt, "timeline", _slow(0.6, EMPTY_TIMELINE))
    budget = Budget(fetch_s=0.2)
    result, _ = execute("explain_move", get_persona("robert"),
                        {"ticker": "NVDA", "start": date(2022, 1, 1), "end": date(2022, 12, 31)},
                        state={"budget": budget})
    world = next(s for s in result.stages if s["id"] == "world_events")
    decision = next(d for d in world["decisions"] if d["question"] == "Quelle source d'événements du monde ?")
    assert decision["answer"] == "aucune (budget de temps dépassé)"
    assert "budget de temps de la page titre" in decision["rule"]
    # every source slower than its share of the budget is left out, each with its own decision
    assert budget.skipped[:2] == ["Dépôts EDGAR", "Couverture GDELT du titre"]
    company = next(s for s in result.stages if s["id"] == "company_events")
    assert any(d["answer"] == "aucun (budget de temps dépassé)" for d in company["decisions"])
    time.sleep(1.0)


# --- GDELT: never wait past the deadline, longer pauses after refusals in a row ---------------------------

def test_gdelt_does_not_wait_for_a_slot_past_the_deadline(monkeypatch):
    calls = []
    monkeypatch.setattr(gdelt, "get_json", lambda *a, **k: calls.append(1) or {})
    monkeypatch.setattr(gdelt, "MIN_INTERVAL_S", 5.5)
    monkeypatch.setattr(gdelt, "_last_call", time.monotonic())
    t0 = time.perf_counter()
    with gdelt.deadline_scope(time.monotonic() + 1.0), pytest.raises(OverBudget, match="prochain créneau"):
        gdelt._throttled_get({"query": "x"})
    assert time.perf_counter() - t0 < 0.2 and calls == [] and gdelt._cooldown_until == 0.0  # not a refusal
    with gdelt.deadline_scope(time.monotonic() - 1.0), pytest.raises(OverBudget, match="écoulé"):
        monkeypatch.setattr(gdelt, "_last_call", 0.0)
        gdelt._throttled_get({"query": "x"})
    assert calls == []


def test_gdelt_does_not_queue_behind_a_request_past_the_deadline():
    gdelt._lock.acquire()
    try:
        t0 = time.perf_counter()
        with gdelt.deadline_scope(time.monotonic() + 0.2), pytest.raises(OverBudget, match="occupe le créneau"):
            gdelt._throttled_get({"query": "x"})
        assert 0.15 < time.perf_counter() - t0 < 0.6
    finally:
        gdelt._lock.release()


def test_refusals_in_a_row_lengthen_the_pause_and_an_answer_resets_it(monkeypatch):
    def refuse(*a, **k):
        raise ExternalUnavailable(gdelt.SOURCE, "limite de débit atteinte (HTTP 429)")

    monkeypatch.setattr(gdelt, "get_json", refuse)
    pauses = []
    for _ in range(4):
        monkeypatch.setattr(gdelt, "_cooldown_until", 0.0)
        with pytest.raises(ExternalUnavailable):
            gdelt._throttled_get({"query": "x"})
        pauses.append(round(gdelt._cooldown_until - time.monotonic()))
    assert pauses == [300, 600, 1200, 1800]
    monkeypatch.setattr(gdelt, "_cooldown_until", 0.0)
    monkeypatch.setattr(gdelt, "get_json", lambda *a, **k: {"timeline": []})
    assert gdelt._throttled_get({"query": "x"}) == {"timeline": []} and gdelt._refusals == 0


# --- crawler: pages and 8-K exhibits side by side, within the budget ---------------------------------------

def test_pages_not_read_in_time_are_reported_and_keep_loading(monkeypatch):
    page = crawler.Page("https://a.example/1", "https://a.example/1", "Titre", "", None, "texte")
    monkeypatch.setattr(crawler, "fetch_page", lambda url: time.sleep(0.6 if "slow" in url else 0) or page)
    t0 = time.perf_counter()
    got = crawler.fetch_many(["https://a.example/1", "https://a.example/slow"], deadline=time.monotonic() + 0.2)
    assert time.perf_counter() - t0 < 0.5
    assert got["https://a.example/1"] is page
    assert isinstance(got["https://a.example/slow"], ExternalUnavailable)
    assert got["https://a.example/slow"].reason == crawler.OVER_BUDGET
    time.sleep(0.5)


def test_press_releases_are_looked_up_side_by_side(monkeypatch):
    def lookup(url):
        time.sleep(0.3)
        if "broken" in url:
            raise ExternalUnavailable(crawler.SOURCE, "HTTP 503")
        return url + "/ex99.htm"

    monkeypatch.setattr(crawler, "sec_press_release", lookup)
    urls = [f"https://www.sec.gov/f{i}" for i in range(4)] + ["https://www.sec.gov/broken"]
    t0 = time.perf_counter()
    got = crawler.press_releases(urls)
    assert time.perf_counter() - t0 < 0.9  # five 0.3 s lookups, six at a time
    assert got["https://www.sec.gov/f2"] == "https://www.sec.gov/f2/ex99.htm"
    assert got["https://www.sec.gov/broken"] is None  # the filing's own document is read instead


# --- model calls: chunks side by side ---------------------------------------------------------------------

def test_chunks_are_balanced_and_run_side_by_side():
    assert [len(c) for c in fetch.chunked(list(range(10)), 4)] == [4, 3, 3]
    assert [len(c) for c in fetch.chunked(list(range(3)), 4)] == [3]
    assert fetch.chunked([], 4) == []
    assert [len(c) for c in fetch.chunked(list(range(22)), 3, most=8)] == [3, 3, 3, 3, 3, 3, 2, 2]
    assert [len(c) for c in fetch.chunked(list(range(30)), 3, most=8)] == [4, 4, 4, 4, 4, 4, 3, 3]  # one wave
    t0 = time.perf_counter()
    out = fetch.parallel(lambda c: time.sleep(0.3) or (1 / c), [1, 2, 0])
    assert time.perf_counter() - t0 < 0.6
    assert out[0] == (1.0, None) and isinstance(out[2][1], ZeroDivisionError)


def _digest_context() -> Context:
    step = explain_move.STEP
    ctx = Context(step=step, persona=get_persona("robert"),
                  inputs=ExplainMoveInputs(ticker="NVDA", start=date(2022, 1, 1), end=date(2022, 12, 31)),
                  options=resolve_options(step, {"digest.model": "haiku"}), report=Report(task=step.id))
    ctx._current, ctx._stage_id = StageRecord(id="digest", name="Résumé des événements"), "digest"
    ctx.state["candidates"] = [
        {"id": f"e{i}", "kind": "article", "date": date(2022, 5, 10 + i), "label": f"Article {chr(65 + i)}",
         "url": f"https://news.example/{i}", "page_title": f"Nvidia news {chr(65 + i)}",
         "page_description": "Nvidia raised its forecast.", "page_text": "Nvidia raised its revenue forecast."}
        for i in range(1, 8)]
    return ctx


def test_digest_reads_events_in_parallel_chunks_and_keeps_the_others_when_one_fails(monkeypatch):
    calls = []

    def fake_call(payload):
        ids = [e["id"] for e in payload["facts"]["events"]]
        calls.append(ids)
        time.sleep(0.3)
        if "e7" in ids:
            raise RuntimeError("Bedrock en panne pour ce lot")
        return {"digest": {"events": [{"id": i, "summary": "Nvidia a relevé sa prévision.", "event_date": None,
                                       "category": "Entreprise", "relevant": True} for i in ids]}}

    monkeypatch.setattr("app.services.narration._call", fake_call)
    ctx = _digest_context()
    t0 = time.perf_counter()
    ev.digest(ctx)
    assert time.perf_counter() - t0 < 0.7  # three 0.3 s calls side by side
    assert sorted(len(c) for c in calls) == [2, 2, 3] and sum(calls, []) and len(calls) == 3
    by_id = {e["id"]: e for e in ctx.state["candidates"]}
    failed = next(c for c in calls if "e7" in c)
    assert all(by_id[i]["summary_by"] == "source" for i in failed)
    assert all(by_id[i]["summary_by"] == "haiku" for i in by_id if i not in failed)
    assert any("en partie indisponibles" in w for w in ctx.record.warnings)
    assert ctx.state["degraded"] == ["résumés Haiku (en partie)"]
    decision = next(d for d in ctx.record.decisions if d["question"] == "Qui résume et date les événements ?")
    assert decision["inputs"]["appels en parallèle"] == 3


# --- AgentCore: one warm session per process --------------------------------------------------------------

def test_the_session_is_reused_and_renewed_after_inactivity():
    first, fresh = narration.session_id(now=1000.0)
    assert fresh and len(first) >= 33
    assert narration.session_id(now=1000.0 + 60) == (first, False)
    renewed, fresh = narration.session_id(now=1060.0 + narration.SESSION_IDLE_S + 1)
    assert fresh and renewed != first


@pytest.fixture
def agentcore(monkeypatch):
    monkeypatch.setenv("AGENT_MODE", "agentcore")
    monkeypatch.setenv("AGENTCORE_RUNTIME_ARN", "arn:aws:bedrock-agentcore:us-east-1:1:runtime/test")
    get_settings.cache_clear()


def test_agentcore_calls_share_the_warm_session(agentcore, monkeypatch):
    import boto3

    sessions, built = [], []

    class FakeClient:
        def invoke_agent_runtime(self, **kwargs):
            sessions.append(kwargs["runtimeSessionId"])
            return {"response": io.BytesIO(json.dumps({"answer": "ok"}).encode())}

    monkeypatch.setattr(boto3, "client", lambda *a, **k: built.append(1) or FakeClient())
    assert narration._invoke_agentcore({"task": "explain_move"}) == {"answer": "ok"}
    narration._invoke_agentcore({"task": "move_digest"})
    assert len(set(sessions)) == 1 and len(sessions) == 2
    assert built == [1]  # one client for the process


def test_warm_up_starts_a_cold_session_once(agentcore, monkeypatch):
    pings = []
    monkeypatch.setattr("app.services.narration._call", lambda payload: pings.append(payload["task"]))
    assert narration.warm_up() is True
    assert narration.warm_up() is False  # already warm
    for _ in range(50):
        if pings:
            break
        time.sleep(0.02)
    assert pings == ["ping"]


def test_a_booting_instance_starts_its_session(agentcore, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import app

    pings = []
    monkeypatch.setattr("app.services.narration._call", lambda payload: pings.append(payload["task"]))
    with TestClient(app):  # runs the app's startup, as uvicorn does when a Lambda instance boots
        for _ in range(50):
            if pings:
                break
            time.sleep(0.02)
    assert pings == ["ping"]


def test_no_warm_up_without_agentcore():
    assert narration.warm_up() is False


def test_the_agent_answers_a_ping_without_a_model():
    from app.agents.narrator import handle

    assert handle({"task": "ping"}, "us-east-1") == {"ok": True}


# --- governance: no second narration past the budget -------------------------------------------------------

INVENTED = ("Le titre a surpris le marché. Il a fait 42,7 % de mieux qu'attendu ce jour-là. "
            "Simulation éducative, pas un conseil financier personnalisé.")


def test_without_sentences_citing_keeps_the_rest():
    text = "Première phrase sans chiffre. Le titre a gagné 42,7 %. Fin.\n\n- point avec 13,9\n- point propre"
    assert governance.without_sentences_citing(text, ["42,7", "13,9"]) == \
        "Première phrase sans chiffre. Fin.\n\n- point propre"


@pytest.fixture
def inventive_narrator(monkeypatch):
    tasks = []

    def fake_call(payload):
        tasks.append(payload["task"])
        if payload["task"] == "explain_move":
            return {"answer": INVENTED}
        raise RuntimeError("pas de Bedrock")

    monkeypatch.setattr("app.services.narration._call", fake_call)
    return tasks


def test_past_the_budget_the_unsourced_sentence_is_removed_instead_of_a_retry(client, inventive_narrator,
                                                                               monkeypatch):
    monkeypatch.setattr("app.main.Budget", lambda: Budget(total_s=0.0))
    body = _stock(client).json()
    assert inventive_narrator.count("explain_move") == 1
    answer = body["analysis"]["answer"]
    assert "42,7" not in answer and answer.startswith("Le titre a surpris le marché.")
    assert body["analysis"]["governance"]["passed"] is True
    assert "relance de la narration" in body["cache"]["skipped"]
    assert any("retiré(s) avec leur phrase" in w for w in body["warnings"])


def test_within_the_budget_the_narration_is_retried_as_before(client, inventive_narrator):
    _stock(client)
    assert inventive_narrator.count("explain_move") == 2


# --- the answer's cache: memory, disk, S3 -------------------------------------------------------------------

@pytest.fixture
def cached(monkeypatch, tmp_path, fake_narrator):
    monkeypatch.setattr(moves_cache, "enabled", True)
    shared = rs.FileStore(tmp_path / "bucket")
    monkeypatch.setattr(moves_cache, "_store", lambda: shared)
    return shared


def _without_cache_fields(body):
    return {k: v for k, v in body.items() if k not in {"cache", "duration_ms"}}


def test_a_second_request_is_served_from_memory_then_disk_then_s3(client, cached, fake_narrator):
    first = _stock(client).json()
    assert first["cache"]["hit"] is False and first["cache"]["layer"] is None
    calls = len(fake_narrator)
    second = _stock(client).json()
    assert second["cache"] == {**first["cache"], "hit": True, "layer": "mémoire"}
    assert _without_cache_fields(second) == _without_cache_fields(first)
    assert len(fake_narrator) == calls  # nothing recomputed
    moves_cache.reset()
    assert _stock(client).json()["cache"]["layer"] == "disque"
    moves_cache.reset()
    shutil.rmtree(get_settings().cache_dir / moves_cache.NAMESPACE)  # another Lambda instance: only S3 has it
    third = _stock(client).json()
    assert third["cache"]["layer"] == "s3" and _without_cache_fields(third) == _without_cache_fields(first)
    assert cached.list_page(moves_cache.PREFIX)[0][0].endswith(".json.gz")


def test_the_cache_is_per_profile_and_period(client, cached):
    assert _stock(client).json()["cache"]["hit"] is False
    assert _stock(client, persona="amira").json()["cache"]["hit"] is False
    assert _stock(client, period="2023").json()["cache"]["hit"] is False
    assert _stock(client).json()["cache"]["hit"] is True


def test_a_cut_short_answer_is_kept_briefly_and_expires(monkeypatch, cached):
    key = moves_cache.key("NVDA", "2022-01-01", "2022-12-31", "robert", {})
    partial = moves_cache.put(key, {"ticker": "NVDA"}, ["Couverture GDELT du titre"])
    assert partial["expires_at"] - partial["stored_at"] == moves_cache.TTL_PARTIAL_S and not partial["complete"]
    full = moves_cache.put(key, {"ticker": "NVDA"}, [])
    assert full["expires_at"] - full["stored_at"] == moves_cache.TTL_COMPLETE_S and full["complete"]
    later = time.time() + moves_cache.TTL_COMPLETE_S + 1
    monkeypatch.setattr(moves_cache.time, "time", lambda: later)
    assert moves_cache.get(key) is None


def test_a_storage_failure_never_fails_the_request(client, monkeypatch, fake_narrator):
    class Broken:
        def put_bytes(self, *a, **k):
            raise OSError("S3 refuse l'écriture")

        def get_bytes(self, key):
            raise OSError("S3 injoignable")

    monkeypatch.setattr(moves_cache, "enabled", True)
    monkeypatch.setattr(moves_cache, "_store", lambda: Broken())
    assert _stock(client).status_code == 200
    moves_cache.reset()
    shutil.rmtree(get_settings().cache_dir / moves_cache.NAMESPACE)
    assert _stock(client).json()["cache"]["hit"] is False


# --- the daily score run is recorded as scheduled ------------------------------------------------------------

def test_the_daily_schedule_starts_a_run_recorded_as_scheduled():
    tf = (REPO_DIR / "infra" / "score_pipeline.tf").read_text(encoding="utf-8")
    schedule = tf[tf.index('resource "aws_scheduler_schedule" "score_daily"'):]
    assert 'schedule_expression          = "cron(0 6 * * ? *)"' in schedule
    assert 'schedule_expression_timezone = "America/Toronto"' in schedule
    assert "arn      = aws_sfn_state_machine.score_pipeline[0].arn" in schedule
    match = re.search(r"input\s*=\s*jsonencode\(\{\s*params\s*=\s*\{\}\s*,\s*trigger\s*=\s*\"(\w+)\"\s*\}\)", schedule)
    assert match and match.group(1) == "schedule"
    store = st.MemoryStore()
    run = stages.handle({"stage": "init", "execution_name": "20261115T110000Z-abc123",
                         "input": {"params": {}, "trigger": match.group(1)}}, store)["run"]
    assert run["trigger"] == "schedule"
    assert st.get_json(store, f"runs/{run['run_id']}.json")["trigger"] == "schedule"


def test_concurrent_requests_do_not_share_their_state(client, monkeypatch):
    """Two analyses at once (a group run's titles): each its own prefetch and budget."""
    monkeypatch.setattr(gdelt, "timeline", _slow(0.2, EMPTY_TIMELINE))
    out = {}

    def one(ticker):
        out[ticker] = _stock(client, ticker).json()

    threads = [threading.Thread(target=one, args=(t,)) for t in ("NVDA", "AAPL")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert out["NVDA"]["ticker"] == "NVDA" and out["AAPL"]["ticker"] == "AAPL"
    assert out["NVDA"]["series"] != out["AAPL"]["series"]
