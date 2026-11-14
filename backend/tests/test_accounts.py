import numpy as np
import pytest

from app.personas import get_persona
from app.services import account_guide, tax_calc
from app.services.account_projection import AssetIncome, eligible_dividend_rate, project_yearly


def _params(**kw):
    base = dict(annual_contribution=1000.0, years=10, rate_now=0.30, rate_retirement=0.30,
                first_home_buyer=True, tfsa_room=1e9, tfsa_annual_limit=7000.0, rrsp_room=1e9)
    base.update(kw)
    return tax_calc.Params(**base)


# --- projection maths ---------------------------------------------------------------------------

@pytest.mark.parametrize("kw", [
    {},
    {"rate_now": 0.40, "rate_retirement": 0.20},
    {"annual_contribution": 20_000, "tfsa_room": 10_000, "rrsp_room": 15_300, "years": 20},
    {"annual_contribution": 10_000, "years": 18, "fhsa_max_years": 12},
    {"first_home_buyer": False},
])
def test_without_distributions_matches_tax_calc(kw):
    p = _params(**kw)
    returns = np.linspace(-0.05, 0.12, p.years)
    ref = tax_calc.project(p, returns)
    new = project_yearly(p, returns)
    for account, expected in ref.items():
        got = new[account]
        assert got.eligible == expected.eligible
        if not expected.eligible:
            continue
        assert got.after_tax == pytest.approx(expected.after_tax)
        assert got.gross_value == pytest.approx(expected.gross_value)
        assert got.deposits == pytest.approx(expected.deposits)
        assert got.side_deposits == pytest.approx(expected.side_deposits)
        assert got.after_tax_by_year[-1] == pytest.approx(expected.after_tax)
        assert len(got.after_tax_by_year) == p.years


def test_us_withholding_hits_tfsa_and_fhsa_not_rrsp():
    p = _params(rate_now=0.30, rate_retirement=0.30)
    plain = project_yearly(p, np.full(10, 0.02), AssetIncome(dividend_yield=0.03))
    us = project_yearly(p, np.full(10, 0.02), AssetIncome(dividend_yield=0.03, us_withholding=True))
    assert us["REER"].after_tax == pytest.approx(plain["REER"].after_tax)
    assert us["REER"].withholding_lost == 0
    for account in ("CELI", "CELIAPP"):
        assert us[account].after_tax < plain[account].after_tax
        assert us[account].withholding_lost > 0
    # equal rates: REER == CELI without withholding, REER > CELI with it
    assert plain["REER"].after_tax == pytest.approx(plain["CELI"].after_tax)
    assert us["REER"].after_tax > us["CELI"].after_tax


def test_taxable_account_pays_tax_on_distributions_each_year():
    p = _params(years=1)
    res = project_yearly(p, np.array([0.0]), AssetIncome(dividend_yield=0.10, distribution_rate=0.20))
    t = res["Non enregistré"]
    # deposit 700, dividend 70 taxed 14 -> value 756, cost 756, no gain left to tax
    assert t.annual_tax_paid == pytest.approx(14)
    assert t.after_tax == pytest.approx(756)


def test_eligible_dividend_rate_matches_published_top_rate():
    assert eligible_dividend_rate(300_000) == pytest.approx(0.4011, abs=0.0005)
    assert eligible_dividend_rate(85_000) < tax_calc.marginal_rate_quebec(85_000)[0]


# --- profile and asset --------------------------------------------------------------------------

def test_tax_profiles_use_demo_values_and_rules():
    amira = account_guide.tax_profile(get_persona("amira"))
    assert amira.income == 62_000 and amira.first_home_buyer and amira.fhsa_eligible
    assert amira.fhsa_years == 15
    assert amira.tfsa_room == 57_000
    assert amira.rate_retirement < amira.rate_now
    robert = account_guide.tax_profile(get_persona("robert"), first_home_buyer=True)
    assert robert.fhsa_years == 12  # 71 - 59
    assert not account_guide.tax_profile(get_persona("mateo")).fhsa_eligible


