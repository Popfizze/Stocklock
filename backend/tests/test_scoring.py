from datetime import date

import pandas as pd
import pytest

from app.services import fundamentals as fmod
from app.services import market, scoring


def _fund(**kw):
    base = dict(source="edgar", period="annual", period_end=date(2025, 12, 31), available_on=date(2026, 2, 1),
                currency_reported="USD", usd_per_unit=1.0, revenue=100.0, revenue_prev=80.0, net_income=10.0,
                equity=50.0, assets=200.0, debt=25.0, debt_concept="LongTermDebt")
    base.update(kw)
    return fmod.Fundamentals(**base)


def _prices(vol=0.35, mdd=-0.275, mom=0.10):
    return scoring.PriceMetrics(pd.Timestamp("2026-11-12"), vol, mdd, mom, 252)


def test_scale_is_linear_and_clamped():
    assert market.scale(0.10, 0.0, 0.20) == pytest.approx(50.0)
    assert market.scale(-1.0, 0.0, 0.20) == 0.0
    assert market.scale(1.0, 0.0, 0.20) == 100.0
    assert market.scale(0.35, 0.60, 0.10) == pytest.approx(50.0)  # inverted scale
    assert market.scale(None, 0, 1) is None


def test_subscores_on_fixture_match_hand_computation():
    f = _fund()
    # net margin 10 % -> (0.10+0.05)/0.30 = 50 ; ROE 20 % -> 66.67 ; profitability = 58.33
    # D/E 0.5 -> (0.5-2)/(0-2) = 75 ; growth 25 % -> 87.5
    # vol 35 % -> 50 ; drawdown -27.5 % -> 50 ; momentum 10 % -> 50 ; tone 0 -> 50
    metrics = scoring.raw_metrics(f, _prices(), 0.0)
    subs = scoring.subscores(scoring.metric_scores(metrics), financial=False)
    assert subs["profitability"] == pytest.approx(58.333, abs=1e-2)
    assert subs["leverage"] == pytest.approx(75.0)
    assert subs["growth"] == pytest.approx(87.5)
    assert subs["volatility"] == pytest.approx(50.0)
    assert subs["drawdown"] == pytest.approx(50.0)
    assert subs["momentum"] == pytest.approx(50.0)
    assert subs["news_tone"] == pytest.approx(50.0)
    total, eff = scoring.weighted_score(subs, scoring.PRESETS["balanced"])
    expected = 0.25 * 58.3333 + 0.15 * 75 + 0.15 * 87.5 + 0.15 * 50 + 0.10 * 50 + 0.10 * 50 + 0.10 * 50
    assert total == pytest.approx(expected, abs=1e-2)
    assert sum(eff.values()) == pytest.approx(1.0)


def test_financials_use_equity_to_assets():
    subs = scoring.subscores(scoring.metric_scores(scoring.raw_metrics(_fund(), _prices(), None)), financial=True)
    # equity / assets = 25 % -> above 12 % -> 100
    assert subs["leverage"] == 100.0


def test_missing_subscores_renormalize_weights():
    subs = {k: None for k in scoring.PRESETS["balanced"]}
    subs.update(volatility=80.0, drawdown=40.0)
    total, eff = scoring.weighted_score(subs, scoring.PRESETS["balanced"])
    assert eff == pytest.approx({"volatility": 0.6, "drawdown": 0.4})
    assert total == pytest.approx(0.6 * 80 + 0.4 * 40)


def test_presets_sum_to_one():
    for weights in scoring.PRESETS.values():
        assert sum(weights.values()) == pytest.approx(1.0)


def test_universe_rank_percentile_direction():
    peers = [0.1, 0.2, 0.3, 0.4]
    assert scoring.percentile(0.35, peers, lower_is_better=False) == pytest.approx(75.0)
    assert scoring.percentile(0.35, peers, lower_is_better=True) == pytest.approx(25.0)
    ranked = scoring.metric_scores({"volatility": 0.15, "momentum": 0.5}, {"volatility": [0.1, 0.2, 0.3]})
    assert ranked["volatility"] == pytest.approx(100 * (1 - 1 / 3))
    assert ranked["momentum"] == 100.0  # no peers given -> fixed threshold


