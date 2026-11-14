import pandas as pd
import pytest

from app.data import starter
from app.services import simulation


def _series():
    idx = pd.bdate_range("2022-01-03", periods=8, freq="60D")
    # 100 -> 85 -> 70 (trough) -> 90 -> 100 -> 120 -> 130 -> 140
    value = pd.Series([100, 85, 70, 90, 100, 120, 130, 140], index=idx, dtype=float)
    cash = pd.Series(1.0, index=idx)
    return value, cash


def test_panic_sale_at_trough_never_reenter():
    value, cash = _series()
    res = simulation.simulate_panic(value, cash, "trough", "never")
    assert res.sell_value == 70
    assert res.drawdown_at_sale == pytest.approx(-0.30)
    assert res.hold_final == 140
    assert res.panic_final == pytest.approx(70)       # cash at 0 %
    assert res.difference == pytest.approx(70)


def test_first_minus_20_sells_earlier():
    value, cash = _series()
    res = simulation.simulate_panic(value, cash, "first_minus_20", "never")
    assert res.sell_value == 70            # first observation <= 80 is the 70 point
    value2 = value.copy()
    value2.iloc[2] = 85                    # never reaches -20 %
    res2 = simulation.simulate_panic(value2, cash, "first_minus_20", "never")
    assert res2.sell_date is None and res2.panic_final == res2.hold_final


def test_reentry_after_recovery_buys_back_higher():
    value, cash = _series()
    res = simulation.simulate_panic(value, cash, "trough", "after_recovery")
    assert res.reentry_date == value.index[4]           # back to 100
    # 70 of cash buys 0.7 unit at 100 -> 0.7 x 140 = 98
    assert res.panic_final == pytest.approx(98)
    assert res.hold_final > res.panic_final


def test_real_60_40_2022_panic_versus_hold():
    prices = pd.concat({t: starter.adj_close_cad(t) for t in ("SPY", "AGG")}, axis=1, join="inner").dropna()
    value = simulation.portfolio_value(prices, {"SPY": 0.6, "AGG": 0.4}, pd.Timestamp("2022-01-01"), 10_000)
    res = simulation.simulate_panic(value, starter.adj_close_cad("ZST.TO"), "trough", "never")
    assert res.start == pd.Timestamp("2022-01-03")
    assert res.sell_date.year == 2022
    assert -0.25 < res.drawdown_at_sale < -0.05
    assert res.hold_final > res.panic_final
    assert value.iloc[0] == pytest.approx(10_000)