@pytest.mark.parametrize("ticker,kind,withholding,er", [
    ("RY.TO", "cad_dividend", False, 0.063),
    ("AAPL", "foreign_dividend", True, 0.064),
    ("XBB.TO", "interest", False, 0.032),
    ("ZST.TO", "interest", False, 0.024),
    ("BTC-USD", "none", False, 0.075),
    ("GLD", "none", False, 0.031),
])
def test_asset_profiles(ticker, kind, withholding, er):
    a = account_guide.asset_profile(ticker)
    assert a.income_type == kind
    assert a.us_withholding is withholding
    assert a.expected_return == pytest.approx(er)
    assert a.hist_volatility and a.hist_volatility > 0
    if kind in ("cad_dividend", "foreign_dividend"):
        assert 0 < a.dividend_yield < 0.15


def test_build_for_a_us_dividend_stock_explains_the_withholding():
    out = account_guide.build(get_persona("mateo"), ticker="JNJ")
    reer = next(a for a in out["recommendations"]["accounts"] if a["account"] == "REER")
    celi = next(a for a in out["recommendations"]["accounts"] if a["account"] == "CELI")
    assert any("exemptés de la retenue" in p for p in reer["pros"])
    assert any("Retenue américaine" in c for c in celi["cons"])
    assert out["recommendations"]["accounts"][-1]["verdict"] == "ineligible"  # CELIAPP, not first buyer
    assert len(out["series"]) == 15 and out["series"][0]["CELIAPP"] is None
    ids = {s["id"] for s in out["sources"]}
    assert {"canada_us_treaty", "iqpf_2026", "starter_prices"} <= ids


def test_profile_flags():
    out = account_guide.build(get_persona("robert"), ticker="BTC-USD")
    text = " ".join(out["profile_flags"])
    assert "Horizon simulé de 15 ans" in text
    assert "exclut la crypto" in text
    assert "Volatilité historique" in text
    assert "71 ans" in text
    assert "ne respecte pas le profil de Robert" in out["recommendations"]["headline"]
    mateo = account_guide.build(get_persona("mateo"), ticker="ENB.TO")["profile_flags"]
    assert any("Energy" in f for f in mateo)
    # an asset within the profile and a horizon within Amira's: no flag, no warning
    amira = account_guide.build(get_persona("amira"), ticker="XIU.TO")
    assert amira["profile_flags"] == []
    assert "Attention" not in amira["recommendations"]["headline"]


# --- API ----------------------------------------------------------------------------------------

def test_rules_route(client):
    body = client.get("/api/accounts/rules").json()
    assert body["tfsa_total_since_2009"] == 109_000
    assert body["projection_returns"]["canadian_equities"] == 0.063
    assert {"cra_tfsa", "iqpf_2026"} <= {s["id"] for s in body["sources"]}


def test_assets_route(client):
    body = client.get("/api/accounts/assets").json()
    assert len(body) == 31 and body[0] == {"ticker": "RY.TO", "name": "Royal Bank of Canada",
                                          "asset_class": "equity", "currency": "CAD", "sector": "Financials"}


def test_projection_route_generic_and_overrides(client):
    r = client.post("/api/accounts/projection", json={"persona_id": "amira"})
    assert r.status_code == 200
    body = r.json()
    assert body["asset"] is None and body["inputs"]["total_return"] == 0.05
    assert [a["account"] for a in body["accounts"]] == ["CELI", "REER", "CELIAPP", "Non enregistré"]
    assert body["ranking"][0]["account"] == "CELIAPP"  # deductible and tax-free, Amira is a first buyer
    r2 = client.post("/api/accounts/projection", json={"persona_id": "amira", "first_home_buyer": False,
                                                       "income": 150_000, "years": 10})
    body2 = r2.json()
    assert body2["profile"]["income"] == 150_000 and len(body2["series"]) == 10
    assert body2["accounts"][2]["eligible"] is False


def test_projection_route_rejects_unknown_ticker_and_persona(client):
    assert client.post("/api/accounts/projection", json={"persona_id": "amira", "ticker": "ZZZZ"}).status_code == 422
    assert client.post("/api/accounts/projection", json={"persona_id": "zorro"}).status_code == 422
