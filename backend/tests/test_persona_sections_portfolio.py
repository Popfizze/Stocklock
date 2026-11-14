"""Profile sections of the dashboard, cryptocurrencies in the universe, and the portfolio analysis."""

from __future__ import annotations

import pytest

from app.services import portfolio, sections
from tests import profile_fakes as fakes
from tests.market_fakes import raw_quote
from tests.test_scores import install_table, score_row

CALM = fakes.steady(100, wiggle=0.008)
WILD = fakes.steady(100, wiggle=0.03)


def crypto(symbol: str, price: float, change: float = -1.5, name: str | None = None) -> dict:
    return raw_quote(symbol, price, change, name or f"{symbol.split('-')[0]} USD", quoteType="CRYPTOCURRENCY",
                     currency="USD")


CRYPTO_SCREEN = [crypto("BTC-USD", 63895.06, name="Bitcoin USD"), crypto("USDT-USD", 0.9993, 0.01),
                 crypto("ETH-USD", 1760.44, name="Ethereum USD"), crypto("USDC-USD", 1.0001, -0.02),
                 crypto("BCH-USD", 410.0, name="Bitcoin Cash USD")]


# --- Sections -----------------------------------------------------------------------------------------

@pytest.mark.parametrize("persona, first", [
    ("amira", ["ia-semis", "cryptos"]),
    ("mateo", ["esg-faible-risque"]),
    ("robert", ["dividendes", "faible-volatilite"]),
])
def test_profile_sections_come_first_with_their_reason(client, persona, first):
    body = client.get("/api/market/sections", params={"persona": persona}).json()
    own = [s for s in body if s["persona_reason"]]
    assert [s["id"] for s in own] == first
    assert body[:len(first)] == own
    assert [s["id"] for s in body[len(first):]] == [s.id for s in sections.SECTIONS]
    assert all(s["persona_reason"] is None for s in body[len(first):])


def test_section_reasons_follow_the_profile_and_unknown_profiles_are_404(client):
    mateo = client.get("/api/market/sections", params={"persona": "mateo"}).json()[0]
    assert mateo["persona_reason"] == "Préférence « ESG » de Mateo ; secteur(s) exclu(s) : Energy."
    assert client.get("/api/market/sections", params={"persona": "zoe"}).status_code == 404
    assert client.get("/api/market/sections/populaires", params={"persona": "zoe"}).status_code == 404


def test_crypto_section_keeps_cryptocurrencies_without_stablecoins(monkeypatch, client):
    fakes.install(monkeypatch, screens={"cryptos": CRYPTO_SCREEN})
    body = client.get("/api/market/sections/cryptos", params={"persona": "amira"}).json()
    assert body["status"] == "ok"
    assert [(i["ticker"], i["exchange"]) for i in body["items"]] == [
        ("BTC-USD", "Crypto"), ("ETH-USD", "Crypto"), ("BCH-USD", "Crypto")]


def test_with_a_profile_a_custom_screen_leaves_out_its_excluded_sectors(monkeypatch, client):
    calls = fakes.install(monkeypatch, screens={"esg_low_risk": [raw_quote("AAPL", 356.27, 0.4, "Apple Inc.")]})
    body = client.get("/api/market/sections/esg-faible-risque", params={"persona": "mateo"}).json()
    assert [i["ticker"] for i in body["items"]] == ["AAPL"]
    filters = next(c[1]["filters"] for c in calls if c[0] == "screen:esg_low_risk|sans:Energy")
    sector_filter = next(f for f in filters if f[1] == "sector")
    assert "Energy" not in sector_filter and "Technology" in sector_filter
    client.get("/api/market/sections/esg-faible-risque")
    assert any(c[0] == "screen:esg_low_risk" and len(c[1]["filters"]) == 2 for c in calls)


