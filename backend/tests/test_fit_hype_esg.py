"""Fit verdict, hype signal and ESG endpoints on a fake Yahoo Finance / GDELT (no network)."""

from __future__ import annotations

import pytest

from app.data import yf_market
from app.services import hype
from tests import profile_fakes as fakes

CALM = fakes.steady(100, wiggle=0.01)      # ≈ 16 % a year
WILD = fakes.steady(100, wiggle=0.03)      # ≈ 48 % a year
HYPED = fakes.surge(50, wiggle=0.02, jump=0.40)


@pytest.fixture
def market(monkeypatch):
    def install(**kwargs):
        kwargs.setdefault("closes", {"NVDA": WILD, "AAPL": CALM, "XOM": CALM, "BTC-USD": WILD, "SPY": CALM,
                                     "HYPD": HYPED, "JNJ": CALM})
        kwargs.setdefault("quotes", {
            "NVDA": fakes.quote("NVDA", 162.85, name="NVIDIA Corporation"),
            "AAPL": fakes.quote("AAPL", 356.27, name="Apple Inc."),
            "XOM": fakes.quote("XOM", 170.59, name="Exxon Mobil Corporation"),
            "BTC-USD": fakes.quote("BTC-USD", 63895.0, kind="CRYPTOCURRENCY", name="Bitcoin USD"),
            "SPY": fakes.quote("SPY", 600.0, kind="ETF", name="SPDR S&P 500 ETF Trust"),
            "HYPD": fakes.quote("HYPD", 70.0, volume=5.2e6, avg3m=1.5e6, avg10d=3e6, name="Hyped Dynamics Inc."),
            "JNJ": fakes.quote("JNJ", 285.0, name="Johnson & Johnson"),
        })
        return fakes.install(monkeypatch, **kwargs)

    return install


def test_fit_of_one_title_for_robert_is_out_of_profile_with_its_numbers(market, client):
    market(gdelt_counts={"NVDA": [10.0] * 83 + [12.0] * 7})
    r = client.get("/api/fit/nvda", params={"persona": "robert"})
    assert r.status_code == 200
    body = r.json()
    assert body["ticker"] == "NVDA" and body["name"] == "NVIDIA Corporation" and body["persona_id"] == "robert"
    assert body["verdict"] == "hors_profil"
    assert body["summary"] == "Hors profil pour Robert : volatilité trop élevée."
    assert body["sector"] == "Technology" and body["asset_class"] == "equity"
    assert body["volatility_1y"] == pytest.approx(0.48, abs=0.03)
    assert body["max_volatility"] == 0.25 and body["max_position"] == 0.1
    first = body["reasons"][0]
    assert first == {"rule": "volatility", "severity": "bloquant", "message": first["message"],
                     "value": body["volatility_1y"], "limit": 0.25}
    assert body["esg"]["risk_label"] == "Risque ESG faible (10 à 15)"
    assert body["esg"]["controversy_level"] == 2
    assert body["hype"]["news_source"] == "gdelt" and body["hype"]["level"] == "faible"


def test_the_same_title_is_compatible_for_amira(market, client):
    market()
    body = client.get("/api/fit/NVDA", params={"persona": "amira"}).json()
    assert body["verdict"] == "compatible"
    assert body["summary"] == "Compatible avec le profil d’Amira."


def test_exxon_is_out_of_profile_for_mateo_on_its_sector_and_esg_risk(market, client):
    market()
    body = client.get("/api/fit/XOM", params={"persona": "mateo"}).json()
    assert body["verdict"] == "hors_profil"
    assert [(r["rule"], r["severity"]) for r in body["reasons"][:2]] == [("sector", "bloquant"),
                                                                          ("esg_risk", "attention")]
    assert body["esg"]["risk_category"] == "eleve" and body["esg"]["risk_low"] == 35


