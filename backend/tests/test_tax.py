import numpy as np
import pytest

from app.services import tax_calc


def _params(**kw):
    base = dict(annual_contribution=1000.0, years=10, rate_now=0.30, rate_retirement=0.30,
                first_home_buyer=True, tfsa_room=1e9, tfsa_annual_limit=7000.0, rrsp_room=1e9)
    base.update(kw)
    return tax_calc.Params(**base)


def test_rules_file_is_sourced_and_dated():
    r = tax_calc.rules()
    assert r["year"] == 2026
    assert r["rrsp"]["dollar_limit"] == 33810
    assert r["tfsa"]["annual_limits"]["2026"] == 7000
    assert r["fhsa"]["annual_limit"] == 8000 and r["fhsa"]["lifetime_limit"] == 40000
    ids = {s["id"] for s in r["sources"]}
    for section in ("tfsa", "rrsp", "fhsa", "capital_gains"):
        assert r[section]["source_id"] in ids


def test_tfsa_cumulative_room_by_age():
    assert tax_calc.tfsa_cumulative_room(41, 2026) == 109_000   # eligible since 2009
    assert tax_calc.tfsa_cumulative_room(26, 2026) == 57_000    # turned 18 in 2018
    assert tax_calc.tfsa_cumulative_room(18, 2026) == 7_000


def test_rrsp_room_is_18_percent_capped():
    assert tax_calc.rrsp_annual_room(85_000) == pytest.approx(15_300)
    assert tax_calc.rrsp_annual_room(500_000) == 33_810
    assert tax_calc.rrsp_annual_room(None) == 33_810


def test_quebec_marginal_rate_from_brackets():
    combined, fed, qc = tax_calc.marginal_rate_quebec(85_000)
    assert fed == pytest.approx(0.205 * 0.835)
    assert qc == pytest.approx(0.19)
    assert combined == pytest.approx(0.361175)


def test_zero_return_hand_check():
    res = tax_calc.project(_params(rate_now=0.40, rate_retirement=0.20), np.zeros(10))
    assert res["CELI"].after_tax == pytest.approx(1000 * 0.6 * 10)      # 6 000
    assert res["REER"].after_tax == pytest.approx(1000 * 10 * 0.8)      # 8 000
    assert res["CELIAPP"].after_tax == pytest.approx(1000 * 10)         # 10 000 (deductible, tax-free)
    assert res["Non enregistré"].after_tax == pytest.approx(6000)       # no gain, no tax


def test_tfsa_equals_rrsp_when_rates_are_equal():
    res = tax_calc.project(_params(), np.full(10, 0.05))
    assert res["CELI"].after_tax == pytest.approx(res["REER"].after_tax)
    af = sum(1.05 ** k for k in range(1, 11))  # contributions at the start of each year
    assert res["CELI"].after_tax == pytest.approx(700 * af)


def test_taxable_account_pays_half_inclusion_on_gains():
    res = tax_calc.project(_params(years=1), np.array([0.10]))
    # deposit 700, value 770, gain 70, tax 70 x 0.5 x 0.30 = 10.5
    assert res["Non enregistré"].after_tax == pytest.approx(770 - 10.5)


def test_fhsa_lifetime_cap_sends_excess_to_taxable():
    res = tax_calc.project(_params(annual_contribution=10_000, years=6), np.zeros(6))
    fhsa = res["CELIAPP"]
    assert fhsa.deposits == pytest.approx(40_000)                      # 8 000 x 5
    # excess pre-tax 2 000 x 5 + 10 000 (year 6), taxed at 30 % before deposit
    assert fhsa.side_deposits == pytest.approx((2000 * 5 + 10_000) * 0.7)
    assert fhsa.after_tax == pytest.approx(40_000 + 14_000)


def test_fhsa_not_eligible_without_first_home():
    res = tax_calc.project(_params(first_home_buyer=False), np.zeros(10))
    assert res["CELIAPP"].eligible is False
    assert "CELIAPP" not in dict(tax_calc.ranking(res))


def test_tfsa_room_limits_deposit():
    res = tax_calc.project(_params(annual_contribution=20_000, years=2, tfsa_room=10_000, rate_now=0.0), np.zeros(2))
    assert res["CELI"].deposits == pytest.approx(10_000 + 7_000)
    assert res["CELI"].side_deposits == pytest.approx(40_000 - 17_000)


def test_bootstrap_is_seeded_and_centered():
    monthly = np.log1p(np.random.default_rng(0).normal(0.004, 0.03, 60))
    a = tax_calc.bootstrap_paths(monthly, 0.05, 15, 1000, seed=42)
    b = tax_calc.bootstrap_paths(monthly, 0.05, 15, 1000, seed=42)
    assert a.shape == (1000, 15)
    assert np.array_equal(a, b)
    assert np.median(np.log1p(a)) == pytest.approx(np.log1p(0.05), abs=0.01)
