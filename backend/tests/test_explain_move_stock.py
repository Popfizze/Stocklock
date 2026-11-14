"""Step 2 on the stock page: rate decisions, crawler, Haiku digests and link judgements, explanations."""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from app.data import crawler, edgar, gdelt, http
from app.data.cache import ExternalUnavailable
from app.pipeline import explain_move_events as ev
from app.services import policy_events

ARTICLE_URL = "https://news.example.com/nvidia-forecast"
ARTICLE_HTML = """<html><head><title>Nvidia shares jump</title>
<meta property="og:description" content="Nvidia stock rose after the chipmaker raised its revenue forecast.">
<meta property="article:published_time" content="{day}T14:00:00Z"></head>
<body><nav>Markets menu that should be skipped</nav>
<p>Nvidia shares rose 9% on Thursday after the chipmaker raised its revenue forecast for the quarter.</p>
<script>var ignored = 1;</script></body></html>"""


def _stock(client, ticker="NVDA", period="2022", persona="robert"):
    return client.post("/api/explain-move/stock", json={"persona_id": persona, "ticker": ticker, "period": period})


# --- building blocks -------------------------------------------------------------------------------

def test_rate_decisions_are_dated_on_the_announcement_day():
    boc = policy_events.rate_decisions("V39079", date(2022, 1, 1), date(2022, 12, 31))
    fed = policy_events.rate_decisions("DFF", date(2022, 1, 1), date(2022, 12, 31))
    assert [d["date"] for d in boc][:2] == [date(2022, 3, 2), date(2022, 4, 13)]  # BoC announcements
    assert boc[0]["effective"] == date(2022, 3, 3) and boc[0]["change"] == pytest.approx(0.25)
    assert fed[0]["date"] == date(2022, 3, 16) and len(fed) == 7 and len(boc) == 7
    assert "hausse du taux de 0,25 point, 0,25 % → 0,50 %" in policy_events.label("Banque du Canada", boc[0])


def test_8k_items_are_described_in_french():
    assert edgar.describe_8k("2.02,9.01") == "8-K : résultats financiers (2.02)"
    assert edgar.describe_8k("5.02,7.01") == "8-K : départ ou nomination de dirigeants (5.02) ; " \
                                             "communication au marché (Reg FD) (7.01)"
    assert edgar.describe_8k("") == "8-K"


def test_crawler_keeps_title_description_date_and_paragraphs():
    page = crawler.parse(ARTICLE_HTML.format(day="2022-05-26"), "text/html", ARTICLE_URL, ARTICLE_URL)
    assert page.title == "Nvidia shares jump"
    assert page.description.startswith("Nvidia stock rose")
    assert page.published == "2022-05-26"
    assert "raised its revenue forecast" in page.text
    assert "menu" not in page.text and "ignored" not in page.text


def test_8k_press_release_is_the_first_exhibit_99(monkeypatch):
    index = """<table><tr><td>1</td><td>8-K</td><td><a href="/ix?doc=/Archives/x/nvda.htm">nvda.htm</a></td>
    <td>8-K</td></tr><tr><td>2</td><td>EX-99.1</td><td><a href="/Archives/edgar/data/1/000000000126000073/q2pr.htm">
    q2pr.htm</a></td><td>EX-99.1</td></tr><tr><td>4</td><td>SCHEMA</td><td><a href="/Archives/x.xsd">x.xsd</a></td>
    <td>EX-101.SCH</td></tr></table>"""
    seen = []

    def fake_text(source, url, **kwargs):
        seen.append(url)
        return index, "text/html", url

    monkeypatch.setattr(http, "get_text", fake_text)
    url = crawler.sec_press_release("https://www.sec.gov/Archives/edgar/data/1/000000000126000073/nvda.htm")
    assert url == "https://www.sec.gov/Archives/edgar/data/1/000000000126000073/q2pr.htm"
    assert seen == ["https://www.sec.gov/Archives/edgar/data/1/000000000126000073/0000000001-26-000073-index.htm"]


