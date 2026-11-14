"""The user's own score: the gold table rescored with custom weights, its sensitivity, and the portfolio."""

from __future__ import annotations

import json

import pytest

from app.score_pipeline import gold
from app.score_pipeline import indicators as ind
from app.score_pipeline.indicators import Value
from app.services import custom_score, score_table
from tests import profile_fakes as fakes
from tests.test_scores import install_table

SECTORS = {"AAA": "Technology", "BBB": "Technology", "CCC": "Technology", "DDD": "Technology", "EEE": "Technology",
           "FFF": "Healthcare", "GGG": "Healthcare", "ETF1": "Fonds"}


def _raw(i: int, symbol: str) -> dict[str, Value]:
    """Deterministic, varied raw indicators; ETF1 has no fundamentals nor events (a partial row)."""
    k = (i * 37) % 11 + 1
    if symbol == "ETF1":
        out = {d: ind.missing("FNB") for d in ind.INDICATORS}
        out.update(momentum_12_1=Value(0.08), volatility_1y=Value(0.15), max_drawdown_1y=Value(0.1))
        return out
    return {"roe": Value(0.05 * k), "net_margin": Value(0.03 * (12 - k)), "debt_to_equity": Value(0.2 * k),
            "interest_coverage": Value(2.0 * (12 - k) + i), "revenue_cagr_3y": Value(0.01 * k * (i % 3 + 1)),
            "eps_cagr_3y": Value(-1.0, True) if symbol == "CCC" else Value(0.02 * (k + i)),
            "pe": Value(5.0 * k + i), "pb": Value(0.7 * (12 - k) + 0.1 * i), "momentum_12_1": Value(0.03 * (k - 5)),
            "volatility_1y": Value(0.1 + 0.02 * k), "max_drawdown_1y": Value(0.05 + 0.01 * (12 - k)),
            "events_90d": Value(40.0 + 3 * k)}


def gold_rows() -> list[dict]:
    """Rows built by the gold stage's own functions (ranks, sub-scores, redistribution)."""
    raw = {s: _raw(i, s) for i, s in enumerate(SECTORS)}
    _, ranks, groups = gold.rank_all(raw, SECTORS)
    rows = [gold.build_row(s, "2026-11-13", raw[s], ranks, groups.get(s, "Toutes"), []) for s in SECTORS]
    return [r for r in rows if r is not None]


@pytest.fixture
def table(monkeypatch):
    rows = gold_rows()
    install_table(monkeypatch, rows)
    return {r["symbol"]: r for r in rows}


def test_default_weights_give_back_the_gold_scores_exactly(table):
    rows = score_table.load()["rows"]
    assert rows["ETF1"].partiel is True
    for symbol, row in rows.items():
        custom, subs = custom_score.rescore(row, custom_score.DEFAULT)
        assert custom == table[symbol]["score"], symbol
        stored = {s["id"]: s for s in table[symbol]["sub_scores"]}
        for sub in subs:
            assert sub["contribution"] == stored[sub["id"]]["contribution"]
            assert sub["effective_weight"] == stored[sub["id"]]["effective_weight"]


def test_custom_weights_follow_the_same_redistribution_rule(table):
    c = custom_score.choice({"rentabilite": 1, "solidite": 1, "croissance": 0, "valorisation": 0,
                             "momentum_risque": 2, "evenements": 0})
    assert c.weights == pytest.approx({"rentabilite": 25, "solidite": 25, "croissance": 0, "valorisation": 0,
                                       "momentum_risque": 50, "evenements": 0})
    row = score_table.load()["rows"]["AAA"]
    subs = {s.id: s.score for s in row.sub_scores}
    expected = ind.final_score(0.25 * subs["rentabilite"] + 0.25 * subs["solidite"] + 0.5 * subs["momentum_risque"])
    assert custom_score.rescore(row, c)[0] == pytest.approx(expected, abs=0.011)
    # The ETF has only momentum and risk: it gets the whole weight, and stays partial.
    etf = score_table.load()["rows"]["ETF1"]
    score, etf_subs = custom_score.rescore(etf, c)
    momentum = next(s for s in etf_subs if s["id"] == "momentum_risque")
    assert momentum["effective_weight"] == 1.0 and score == momentum["score"]