def test_search_lists_matching_cryptocurrencies_and_a_crypto_page_has_no_country(monkeypatch, client):
    fakes.install(monkeypatch, screens={"all_cryptos": CRYPTO_SCREEN})
    body = client.get("/api/universe/search", params={"q": "bitcoin"}).json()
    assert [c["ticker"] for c in body["crypto"]] == ["BTC-USD", "BCH-USD"]
    assert body["crypto"][0] == {"ticker": "BTC-USD", "name": "Bitcoin USD", "exchange": "Crypto", "country": None,
                                 "asset_class": "crypto"}
    assert client.get("/api/universe/search", params={"q": "eth"}).json()["crypto"][0]["ticker"] == "ETH-USD"
    assert client.get("/api/universe/search", params={"q": "apple"}).json()["crypto"] == []


def test_stock_page_of_a_crypto_and_of_a_listed_title(monkeypatch, client):
    from tests.market_fakes import chart, install_yahoo

    fakes.install(monkeypatch, screens={"all_cryptos": CRYPTO_SCREEN})
    install_yahoo(monkeypatch, charts={"BTC-USD": chart([60000.0 + i for i in range(30)], instrument="CRYPTOCURRENCY",
                                                        name="Bitcoin USD"),
                                       "AAPL": chart([350.0 + i for i in range(30)])},
                  screens={"all_cryptos": CRYPTO_SCREEN}, profiles={"AAPL": "Technology"})
    btc = client.get("/api/stocks/BTC-USD").json()
    assert (btc["asset_class"], btc["in_universe"], btc["country"]) == ("crypto", True, None)
    aapl = client.get("/api/stocks/AAPL").json()
    assert (aapl["in_universe"], aapl["country"]) == (True, "US")


# --- Portfolio ----------------------------------------------------------------------------------------

ROBERT_QUOTES = {
    "RY": fakes.quote("RY", 150.0, name="Royal Bank of Canada"),
    "JNJ": fakes.quote("JNJ", 285.0, name="Johnson & Johnson"),
    "NVDA": fakes.quote("NVDA", 162.85, name="NVIDIA Corporation"),
    "XIU.TO": fakes.quote("XIU.TO", 42.0, kind="ETF", name="iShares S&P/TSX 60 Index ETF", currency="CAD"),
    "BRK-B": fakes.quote("BRK-B", 590.0, name="Berkshire Hathaway Inc."),
    "AAPL": fakes.quote("AAPL", 356.27, name="Apple Inc."),
    "BTC-USD": fakes.quote("BTC-USD", 63895.0, kind="CRYPTOCURRENCY", name="Bitcoin USD"),
}
ROBERT_CLOSES = {"RY": CALM, "JNJ": CALM, "NVDA": WILD, "XIU.TO": CALM, "BRK-B": CALM, "AAPL": CALM, "BTC-USD": WILD}


@pytest.fixture
def robert_market(monkeypatch):
    return fakes.install(monkeypatch, quotes=ROBERT_QUOTES, closes=ROBERT_CLOSES,
                         screens={"low_beta": [raw_quote("BRK-B", 590.0, 0.1, "Berkshire Hathaway Inc."),
                                               raw_quote("JNJ", 285.0, 0.2, "Johnson & Johnson")],
                                  "us_largest": [raw_quote("AAPL", 356.27, 0.4, "Apple Inc.")]})


def analyze(client, persona: str, holdings: list[tuple[str, float]]):
    return client.post("/api/portfolio/analyze", json={
        "persona_id": persona, "holdings": [{"ticker": t, "weight": w} for t, w in holdings]})


