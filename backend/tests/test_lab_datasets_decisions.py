"""Lab transparency: complete `datasets` (every column, every row, size-capped) and `decisions` per stage."""

import json

import pytest
from pydantic import BaseModel

from app.data import edgar
from app.personas import get_persona
from app.pipeline import core
from app.pipeline.core import InputSpec, StageSkipped, StageSpec, StepSpec
from app.pipeline.registry import execute
from app.services import fundamentals as fmod

from .test_api_lab_and_routes import TAX_INPUTS
from .test_scoring import EDGAR_FIXTURE

DATASET_KEYS = {"id", "title", "source_id", "columns", "rows", "total_rows", "truncated"}
EDGAR_FACTS = sum(len(rows) for node in EDGAR_FIXTURE["facts"]["us-gaap"].values() for rows in node["units"].values())


class _In(BaseModel):
    x: int = 1


def _toy(fn):
    return StepSpec(id="toy", label="Toy", inputs=(InputSpec("x", "X", "number", 1),),
                    stages=(StageSpec("a", "A", "", fn),), request_model=_In,
                    key_result=lambda ctx: {"label": "k", "value": 0})


def _stage(body, stage_id):
    return next(s for s in body["stages"] if s["id"] == stage_id)


def _dataset(stage, dataset_id):
    return next(d for d in stage["datasets"] if d["id"] == dataset_id)


def _questions(stage):
    return {d["question"]: d for d in stage["decisions"]}


def _lab(client, step, inputs, options=None, persona="amira"):
    r = client.post("/api/lab/run", json={"step": step, "persona_id": persona, "inputs": inputs,
                                          "options": {"narration.model": "none", **(options or {})}})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def edgar_fixture(monkeypatch):
    monkeypatch.setattr(edgar, "cik_for", lambda t: 320193 if t == "AAPL" else None)
    raw = fmod.RawFundamentals("edgar", "SEC EDGAR companyfacts (fixture)", "https://example.invalid",
                               EDGAR_FIXTURE, "USD", False, EDGAR_FACTS)
    monkeypatch.setattr(fmod, "_edgar_raw", lambda cik: raw)


# --- core: dataset collection and size cap -----------------------------------------------------

def test_datasets_keep_every_row_and_column_while_preview_stays_capped():
    import pandas as pd

    def stage(ctx):
        rows = [[i, i * 1.5, f"r{i}"] for i in range(50)]
        ctx.preview(["i", "x", "s"], rows)
        ctx.dataset("rows", "Rows", ["i", "x", "s"], rows, source_id="src")
        ctx.dataset_records("records", "Records", [{"a": 1}, {"b": 2, "a": None}], columns=("z",))
        ctx.dataset_frame("frame", "Frame", pd.DataFrame({"v": [1.0, float("nan")]},
                                                         index=pd.to_datetime(["2026-01-02", "2026-01-05"])),
                          index="date")

    res = core.run(_toy(stage), get_persona("amira"), _In(), collect_datasets=True)
    a = res.stages[0]
    assert len(a["preview"]["rows"]) == core.PREVIEW_MAX_ROWS
    rows, records, frame = a["datasets"]
    assert set(rows) == DATASET_KEYS
    assert rows["total_rows"] == 50 and len(rows["rows"]) == 50 and rows["truncated"] is False
    assert rows["rows"][-1] == [49, 73.5, "r49"] and rows["source_id"] == "src"
    assert records["columns"] == ["z", "a", "b"] and records["rows"] == [[None, 1, None], [None, None, 2]]
    assert frame["columns"] == ["date", "v"] and frame["rows"] == [["2026-01-02", 1.0], ["2026-01-05", None]]


def test_business_runs_do_not_collect_datasets():
    res = core.run(_toy(lambda ctx: ctx.dataset("d", "D", ["a"], [[1]])), get_persona("amira"), _In())
    assert res.stages[0]["datasets"] == []


