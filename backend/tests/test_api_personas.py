import pytest

CONTRACT_FIELDS = {"id", "name", "age", "risk_tolerance", "horizon", "preferences", "summary"}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_personas_contract(client):
    r = client.get("/api/personas")
    assert r.status_code == 200
    body = r.json()
    assert [p["id"] for p in body] == ["amira", "mateo", "robert"]
    for p in body:
        assert set(p) == CONTRACT_FIELDS
        assert isinstance(p["preferences"], list) and all(isinstance(x, str) for x in p["preferences"])
        assert isinstance(p["age"], int)
    assert {p["id"]: p["age"] for p in body} == {"amira": 26, "mateo": 41, "robert": 59}


def test_cors_allows_frontend(client):
    r = client.options("/api/personas", headers={"Origin": "http://localhost:5173",
                                                 "Access-Control-Request-Method": "GET"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


@pytest.mark.parametrize("path,payload", [
    ("/api/score", {"ticker": "AAPL"}),
    ("/api/explain-move", {"ticker": "NVDA", "start": "2022-01-01", "end": "2022-12-31"}),
    ("/api/tax", {"annual_contribution": 7000, "expected_return": 0.05, "marginal_rate_now": 0.36,
                  "marginal_rate_retirement": 0.30}),
    ("/api/bias", {"message": "Tout le monde achète"}),
])
def test_unknown_persona_is_422(client, path, payload):
    r = client.post(path, json={"persona_id": "zorro", **payload})
    assert r.status_code == 422
    assert "persona_id" in r.text


def test_missing_persona_is_422(client):
    assert client.post("/api/score", json={"ticker": "AAPL"}).status_code == 422


def test_explain_move_rejects_inverted_window(client):
    r = client.post("/api/explain-move", json={"persona_id": "amira", "ticker": "NVDA",
                                               "start": "2022-12-31", "end": "2022-01-01"})
    assert r.status_code == 422
