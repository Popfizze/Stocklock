"""Lab contract and business routes, with external sources mocked."""

from datetime import date

import pytest

from app.data import edgar
from app.services import fundamentals as fmod

from .test_scoring import EDGAR_FIXTURE

TAX_INPUTS = {"annual_contribution": 7000, "years": 15, "expected_return": 0.05, "marginal_rate_now": 0.3612,
              "marginal_rate_retirement": 0.3012, "first_home_buyer": False, "income": 85000}
STAGE_KEYS = {"id", "name", "status", "duration_ms", "options_used", "metrics", "preview", "warnings", "sources"}
RESULT_KEYS = {"answer", "factors", "sources", "assumptions", "limits", "trace", "governance"}


@pytest.fixture
def edgar_fixture(monkeypatch):
    monkeypatch.setattr(edgar, "cik_for", lambda t: 320193 if t == "AAPL" else None)
    raw = fmod.RawFundamentals("edgar", "SEC EDGAR companyfacts (fixture)", "https://example.invalid",
                               EDGAR_FIXTURE, "USD", False, 10)
    monkeypatch.setattr(fmod, "_edgar_raw", lambda cik: raw)


def test_lab_catalog_contract(client):
    r = client.get("/api/lab/pipelines")
    assert r.status_code == 200
    steps = r.json()["steps"]
    score = steps[0]
    assert {"id", "label", "inputs", "stages"} <= set(score)
    assert score["inputs"][0] == {"name": "ticker", "label": "Titre", "type": "text", "default": "AAPL",
                                  "help": "Symbole Yahoo, par exemple AAPL ou RY.TO."}
    assert next(i for i in score["inputs"] if i["name"] == "as_of")["default"] == date.today().isoformat()
    em = steps[1]
    assert {i["name"]: i["default"] for i in em["inputs"]} == {"ticker": "NVDA", "start": "2022-01-01",
                                                              "end": "2022-12-31"}
    assert "NVDA" in steps[3]["inputs"][0]["default"]
    for st in steps:
        for stage in st["stages"]:
            assert {"id", "name", "description", "options"} <= set(stage)
            for o in stage["options"]:
                assert {"key", "label", "choices", "default"} <= set(o)


def test_lab_run_tax_contract(client):
    r = client.post("/api/lab/run", json={"step": "tax", "persona_id": "mateo", "inputs": TAX_INPUTS,
                                          "options": {"narration.model": "none"}})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"run_id", "step", "duration_ms", "options_used", "key_result", "stages", "result"}
    assert body["options_used"]["projection.method"] == "deterministic"
    assert body["options_used"]["narration.model"] == "none"
    assert body["key_result"]["label"].startswith("Meilleur compte")
    for s in body["stages"]:
        assert set(s) == STAGE_KEYS
        assert s["status"] in {"ok", "warning", "error", "skipped"}
        assert all(isinstance(v, (int, float, str)) for v in s["metrics"].values())
        if s["preview"] is not None:
            assert len(s["preview"]["rows"]) <= 20
    assert set(body["result"]) == RESULT_KEYS


def test_lab_run_compares_two_options(client):
    base = {"step": "tax", "persona_id": "mateo", "inputs": TAX_INPUTS}
    det = client.post("/api/lab/run", json={**base, "options": {"narration.model": "none"}}).json()
    mc = client.post("/api/lab/run", json={**base, "options": {"narration.model": "none",
                                                               "projection.method": "monte_carlo"}}).json()
    assert det["options_used"]["projection.method"] == "deterministic"
    assert mc["options_used"]["projection.method"] == "monte_carlo"
    mc_proj = next(s for s in mc["stages"] if s["id"] == "projection")
    assert mc_proj["metrics"]["trajectoires"] == 1000


@pytest.mark.parametrize("payload", [
    {"step": "tax", "persona_id": "mateo", "inputs": TAX_INPUTS, "options": {"projection.method": "magic"}},
    {"step": "tax", "persona_id": "mateo", "inputs": TAX_INPUTS, "options": {"nope.key": "x"}},
    {"step": "unknown", "persona_id": "mateo", "inputs": {}},
    {"step": "tax", "persona_id": "mateo", "inputs": {"annual_contribution": -5}},
    {"step": "tax", "persona_id": "zorro", "inputs": TAX_INPUTS},
])
def test_lab_run_validation_errors_are_422(client, payload):
    assert client.post("/api/lab/run", json=payload).status_code == 422


def test_score_route_with_mocked_sources(client, edgar_fixture, fake_narrator):
    r = client.post("/api/score", json={"persona_id": "amira", "ticker": "AAPL", "portfolio": ["XIU.TO"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == RESULT_KEYS
    names = [f["name"] for f in body["factors"]]
    assert "Score global" in names
    assert any(n.startswith("Proposition : ") for n in names)
    assert any("GDELT" in lim for lim in body["limits"])  # GDELT offline -> stated, nothing invented
    assert body["governance"]["passed"] is True
    assert fake_narrator[0]["task"] == "score"
    assert fake_narrator[0]["model_id"].startswith("global.anthropic.claude-haiku")


def test_score_unknown_ticker_is_422(client):
    r = client.post("/api/score", json={"persona_id": "amira", "ticker": "ZZZZZZ"})
    assert r.status_code == 422


def test_explain_move_route_offline(client, fake_narrator):
    r = client.post("/api/explain-move", json={"persona_id": "robert", "ticker": "NVDA",
                                               "start": "2022-01-01", "end": "2022-12-31"})
    assert r.status_code == 200, r.text
    body = r.json()
    names = {f["name"]: f for f in body["factors"]}
    assert "Rendement anormal de la fenêtre" in names
    assert "Niveau de confiance de l'explication" in names
    assert any("profil" in c["note"] or c["name"] == "profile_consistency" for c in body["governance"]["checks"])


def test_bias_route_rejects_invented_excerpts(client, fake_narrator):
    r = client.post("/api/bias", json={"persona_id": "robert",
                                       "message": "Tout le monde achète NVDA, je mets toute ma retraite dessus !"})
    assert r.status_code == 200, r.text
    body = r.json()
    names = [f["name"] for f in body["factors"]]
    assert any("Autorité sociale" in n for n in names)
    assert any("Peur de manquer" in n for n in names)        # verbatim Haiku excerpt kept
    assert not any("Euphorie" in n for n in names)            # invented excerpt rejected
    assert any(f["name"].startswith("Valeur finale en conservant") for f in body["factors"])
    assert body["governance"]["checks"][2]["name"] == "profile_consistency"


def test_tax_route(client, fake_narrator):
    r = client.post("/api/tax", json={"persona_id": "mateo", **TAX_INPUTS})
    assert r.status_code == 200, r.text
    factors = {f["name"]: f for f in r.json()["factors"]}
    assert factors["Valeur nette après impôt — CELIAPP"]["value"] == "non admissible"
    assert factors["Meilleur compte après impôt"]["value"] == "REER"