def test_fit_datasets_keeps_small_tables_and_cuts_rows_of_large_ones():
    small = {"id": "s", "columns": ["a"], "rows": [[1], [2]], "total_rows": 2, "truncated": False}
    big = {"id": "b", "columns": ["a", "b"], "rows": [[i, "x" * 50] for i in range(1000)], "total_rows": 1000,
           "truncated": False}
    stages = [{"datasets": [small]}, {"datasets": [big]}]
    core.fit_datasets(stages, 10_000)
    assert small["rows"] == [[1], [2]] and small["truncated"] is False
    assert big["truncated"] is True and big["total_rows"] == 1000 and 0 < len(big["rows"]) < 1000
    assert big["columns"] == ["a", "b"] and big["rows"][0] == [0, "x" * 50]  # leading rows kept
    assert core._escaped_size(small["rows"]) + core._escaped_size(big["rows"]) <= 10_000


def test_escaped_size_counts_the_lambda_envelope_escaping():
    assert core._escaped_size(["a"]) == len('["a"]') + 2  # each quote is escaped once more


def test_response_is_cut_under_the_limit(client, monkeypatch):
    monkeypatch.setattr(core, "RESPONSE_MAX_BYTES", 60_000)
    r = client.post("/api/lab/run", json={"step": "bias", "persona_id": "robert",
                                          "inputs": {"message": "Je vends tout NVDA, panique !"},
                                          "options": {"narration.model": "none", "message_analysis.method": "lexicon"}})
    assert r.status_code == 200
    text = r.content.decode()
    assert len(r.content) + text.count('"') + text.count("\\") <= 60_000
    prices = _dataset(_stage(r.json(), "hype_signal"), "prices_NVDA")
    assert prices["truncated"] is True and len(prices["rows"]) < prices["total_rows"]
    assert prices["columns"] == ["date", "ticker", "open", "high", "low", "close", "adj_close", "volume", "currency"]


# --- core: runner decisions ---------------------------------------------------------------------

def test_runner_records_skip_degrade_and_abort_decisions():
    def skip(ctx):
        raise StageSkipped("rien à faire")

    def boom(ctx):
        raise RuntimeError("panne")

    step = StepSpec(id="toy", label="Toy", inputs=(), request_model=_In, key_result=lambda ctx: {},
                    stages=(StageSpec("s", "S", "", skip), StageSpec("d", "D", "", boom),
                            StageSpec("c", "C", "", boom, degradable=False), StageSpec("after", "After", "", skip)))
    res = core.run(step, get_persona("amira"), _In())
    by_id = {s["id"]: s["decisions"] for s in res.stages}
    assert by_id["s"] == [{"question": "Exécuter l'étape ?", "answer": "non, étape ignorée", "reason": "rien à faire"}]
    assert by_id["d"][0]["answer"] == "dégrader et continuer" and "panne" in by_id["d"][0]["reason"]
    assert by_id["c"][0]["answer"] == "arrêter le pipeline"
    assert by_id["after"][0]["answer"] == "non" and "rule" in by_id["after"][0]


def test_decision_shape_converts_values():
    def stage(ctx):
        ctx.decide("Q ?", 0.1234567891, "parce que", "règle", {"n": 3, "ok": True, "liste": [1, 2]})

    d = core.run(_toy(stage), get_persona("amira"), _In()).stages[0]["decisions"][0]
    assert d == {"question": "Q ?", "answer": 0.123457, "reason": "parce que", "rule": "règle",
                 "inputs": {"n": 3, "ok": "oui", "liste": "[1, 2]"}}


# --- Lab route, per step ------------------------------------------------------------------------