def test_robert_tempted_by_a_hyped_stock_gets_a_high_hype_warning(market, client):
    market(gdelt_counts={"HYPD": [5.0] * 83 + [20.0] * 7})
    body = client.get("/api/fit/HYPD", params={"persona": "robert"}).json()
    signal = body["hype"]
    assert signal["level"] == "eleve" and signal["points"] == 6
    assert [c["points"] for c in signal["components"]] == [2, 2, 2]
    assert signal["components"][0]["ratio"] == pytest.approx(5.2 / 1.5)
    assert "5 séances" in signal["components"][1]["message"]
    assert signal["components"][2]["ratio"] == pytest.approx(4.0)
    assert len(signal["reasons"]) == 3
    hype_reason = next(r for r in body["reasons"] if r["rule"] == "hype")
    assert hype_reason["severity"] == "attention" and "3 à 5 ans" in hype_reason["message"]
    assert "battage élevé" in body["summary"]


def test_batch_keeps_the_order_reports_missing_symbols_and_costs_few_requests(market, client):
    calls = market()
    r = client.post("/api/fit", json={"persona_id": "mateo",
                                      "tickers": ["aapl", "XOM", "BTC-USD", "SPY", "ZZZZ", "AAPL"]})
    assert r.status_code == 200
    body = r.json()
    assert [(i["ticker"], i["verdict"]) for i in body["items"]] == [
        ("AAPL", "compatible"), ("XOM", "hors_profil"), ("BTC-USD", "hors_profil"), ("SPY", "compatible")]
    assert body["missing"] == ["ZZZZ"]
    spy = body["items"][3]
    assert spy["sector"] is None and spy["esg"] is None
    assert any(r["rule"] == "esg_unknown" for r in spy["reasons"])
    # News attention is not fetched in a batch (GDELT cache only).
    assert all(i["hype"]["news_source"] is None for i in body["items"])
    assert all(c[1]["cache_only"] for c in calls if c[0] == "gdelt")
    urls = [c[0] for c in calls]
    assert sum("/v7/finance/quote" in u for u in urls) == 1
    assert sum("/v7/finance/spark" in u for u in urls) == 1
    assert sum(u == yf_market.SCREENER_URL for u in urls) == 29  # equities only: AAPL, XOM


def test_screener_facts_are_cached_per_symbol(market, client):
    calls = market()
    client.post("/api/fit", json={"persona_id": "amira", "tickers": ["AAPL", "XOM"]})
    before = sum(c[0] == yf_market.SCREENER_URL for c in calls)
    client.post("/api/fit", json={"persona_id": "robert", "tickers": ["XOM", "AAPL"]})
    assert sum(c[0] == yf_market.SCREENER_URL for c in calls) == before


def test_screener_down_leaves_sector_and_esg_unknown_but_still_answers(market, client):
    market(screener_down=True)
    body = client.post("/api/fit", json={"persona_id": "mateo", "tickers": ["XOM"]}).json()
    xom = body["items"][0]
    assert xom["sector"] is None and xom["esg"] is None
    assert xom["verdict"] == "compatible"  # nothing known against it: the reasons say ESG is unverified
    assert any(r["rule"] == "esg_unknown" for r in xom["reasons"])


def test_fit_errors(market, client):
    market()
    assert client.get("/api/fit/NVDA", params={"persona": "zoe"}).status_code == 404
    assert client.get("/api/fit/ZZZZ", params={"persona": "robert"}).status_code == 404
    assert client.post("/api/fit", json={"persona_id": "zoe", "tickers": ["NVDA"]}).status_code == 422
    assert client.post("/api/fit", json={"persona_id": "robert", "tickers": []}).status_code == 422
    assert client.post("/api/fit", json={"persona_id": "robert",
                                         "tickers": [f"T{i}" for i in range(101)]}).status_code == 422


def test_quotes_down_is_503(monkeypatch, client):
    fakes.install(monkeypatch)
    monkeypatch.setattr(yf_market, "_get", lambda url, params: (_ for _ in ()).throw(
        yf_market.ExternalUnavailable(yf_market.SOURCE, "erreur réseau (ConnectError)")))
    assert client.get("/api/fit/NVDA", params={"persona": "robert"}).status_code == 503
    assert client.post("/api/hype", json={"tickers": ["NVDA"]}).status_code == 503