def test_leaving_indicators_out_recomputes_the_sub_score_from_the_stored_ranks(table):
    c = custom_score.choice(factors={"excluded_indicators": ["momentum_12_1", "events_90d"]})
    row = score_table.load()["rows"]["BBB"]
    stored = next(s for s in row.sub_scores if s.id == "momentum_risque")
    ranks = {i.id: i.rank for i in stored.indicators}
    _, subs = custom_score.rescore(row, c)
    by_id = {s["id"]: s for s in subs}
    assert by_id["momentum_risque"]["score"] == round((ranks["volatility_1y"] + ranks["max_drawdown_1y"]) / 2, 2)
    # Events without their only indicator count as weight 0: their 10 % goes to the others.
    assert by_id["evenements"]["score"] is None and by_id["evenements"]["effective_weight"] == 0
    assert by_id["rentabilite"]["effective_weight"] == pytest.approx(0.25 / 0.9, abs=1e-4)


@pytest.mark.parametrize("weights, factors, message", [
    ({"profit": 10}, None, "Sous-score inconnu « profit »"),
    ({"solidite": -5}, None, "Le poids de « Solidité financière » doit être un nombre positif ou nul"),
    ({k: 0 for k in custom_score.SUB_IDS}, None, "Au moins un sous-score doit avoir un poids supérieur à 0."),
    (None, {"excluded_indicators": ["beta"]}, "Indicateur inconnu « beta »"),
    ({"rentabilite": 100, "solidite": 0, "croissance": 0, "valorisation": 0, "momentum_risque": 0, "evenements": 0},
     {"excluded_indicators": ["roe", "net_margin"]}, "Aucun sous-score pondéré ne garde d'indicateur"),
])
def test_invalid_choices_are_422_with_a_french_message(client, table, weights, factors, message):
    r = client.post("/api/scores/reweight", json={"weights": weights, "factors": factors})
    assert r.status_code == 422
    assert r.json()["detail"].startswith(message)


def test_non_numeric_weights_and_too_many_tickers_are_422(client, table):
    assert client.post("/api/scores/reweight", json={"weights": {"solidite": "beaucoup"}}).status_code == 422
    assert client.post("/api/scores/reweight", json={"tickers": [f"T{i}" for i in range(201)]}).status_code == 422
    assert client.post("/api/scores/reweight", json={"limit": 0}).status_code == 422


def test_reweight_ranks_the_whole_table_and_reports_rank_changes(client, table):
    weights = {"rentabilite": 0, "solidite": 0, "croissance": 0, "valorisation": 100, "momentum_risque": 0,
               "evenements": 0}
    body = client.post("/api/scores/reweight", json={"weights": weights, "tickers": ["ccc", "AAA", "ZZZ"]}).json()
    assert body["status"] == "available" and body["total"] == len(table)
    assert [i["symbol"] for i in body["items"]] == ["CCC", "AAA"] and body["missing"] == ["ZZZ"]
    assert body["applied"]["custom"] is True and body["applied"]["weights"]["valorisation"] == 100
    for item in body["items"]:
        valuation = next(s for s in item["sub_scores"] if s["id"] == "valorisation")
        assert item["custom_score"] == valuation["score"]
        assert item["rank_change"] == item["default_rank"] - item["custom_rank"]
        assert item["delta"] == pytest.approx(item["custom_score"] - item["default_score"], abs=0.011)
        assert valuation["default_weight"] == 15 and valuation["weight"] == 100
    top = client.post("/api/scores/reweight", json={"weights": weights, "limit": 3}).json()["items"]
    assert [i["custom_rank"] for i in top] == [1, 2, 3]
    scores = [i["custom_score"] for i in top]
    assert scores == sorted(scores, reverse=True)


def test_default_reweight_changes_no_rank(client, table):
    body = client.post("/api/scores/reweight", json={}).json()
    assert body["applied"]["custom"] is False
    assert all(i["rank_change"] == 0 and i["delta"] == 0 for i in body["items"])


def test_no_table_answers_its_status(client):
    body = client.post("/api/scores/reweight", json={"weights": {"solidite": 50}}).json()
    assert body["status"] == "absent" and body["items"] == [] and body["total"] == 0
    assert "DATA_BUCKET" in body["message"]