def test_portfolio_weights_diversification_and_findings(robert_market, client):
    r = analyze(client, "robert", [("RY", 30), ("jnj", 20), ("NVDA", 10), ("XIU.TO", 40), ("RY", 10), ("ZZZZ", 5)])
    assert r.status_code == 200
    body = r.json()
    assert body["total_input_weight"] == 115 and body["missing"] == ["ZZZZ"]
    weights = {h["ticker"]: h["weight"] for h in body["holdings"]}
    # RY merged (30 + 10); ZZZZ left out; normalised over the 110 that remain.
    assert weights == pytest.approx({"RY": 40 / 110, "XIU.TO": 40 / 110, "JNJ": 20 / 110, "NVDA": 10 / 110},
                                    abs=1e-6)
    d = body["diversification"]
    assert {b["key"]: b["weight"] for b in d["by_sector"]} == pytest.approx(
        {"Financial Services": 40 / 110, "none": 40 / 110, "Healthcare": 20 / 110, "Technology": 10 / 110})
    assert {b["key"]: b["label"] for b in d["by_country"]} == {"US": "États-Unis", "CA": "Canada"}
    assert {b["key"] for b in d["by_asset_class"]} == {"equity", "etf"}
    assert d["positions_over_max"] == ["RY", "XIU.TO", "JNJ"]
    assert d["largest"][0]["over_max"] is True and d["max_position"] == 0.1
    assert d["hhi"] == pytest.approx(sum(w ** 2 for w in weights.values()), abs=1e-5)
    assert d["effective_positions"] == pytest.approx(1 / d["hhi"], abs=0.01)
    assert d["concentration"] == "elevee"
    assert d["portfolio_volatility"] is not None and d["portfolio_volatility"] < d["weighted_volatility"] + 1e-9
    severities = [f["severity"] for f in body["findings"]]
    assert severities[:4] == ["bloquant"] * 4  # three positions over 10 % and NVDA out of profile
    assert any("NVDA" in f["message"] and "hors profil" in f["message"] for f in body["findings"])
    assert any(f["message"].startswith("Concentration élevée") for f in body["findings"])
    nvda = next(h for h in body["holdings"] if h["ticker"] == "NVDA")
    assert nvda["fit"]["verdict"] == "hors_profil" and nvda["country"] == "US"


def test_without_the_score_table_suggestions_come_from_the_profile_sections(robert_market, client):
    body = analyze(client, "robert", [("RY", 50), ("JNJ", 50)]).json()
    s = body["suggestions"]
    assert s["source"] == "sections" and "sans score" in s["message"]
    # JNJ is held; AAPL (Technology, absent) before BRK-B (Financial Services, as RY).
    assert [i["ticker"] for i in s["items"]] == ["AAPL", "BRK-B"]
    assert s["items"][0]["reasons"][-1] == "Secteur « Technologie » absent du portefeuille : améliore la diversification."
    assert s["items"][0]["score"] is None


def test_with_the_score_table_suggestions_are_compatible_well_scored_and_diversifying(robert_market, monkeypatch,
                                                                                         client):
    install_table(monkeypatch, [score_row("NVDA", 91), score_row("AAPL", 80), score_row("BRK-B", 85),
                                score_row("RY", 70)])
    body = analyze(client, "robert", [("RY", 50), ("JNJ", 50)]).json()
    s = body["suggestions"]
    assert s["source"] == "score_table" and s["message"] is None
    # NVDA is out of profile; AAPL (Technology, absent) comes before BRK-B (Financial Services, held via RY).
    assert [(i["ticker"], i["score"]) for i in s["items"]] == [("AAPL", 80), ("BRK-B", 85)]
    assert s["items"][0]["reasons"][0] == "Score StockLock de 80 sur 100 (3e sur 4)."
    assert s["items"][0]["ranking"]["rank_change"] == 0 and body["scoring"]["custom"] is False
    assert "50,0 % du portefeuille seulement" in s["items"][1]["reasons"][-1]


def test_crypto_share_above_the_maximum_position_is_raised_for_amira(robert_market, client):
    body = analyze(client, "amira", [("BTC-USD", 30), ("AAPL", 35), ("JNJ", 35)]).json()
    messages = [f["message"] for f in body["findings"]]
    assert any(m.startswith("Cryptoactifs : 30,0 % du portefeuille") for m in messages)
    btc = next(h for h in body["holdings"] if h["ticker"] == "BTC-USD")
    assert btc["country"] is None and btc["sector"] is None
    assert {b["key"] for b in body["diversification"]["by_country"]} == {"none", "US"}


def test_portfolio_errors(robert_market, client):
    assert analyze(client, "robert", [("ZZZZ", 10)]).status_code == 422
    assert analyze(client, "zoe", [("RY", 10)]).status_code == 422
    assert analyze(client, "robert", [("RY", 0)]).status_code == 422
    assert analyze(client, "robert", [(f"T{i}", 1) for i in range(portfolio.MAX_HOLDINGS + 1)]).status_code == 422