def test_every_stage_of_every_step_exposes_datasets_and_decisions(client, edgar_fixture, fake_narrator):
    cases = {
        "score": {"ticker": "AAPL", "portfolio": ["XIU.TO"]},
        "explain_move": {"ticker": "NVDA", "start": "2022-01-01", "end": "2022-12-31"},
        "tax": TAX_INPUTS,
        "bias": {"message": "Tout le monde achète NVDA, je mets toute ma retraite dessus !"},
    }
    for step, inputs in cases.items():
        body = _lab(client, step, inputs)
        json.dumps(body, allow_nan=False)  # strict JSON, no NaN
        for s in body["stages"]:
            assert isinstance(s["datasets"], list) and isinstance(s["decisions"], list)
            assert s["decisions"], f"{step}.{s['id']} has no decision"
            for d in s["decisions"]:
                assert {"question", "answer", "reason"} <= set(d) <= {"question", "answer", "reason", "rule", "inputs"}
                assert d["question"] and d["reason"]
            # a dataset's source_id resolves in the stage's sources, else in the run-wide result.sources
            known = {x["id"] for x in s["sources"]} | {x["id"] for x in body["result"]["sources"]}
            for ds in s["datasets"]:
                assert set(ds) == DATASET_KEYS
                assert ds["truncated"] is False and ds["total_rows"] == len(ds["rows"])
                assert all(len(row) == len(ds["columns"]) for row in ds["rows"])
                if ds["source_id"] and ds["rows"]:
                    assert ds["source_id"] in known, f"{step}.{s['id']}.{ds['id']}"


def test_score_exposes_raw_facts_and_its_decisions(client, edgar_fixture):
    body = _lab(client, "score", {"ticker": "AAPL", "portfolio": ["XIU.TO", "ZZZ"]})
    facts = _dataset(_stage(body, "fundamentals"), "edgar_facts")
    assert facts["total_rows"] == EDGAR_FACTS and facts["source_id"] == "edgar_AAPL"
    assert facts["columns"] == ["taxonomy", "concept", "unit", "start", "end", "val", "accn", "fy", "fp", "form",
                                "filed", "frame"]
    assert [r[10] for r in facts["rows"]] == sorted((r[10] for r in facts["rows"]), reverse=True)  # newest first
    assert _questions(_stage(body, "fundamentals"))["Quelle source de relevés financiers ?"]["answer"] \
        == "SEC EDGAR (companyfacts)"
    prices = _stage(body, "prices")
    assert _dataset(prices, "prices_AAPL")["columns"][:3] == ["date", "ticker", "open"]
    assert _questions(prices)["Quelle source de prix pour AAPL ?"]["rule"] == "option source = starter"
    events = _questions(_stage(body, "events"))  # GDELT and yfinance are offline in tests
    assert events["Quelle source d'événements ?"]["answer"] == "actualités yfinance (repli)"
    assert events["Résultat de la source ?"]["answer"] == "aucun article"
    scoring = _questions(_stage(body, "scoring"))
    assert scoring["Que faire des sous-scores manquants ?"]["answer"].startswith("poids redistribué")
    assert scoring["Score global ?"]["answer"] == body["key_result"]["value"]
    held = _questions(_stage(body, "suggestions"))["Quels titres détenus servent au calcul ?"]
    assert "ZZZ" in held["reason"] and "ZZZ" not in held["answer"]
    assert len(_dataset(_stage(body, "suggestions"), "universe")["rows"]) == 31


def test_score_of_an_etf_states_why_fundamentals_are_skipped(client):
    body = _lab(client, "score", {"ticker": "QQQ", "portfolio": ["XIU.TO"]}, {"events.source": "none"})
    fund = _stage(body, "fundamentals")
    assert fund["status"] == "skipped"
    q = _questions(fund)
    assert q["Quelle source de relevés financiers ?"]["answer"] == "aucune"
    assert q["Exécuter l'étape ?"]["answer"] == "non, étape ignorée"
    assert _questions(_stage(body, "identification"))["Chercher un identifiant SEC (CIK) ?"]["answer"] == "non"