def test_crawler_honours_robots_txt(monkeypatch):
    def fake_text(source, url, **kwargs):
        if url.endswith("/robots.txt"):
            return "User-agent: *\nDisallow: /private/\n", "text/plain", url
        return "<p>" + "Public article text. " * 5 + "</p>", "text/html", url

    monkeypatch.setattr(http, "get_text", fake_text)
    assert crawler.fetch_page("https://site.example/news/a").text.startswith("Public article text.")
    with pytest.raises(ExternalUnavailable, match="robots.txt"):
        crawler.fetch_page("https://site.example/private/b")
    monkeypatch.setattr(http, "get_text", lambda source, url, **kw: (_ for _ in ()).throw(
        ExternalUnavailable(source, "HTTP 403")))
    crawler.reset()
    assert crawler.allowed("https://refusing.example/page") is False  # robots.txt refused: not crawled


def test_confidence_rules_are_shared():
    assert ev.confidence_level(10, 3, True, 0.9, 1.0)[0] == "je ne peux pas conclure"
    assert ev.confidence_level(200, 4, True, 0.1, 0.75)[0] == "élevée"
    assert ev.confidence_level(200, 4, True, 0.1, 0.0)[0] == "faible"


# --- the stock route, offline ------------------------------------------------------------------------

def test_stock_route_offline_states_what_is_missing(client):
    r = _stock(client, "RY.TO")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["window"] == {"start": "2022-01-01", "end": "2022-12-31"}
    assert body["benchmark"] == "XIU.TO" and body["method"] == "simple_diff"  # < 60 sessions before 2022
    assert body["series"][0] == {"date": "2021-12-31", "asset": 0.0, "benchmark": 0.0}
    assert len(body["policy_events"]) == 14
    # the 2022-07-14 drop follows the Bank of Canada's 100-point hike announced the day before
    july = next(m for m in body["moves"] if m["date"] == "2022-07-14")
    assert july["explanation"] == "hypothese" and july["verdict"] == "non jugé"
    assert july["event"]["kind"] == "décision BdC" and july["event"]["event_date"] == "2022-07-13"
    assert {m["explanation"] for m in body["moves"]} <= {"fait", "hypothese", "aucun_evenement"}
    assert any("GDELT indisponible" in w for w in body["warnings"])
    assert any("Jugement Haiku des liens indisponible" in w for w in body["warnings"])
    assert body["analysis"]["governance"]["passed"] is True


def test_stock_route_validates_its_inputs(client):
    assert _stock(client, period="5y").status_code == 422
    assert _stock(client, ticker="ZZZZZZ").status_code == 422
    assert _stock(client, persona="nobody").status_code == 422


def test_last_months_end_on_the_kits_last_price(client):
    body = _stock(client, "AAPL", "3m").json()
    assert body["window"]["end"] == "2026-11-12"
    assert body["window"]["start"] == "2026-08-12"
    assert body["method"] == "market_model"


# --- the stock route with a news peak, a readable article and Haiku ----------------------------------

@pytest.fixture
def news_world(client, monkeypatch):
    """A GDELT peak on NVDA's largest 2022 move, its article readable, and a scripted Haiku."""
    top = max(_stock(client).json()["moves"], key=lambda m: abs(m["abnormal"]))
    day = date.fromisoformat(top["date"])
    published = day + timedelta(days=1)  # the article comes out the day after the move

    def timeline(ticker, name, start, end):
        points = [{"date": (start + timedelta(days=i)).isoformat(), "value": 0.1, "articles": []}
                  for i in range((end - start).days + 1)]
        for p in points:
            if p["date"] == published.isoformat():
                p.update(value=5.0, articles=[{"title": "Nvidia shares jump", "url": ARTICLE_URL}])
        return gdelt.Timeline("q", points, False, "https://api.gdeltproject.org/test")

    def get_text(source, url, **kwargs):
        if url.endswith("/robots.txt"):
            raise ExternalUnavailable(source, "HTTP 404")
        if url == ARTICLE_URL:
            return ARTICLE_HTML.format(day=published.isoformat()), "text/html", url
        raise ExternalUnavailable(source, "HTTP 404")

    script = {"summary": "Nvidia a relevé sa prévision de revenus ; l'action a gagné 9 %.",
              "event_date": day.isoformat(), "excerpt": "Nvidia a relevé sa prévision de revenus"}
    calls: list[dict] = []

    def fake_call(payload):
        calls.append(payload)
        if payload["task"] == "move_digest":
            return {"digest": {"events": [
                {"id": e["id"], "summary": script["summary"], "event_date": script["event_date"],
                 "category": "Entreprise", "relevant": True} for e in payload["facts"]["events"]]}}
        if payload["task"] == "move_links":
            return {"links": {"links": [
                {"move_id": m["move_id"], "event_id": m["events"][0]["event_id"], "verdict": "plausible",
                 "reason": "La hausse de la prévision est cohérente avec la hausse du titre.",
                 "excerpt": script["excerpt"]} for m in payload["facts"]["moves"]]}}
        return {"answer": "Faits et hypothèses [starter_prices]. Simulation éducative, pas un conseil financier "
                          "personnalisé."}

    monkeypatch.setattr(gdelt, "timeline", timeline)
    monkeypatch.setattr(http, "get_text", get_text)
    monkeypatch.setattr("app.services.narration._call", fake_call)
    return {"day": day, "published": published, "script": script, "calls": calls}


