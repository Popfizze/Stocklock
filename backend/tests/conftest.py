"""Shared fixtures: no network, no Bedrock, isolated disk cache."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.data import crawler, gdelt, http, universe, yf_fundamentals, yf_live, yf_market
from app.data.cache import ExternalUnavailable
from app.services import score_table


@pytest.fixture(autouse=True)
def offline(monkeypatch, tmp_path):
    """Every external call fails like an unreachable source unless a test patches it."""
    monkeypatch.setenv("CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.setenv("DATA_BUCKET", "")  # no score table unless a test provides one
    get_settings.cache_clear()
    universe.reset()
    score_table.reset()

    def no_network(source, url, **kwargs):
        raise ExternalUnavailable(source, "réseau désactivé pendant les tests")

    def no_yf(*args, **kwargs):
        raise ExternalUnavailable("Yahoo Finance (yfinance)", "réseau désactivé pendant les tests")

    monkeypatch.setattr(http, "get_json", no_network)
    monkeypatch.setattr(http, "get_text", no_network)  # the crawler calls http.get_text / http.get_json
    crawler.reset()
    for mod in ("app.data.edgar", "app.data.gdelt"):
        monkeypatch.setattr(f"{mod}.get_json", no_network)
    monkeypatch.setattr(yf_fundamentals, "statements", no_yf)
    monkeypatch.setattr(yf_live, "info", no_yf)
    monkeypatch.setattr(yf_live, "daily_prices", no_yf)
    monkeypatch.setattr(yf_live, "recent_news", no_yf)
    monkeypatch.setattr(yf_market, "_get", no_yf)
    monkeypatch.setattr(yf_market, "_post", no_yf)
    monkeypatch.setattr(yf_market, "_run_screen", no_yf)
    monkeypatch.setattr(gdelt, "_cooldown_until", 0.0)
    monkeypatch.setattr(gdelt, "MIN_INTERVAL_S", 0.0)

    def no_bedrock(payload):
        raise RuntimeError("Bedrock désactivé pendant les tests")

    monkeypatch.setattr("app.services.narration._call", no_bedrock)
    yield
    get_settings.cache_clear()
    universe.reset()
    score_table.reset()


@pytest.fixture
def client():
    from app.main import app

    return TestClient(app)


@pytest.fixture
def fake_narrator(monkeypatch):
    """Narration that only repeats a fact, and a classifier with one verbatim and one invented excerpt."""
    calls: list[dict] = []

    def fake_call(payload):
        calls.append(payload)
        if payload["task"] == "bias_classify":
            return {"classification": {
                "dominant_emotion": "euphorie",
                "signals": [
                    {"category": "fomo", "excerpt": "je mets toute ma retraite", "intensity": 0.8},
                    {"category": "euphorie", "excerpt": "phrase inventée absente", "intensity": 0.9},
                ]}}
        return {"answer": "Explication fondée sur les faits [starter_prices]. "
                          "Simulation éducative, pas un conseil financier personnalisé."}

    monkeypatch.setattr("app.services.narration._call", fake_call)
    return calls