def test_explain_move_decisions_follow_the_branches(client):
    body = _lab(client, "explain_move", {"ticker": "NVDA", "start": "2022-01-01", "end": "2022-12-31"},
                {"benchmark.method": "market_model"})
    bench = _questions(_stage(body, "benchmark"))
    assert bench["Quel indice de référence ?"]["answer"] == "QQQ"
    assert bench["Comment calculer le rendement attendu ?"]["answer"] == "différence simple (repli)"  # < 60 sessions
    assert _dataset(_stage(body, "benchmark"), "aligned_returns")["columns"][:2] == ["date", "période"]
    macro = _stage(body, "macro")
    assert len(_dataset(macro, "macro_changes")["rows"]) == 9
    assert _dataset(macro, "macro_observations")["total_rows"] > 1000
    world = _questions(_stage(body, "world_events"))
    assert world["Quelle source d'événements du monde ?"]["answer"] == "aucune (GDELT injoignable)"
    confidence = _questions(_stage(body, "attribution"))["Niveau de confiance de l'explication ?"]
    assert confidence["rule"].endswith("(règles testées dans l'ordre)") and "ajustement (R² ou corrélation²)" in \
        confidence["inputs"]


def test_tax_rules_and_final_ranking_are_explained(client):
    body = _lab(client, "tax", TAX_INPUTS, {"marginal_rates.mode": "brackets", "projection.method": "monte_carlo"},
                persona="mateo")
    rules = {r[0]: r for r in _dataset(_stage(body, "rules"), "rules")["rows"]}
    assert rules["tfsa.annual_limits.2009"][1:] == [5000, "cra_tfsa"]
    assert rules["federal_brackets"][2] == "cra_federal_brackets"
    assert _questions(_stage(body, "rules"))["CELIAPP admissible ?"]["answer"] == "non"
    rates = _stage(body, "marginal_rates")
    assert _questions(rates)["D'où viennent les taux marginaux ?"]["answer"] == "barèmes fédéral et Québec 2026"
    assert len(_dataset(rates, "federal_brackets")["rows"]) == 5
    proj = _stage(body, "projection")
    assert _dataset(proj, "path_values")["total_rows"] == 1000
    assert len(_dataset(proj, "path_returns")["columns"]) == 2 + TAX_INPUTS["years"]
    compare = _questions(_stage(body, "compare"))
    assert "CELIAPP" in compare["Quels comptes comparer ?"]["reason"]  # excluded, with the reason
    assert compare["Quel compte est le meilleur ?"]["answer"] in body["key_result"]["label"]


def test_bias_decisions_show_rejected_excerpts_and_the_verdicts(client, fake_narrator):
    body = _lab(client, "bias", {"message": "Tout le monde achète NVDA, je mets toute ma retraite dessus !"},
                persona="robert")
    msg = _questions(_stage(body, "message_analysis"))
    assert msg["De quel titre parle le message ?"]["answer"] == "NVDA"
    assert msg["Garder l'extrait Haiku « phrase inventée absente » ?"]["answer"] == "non"
    hype = _questions(_stage(body, "hype_signal"))
    assert hype["Battage détecté ?"]["answer"] in {"oui", "non"} and "z-score" in hype["Battage détecté ?"]["inputs"]
    assert _dataset(_stage(body, "hype_signal"), "prices_NVDA")["total_rows"] > 1000
    profile = _questions(_stage(body, "profile_check"))
    assert profile["Concentration contraire au profil ?"]["answer"] == "oui"
    sim = _stage(body, "simulation_2022")
    assert _questions(sim)["Quel portefeuille simuler ?"]["answer"] == "60/40 SPY/AGG"
    assert _questions(sim)["Conserver ou vendre en panique ?"]["answer"] == "conserver"
    assert _dataset(sim, "daily_paths")["columns"][-2:] == ["conservation (CAD)", "vente panique (CAD)"]
    gov = _questions(_stage(body, "governance"))
    assert gov["Verdict de gouvernance ?"]["answer"] == "réussie"