# --- Hype ---------------------------------------------------------------------------------------------

def test_a_quiet_title_has_a_low_hype(market, client):
    market(gdelt_counts={"AAPL": [30.0] * 90})
    body = client.get("/api/hype/AAPL").json()
    assert body["level"] == "faible" and body["points"] == 0 and body["reasons"] == []
    assert body["volume_avg_3m"] == 1e6 and body["return_1m"] is not None
    assert body["components"][2]["message"].startswith("Articles GDELT des 7 derniers jours")


def test_yahoo_headlines_replace_gdelt_when_it_refuses(market, client):
    market(news={"AAPL": fakes.headlines({0: 6, 1: 6, 3: 1, 5: 1, 8: 1, 10: 1})})
    news = client.get("/api/hype/AAPL").json()["components"][2]
    assert news["points"] == 1  # at most one point from Yahoo
    assert news["ratio"] == pytest.approx(6 / (4 / 9))
    assert "GDELT : limite de débit atteinte" in news["message"]


def test_a_dense_yahoo_list_is_reported_without_points(market, client):
    market(news={"NVDA": fakes.headlines({0: 30, 1: 20})})
    body = client.get("/api/hype/NVDA").json()
    news = body["components"][2]
    assert news["points"] is None and "50 articles en 2 jour(s)" in news["message"]
    assert body["news_source"] == "yahoo"


def test_hype_batch_does_not_fetch_news(market, client):
    market()
    body = client.post("/api/hype", json={"tickers": ["HYPD", "AAPL", "NOPE"]}).json()
    assert [i["ticker"] for i in body["items"]] == ["HYPD", "AAPL"] and body["missing"] == ["NOPE"]
    hyped = body["items"][0]
    assert hyped["level"] == "eleve" and hyped["points"] == 4
    assert hyped["components"][2]["points"] is None


def test_price_metrics_and_short_names():
    metrics = hype.price_metrics([["2026-11-12", 10.0]])
    assert metrics["volatility_1y"] is None and metrics["return_1m"] is None
    assert hype.price_metrics(None)["as_of"] is None
    assert hype.short_name("Palantir Technologies Inc.") == "Palantir Technologies"
    assert hype.short_name("Bitcoin USD") == "Bitcoin"
    assert hype.short_name("Royal Bank of Canada") == "Royal Bank of Canada"


# --- ESG ----------------------------------------------------------------------------------------------

def test_esg_of_apple_with_its_band_controversy_and_recent_controversy_headlines(market, client):
    market(news={"AAPL": [
        {"title": "Apple faces EU antitrust fine over App Store", "date": "2026-11-10", "url": "https://x/1",
         "publisher": "Reuters"},
        {"title": "Apple unveils a new iPhone", "date": "2026-11-09", "url": "https://x/2", "publisher": "AP"},
    ]})
    body = client.get("/api/esg/aapl").json()
    assert body["ticker"] == "AAPL" and body["message"] is None
    assert body["esg"] == {"risk_low": 15, "risk_high": 20, "risk_category": "faible",
                           "risk_label": "Risque ESG faible (15 à 20)", "controversy_level": 3,
                           "controversy_label": "Controverse de niveau 3 sur 5 (significative)",
                           "total_esg": None, "involvement": [], "source": body["esg"]["source"]}
    assert [(e["keyword"], e["date"]) for e in body["events"]] == [("antitrust", "2026-11-10")]
    assert [s["id"] for s in body["sources"]] == ["yahoo_screener_esg", "yahoo_news"]


def test_no_esg_data_is_null_with_a_french_message(market, client):
    market()
    body = client.get("/api/esg/XIU.TO").json()
    assert body["esg"] is None and body["events"] == [] and body["sources"] == []
    assert body["message"].startswith("Aucune donnée ESG chez Yahoo Finance pour XIU.TO")


def test_esg_screener_down_says_so(market, client):
    market(screener_down=True)
    body = client.get("/api/esg/AAPL").json()
    assert body["esg"] is None and "momentanément indisponibles" in body["message"]
