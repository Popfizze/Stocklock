"""Market model of « Comprendre »: enough sessions, a recent listing's first sessions left out, plausible output."""

import numpy as np
import pandas as pd

from app.pipeline.explain_move import IPO_SKIP_SESSIONS, MIN_EST_SESSIONS, fit_market_model


def _returns(n: int, start: str, asset_drift: float = 0.0, seed: int = 1) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    bench = rng.normal(0.0003, 0.01, n)
    asset = 1.2 * bench + asset_drift + rng.normal(0, 0.005, n)
    index = pd.bdate_range(start, periods=n)
    return pd.DataFrame({"asset": asset, "bench": bench}, index=index)


def test_a_long_history_gives_the_market_model():
    est = _returns(250, "2025-01-02")
    win = _returns(60, "2026-01-02", seed=2)
    fit = fit_market_model(est, win, pd.Timestamp("2010-01-04"), float(np.prod(1 + win["bench"]) - 1))
    assert fit["method"] == "market_model"
    assert 1.0 < fit["beta"] < 1.4
    assert len(fit["est"]) == 250


def test_a_recent_listing_drops_its_first_sessions_then_falls_back_when_too_short():
    est = _returns(MIN_EST_SESSIONS + IPO_SKIP_SESSIONS - 1, "2025-07-01")
    win = _returns(60, "2026-01-02", seed=2)
    fit = fit_market_model(est, win, est.index.min(), 0.02)
    assert len(fit["est"]) == MIN_EST_SESSIONS - 1
    assert fit["method"] == "simple_diff"
    assert "séances" in fit["reason"]


def test_an_implausible_expected_return_falls_back_to_the_simple_difference():
    # An IPO run-up: +3 % a day on average during estimation, so alpha compounds to absurd values over the window.
    est = _returns(200, "2025-01-02", asset_drift=0.03)
    win = _returns(250, "2026-01-02", seed=2)
    r_bench = float(np.prod(1 + win["bench"]) - 1)
    fit = fit_market_model(est, win, pd.Timestamp("2010-01-04"), r_bench)
    assert fit["method"] == "simple_diff"
    assert "peu plausible" in fit["reason"]