def _top(body, day):
    return next(m for m in body["moves"] if m["date"] == day.isoformat())


def test_article_is_read_summarized_redated_and_judged(client, news_world):
    body = _stock(client).json()
    move = _top(body, news_world["day"])
    assert move["verdict"] == "plausible" and move["judged_by"] == "haiku"
    assert move["explanation"] == "hypothese"  # press coverage, not an issuer or central-bank source
    event = move["event"]
    assert event["kind"] == "pic GDELT" and event["summary_by"] == "haiku"
    assert event["date"] == news_world["published"].isoformat()        # published the day after
    assert event["event_date"] == news_world["day"].isoformat()        # Haiku dates the fact itself
    assert event["source_id"].startswith("web_") and event["category"] == "entreprise"
    sources = {s["id"]: s for s in body["analysis"]["sources"]}
    assert sources[event["source_id"]]["url"] == ARTICLE_URL
    assert {"bedrock_digest", "bedrock_links"} <= set(sources)
    tasks = [c["task"] for c in news_world["calls"]]
    assert tasks[:3] == ["move_digest", "move_links", "explain_move"]
    factor = next(f for f in body["analysis"]["factors"] if f["name"] == f"Mouvement du {news_world['day']}")
    assert factor["effect"].startswith("hypothèse (lien plausible)")


def test_invented_numbers_and_quotes_are_refused(client, news_world):
    news_world["script"].update(summary="Nvidia a relevé sa prévision ; l'action a gagné 40 %.",
                                excerpt="phrase absente du résumé")
    move = _top(_stock(client).json(), news_world["day"])
    event = next(e for e in move["events"] if e["kind"] == "pic GDELT")
    assert event["summary_by"] == "source"              # 40 % is not on the page: the description is kept
    assert event["summary"].startswith("Nvidia stock rose")
    assert move["verdict"] == "indéterminé"             # quote not found word for word
    assert move["explanation"] == "hypothese"


def test_a_fact_dated_after_its_publication_is_refused(client, news_world):
    news_world["script"]["event_date"] = (news_world["published"] + timedelta(days=3)).isoformat()
    move = _top(_stock(client).json(), news_world["day"])
    # the article keeps its publication date, the day after the move: it is not tied to the move
    assert all(e["kind"] != "pic GDELT" for e in move["events"])


def test_lab_exposes_the_new_stages_with_decisions(client, news_world):
    r = client.post("/api/lab/run", json={
        "persona_id": "robert", "step": "explain_move",
        "inputs": {"ticker": "NVDA", "start": "2022-01-01", "end": "2022-12-31"},
        "options": {"digest.model": "haiku", "plausibility.model": "haiku"}})
    assert r.status_code == 200, r.text
    stages = {s["id"]: s for s in r.json()["stages"]}
    assert list(stages) == ["prices", "benchmark", "moves", "macro", "policy_events", "company_events",
                            "world_events", "crawl", "digest", "attribution", "plausibility", "narration",
                            "governance"]
    assert stages["crawl"]["metrics"]["pages lues"] == 1
    assert any(d["question"].startswith("Redater l'événement") for d in stages["digest"]["decisions"])
    assert any(d["question"].startswith("Lien du mouvement") for d in stages["plausibility"]["decisions"])
    assert stages["policy_events"]["metrics"] == {"décisions Banque du Canada": 7, "décisions Fed": 7}