def test_price_metrics_on_synthetic_series():
    idx = pd.bdate_range("2025-01-01", periods=300)
    s = pd.Series([100.0] * 300, index=idx)
    s.iloc[100:] = 80.0
    pm = scoring.price_metrics(s, idx[-1], 1)
    assert pm.max_drawdown == pytest.approx(-0.2)
    assert market.total_return(s) == pytest.approx(-0.2)


def _row(val, end, filed, form="10-K", fp="FY", start=None):
    r = {"val": val, "end": end, "filed": filed, "form": form, "fp": fp, "accn": "x"}
    if start:
        r["start"] = start
    return r


EDGAR_FIXTURE = {
    "entityName": "Fixture Corp",
    "facts": {"us-gaap": {
        "NetIncomeLoss": {"units": {"USD": [
            _row(8, "2024-12-31", "2025-02-15", start="2024-01-01"),
            _row(10, "2025-12-31", "2026-02-15", start="2025-01-01"),
            _row(3, "2025-06-30", "2025-08-01", "10-Q", "Q2", start="2025-01-01"),
            _row(5, "2026-06-30", "2026-08-01", "10-Q", "Q2", start="2026-01-01"),
        ]}},
        "Revenues": {"units": {"USD": [
            _row(80, "2024-12-31", "2025-02-15", start="2024-01-01"),
            _row(100, "2025-12-31", "2026-02-15", start="2025-01-01"),
            _row(45, "2025-06-30", "2025-08-01", "10-Q", "Q2", start="2025-01-01"),
            _row(60, "2026-06-30", "2026-08-01", "10-Q", "Q2", start="2026-01-01"),
        ]}},
        "StockholdersEquity": {"units": {"USD": [
            _row(40, "2024-12-31", "2025-02-15"), _row(50, "2025-12-31", "2026-02-15"),
            _row(55, "2026-06-30", "2026-08-01", "10-Q", "Q2")]}},
        "Assets": {"units": {"USD": [_row(200, "2025-12-31", "2026-02-15"), _row(210, "2026-06-30", "2026-08-01", "10-Q", "Q2")]}},
        "LongTermDebt": {"units": {"USD": [_row(25, "2025-12-31", "2026-02-15"), _row(20, "2026-06-30", "2026-08-01", "10-Q", "Q2")]}},
    }},
}


def _raw():
    return fmod.RawFundamentals("edgar", "fixture", "https://example.invalid", EDGAR_FIXTURE, "USD", False, 0)


def test_edgar_annual_point_in_time_uses_filing_date():
    # On 2026-01-31 the FY2025 10-K (filed 2026-02-15) is not public yet: FY2024 is used.
    f = fmod.normalize(_raw(), "annual", True, date(2026, 1, 31))
    assert f.period_end == date(2024, 12, 31) and f.net_income == 8
    assert f.excluded_by_pit >= 1
    # Point-in-time off: the FY2025 figures leak in (look-ahead bias)
    leak = fmod.normalize(_raw(), "annual", False, date(2026, 1, 31))
    assert leak.period_end == date(2025, 12, 31) and leak.net_income == 10
    assert leak.revenue_growth == pytest.approx(0.25)


def test_edgar_ttm_combines_fy_and_ytd():
    f = fmod.normalize(_raw(), "ttm", True, date(2026, 9, 1))
    # TTM to 2026-06-30 = FY2025 + H1 2026 - H1 2025
    assert f.period_end == date(2026, 6, 30)
    assert f.net_income == pytest.approx(10 + 5 - 3)
    assert f.revenue == pytest.approx(100 + 60 - 45)
    assert f.equity == 55 and f.debt == 20