def test_simulation_curves_meet_the_custom_score_and_agree_with_the_shared_function(client, table):
    choice = {"weights": {"rentabilite": 30, "solidite": 20, "croissance": 10, "valorisation": 20,
                          "momentum_risque": 15, "evenements": 5}}
    body = client.post("/api/scores/simulate", json={**choice, "ticker": "bbb"}).json()
    assert body["symbol"] == "BBB" and len(body["curves"]) == 6
    custom = body["comparison"]["custom_score"]
    rows = score_table.load()["rows"]
    for curve in body["curves"]:
        assert [p["weight"] for p in curve["points"]] == list(range(0, 101, 5))
        at_current = next(p for p in curve["points"] if p["weight"] == curve["weight"])
        assert at_current["score"] == pytest.approx(custom, abs=0.011)
        assert at_current["rank"] == body["comparison"]["custom_rank"]
        # Any point equals the shared computation with that slider moved.
        point = curve["points"][4]
        moved = custom_score.choice({**choice["weights"], curve["id"]: point["weight"]})
        assert point["score"] == pytest.approx(custom_score.rescore(rows["BBB"], moved)[0], abs=0.011)
    # More weight on a sub-score pulls the score towards that sub-score's value.
    for curve in body["curves"]:
        scores = [p["score"] for p in curve["points"]]
        rising = curve["sub_score"] > scores[0]
        assert scores == sorted(scores, reverse=not rising)


def test_simulation_of_a_missing_sub_score_is_flat_and_unknown_titles_say_so(client, table):
    body = client.post("/api/scores/simulate", json={"ticker": "ETF1"}).json()
    events = next(c for c in body["curves"] if c["id"] == "evenements")
    assert events["sub_score"] is None
    assert len({p["score"] for p in events["points"][:-1]}) == 1
    assert events["points"][-1]["score"] is not None  # others keep their weight: still scored
    unknown = client.post("/api/scores/simulate", json={"ticker": "NOPE"}).json()
    assert unknown["curves"] == [] and "ne figure pas" in unknown["message"]


def test_gold_row_and_published_score_use_the_shared_functions():
    score, effective, partiel = ind.combine({"rentabilite": 80.0, "solidite": None, "croissance": 60.0,
                                             "valorisation": 40.0, "momentum_risque": 20.0, "evenements": 50.0})
    assert partiel is True and effective["solidite"] == 0
    assert ind.final_score(score) == round(score, 2)
    custom, eff, _ = ind.combine({"rentabilite": 80.0, "solidite": None}, {"rentabilite": 0.5, "solidite": 0.5})
    assert custom == 80.0 and eff == {"rentabilite": 1.0, "solidite": 0.0}


# --- Portfolio with the user's weights -----------------------------------------------------------------

def test_portfolio_with_custom_weights_scores_holdings_and_reranks_suggestions(monkeypatch, client, table):
    calm = fakes.steady(100, wiggle=0.008)
    symbols = list(SECTORS)
    fakes.install(monkeypatch, quotes={s: fakes.quote(s, 50.0, name=f"{s} Corp") for s in symbols},
                  closes={s: calm for s in symbols},
                  companies={s: {"sector": sector, "esg_score": 15.0, "highest_controversy": 1}
                             for s, sector in SECTORS.items() if s != "ETF1"})
    install_table(monkeypatch, list(table.values()))
    weights = {"rentabilite": 0, "solidite": 0, "croissance": 0, "valorisation": 100, "momentum_risque": 0,
               "evenements": 0}
    body = client.post("/api/portfolio/analyze", json={"persona_id": "amira", "weights": weights,
                                                      "holdings": [{"ticker": "AAA", "weight": 1}]}).json()
    assert body["scoring"]["custom"] is True and body["scoring"]["weights"]["valorisation"] == 100
    holding = body["holdings"][0]
    assert holding["score"]["default_score"] == table["AAA"]["score"]
    assert holding["score"]["custom_score"] != holding["score"]["default_score"]
    s = body["suggestions"]
    assert s["source"] == "score_table" and s["items"]
    first = s["items"][0]
    assert first["score"] == first["ranking"]["custom_score"]
    assert first["reasons"][0].startswith("Score StockLock de") and "avec vos pondérations" in first["reasons"][0]
    assert first["reasons"][1].startswith(("Vos pondérations le font passer du", "Vos pondérations ne changent pas"))
    # Healthcare (absent from the portfolio) comes before Technology (held), best custom score first.
    healthcare = [i for i in s["items"] if i["sector"] == "Healthcare"]
    assert s["items"][:len(healthcare)] == healthcare
    assert [i["score"] for i in healthcare] == sorted((i["score"] for i in healthcare), reverse=True)


def test_portfolio_rejects_invalid_weights(client, table):
    r = client.post("/api/portfolio/analyze", json={"persona_id": "robert", "weights": {"solidite": -1},
                                                   "holdings": [{"ticker": "AAA", "weight": 1}]})
    assert r.status_code == 422 and "positif ou nul" in r.json()["detail"]


def test_reweight_body_is_json_serialisable(table):
    assert json.dumps(custom_score.reweight(custom_score.DEFAULT))
