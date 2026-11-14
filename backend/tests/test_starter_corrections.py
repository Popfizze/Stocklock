import pandas as pd
import pytest

from app.data import starter


def test_cnq_fix_multiplies_prices_before_spurious_split():
    raw = starter.history("CNQ.TO", cnq_fix=False)
    fixed = starter.history("CNQ.TO", cnq_fix=True)
    before = pd.Timestamp("2022-08-19")
    after = pd.Timestamp("2022-08-22")
    assert fixed.loc[before, "adj_close"] == pytest.approx(raw.loc[before, "adj_close"] * 1.021)
    assert fixed.loc[before, "close"] == pytest.approx(raw.loc[before, "close"] * 1.021)
    assert fixed.loc[after, "adj_close"] == pytest.approx(raw.loc[after, "adj_close"])
    # other tickers untouched
    assert starter.adj_close("RY.TO", True).equals(starter.adj_close("RY.TO", False))


def test_cnq_fix_drops_split_row_and_restores_dividends():
    acts = starter.corporate_actions(cnq_fix=True)
    cnq = acts.loc[acts["ticker"] == "CNQ.TO"]
    assert not ((cnq["action"] == "split") & (cnq["ex_date"] == pd.Timestamp("2022-08-22"))).any()
    june = cnq.loc[cnq["ex_date"] == pd.Timestamp("2022-06-16"), "value"].iloc[0]
    assert june == pytest.approx(0.375, abs=1e-4)  # 0.367287 x 1.021
    # the genuine 2024 2:1 split is kept
    assert ((cnq["action"] == "split") & (cnq["ex_date"] == pd.Timestamp("2024-06-11"))).any()


def test_fx_carries_last_rate_forward_on_missing_days():
    fx = starter.fx_usdcad()
    us_days = starter.history("SPY").index
    missing = us_days.difference(fx.index)
    assert len(missing) > 0, "expected U.S. trading days without a Bank of Canada rate"
    day = missing[0]
    previous = fx.loc[fx.index < day].iloc[-1]
    assert starter.fx_asof(fx, pd.DatetimeIndex([day])).iloc[0] == pytest.approx(previous)


def test_fx_asof_synthetic_gap():
    fx = pd.Series([1.30, 1.35], index=pd.to_datetime(["2024-07-02", "2024-07-04"]))
    out = starter.fx_asof(fx, pd.to_datetime(["2024-07-03", "2024-07-04", "2024-07-06"]))
    assert list(out) == [1.30, 1.35, 1.35]


def test_monthly_macro_is_lagged_one_month():
    table = starter.macro(1)
    row = table.loc[(table["series_id"] == "UNRATE") & (table["date"] == pd.Timestamp("2022-01-01"))].iloc[0]
    assert row["available_date"] == pd.Timestamp("2022-02-01")
    daily = table.loc[(table["series_id"] == "DFF") & (table["date"] == pd.Timestamp("2022-03-17"))].iloc[0]
    assert daily["available_date"] == daily["date"]
    # mid-January 2022: January's value is not public yet, December 2021 is the latest usable
    point = starter.macro_asof("UNRATE", pd.Timestamp("2022-01-15"), lag_months=1)
    assert str(point.ref_date) == "2021-12-01"
    # without the lag January would leak in on its reference date
    assert str(starter.macro_asof("UNRATE", pd.Timestamp("2022-01-15"), lag_months=0).ref_date) == "2022-01-01"


def test_missing_2025_10_us_cpi_is_flagged_stale():
    point = starter.macro_asof("CPIAUCSL", pd.Timestamp("2025-11-20"), lag_months=1)
    assert str(point.ref_date) == "2025-09-01"
    assert point.stale is True
    ok = starter.macro_asof("CPIAUCSL", pd.Timestamp("2025-10-20"), lag_months=1)
    assert str(ok.ref_date) == "2025-09-01" and ok.stale is False


def test_us_cpi_yoy_uses_lagged_index():
    value, ref = starter.us_cpi_yoy_asof(pd.Timestamp("2022-12-15"))
    assert str(ref) == "2022-11-01"
    assert 6.5 < value < 7.5  # November 2022 U.S. CPI inflation was about 7.1 %
    # the kit starts in 2021-11: no year-over-year value before 2022-11
    assert starter.us_cpi_yoy_asof(pd.Timestamp("2022-07-15")) is None
