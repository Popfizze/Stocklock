"""Step 1 scoring maths (pure): raw metrics -> 0-100 sub-scores -> weighted score; suggestions.

Fixed thresholds (linear, clamped; first bound -> 0, second -> 100):
- net margin -5 % -> 25 %, ROE 0 % -> 30 % (profitability = mean of both)
- debt / equity 2.0 -> 0 (lower is better); Financials: equity / assets 4 % -> 12 %
- revenue growth -10 % -> +30 %
- annualized volatility 60 % -> 10 % (lower is better)
- maximum drawdown -50 % -> -5 %
- 12-1 month momentum -20 % -> +40 %
- GDELT average tone -3 -> +3
Universe rank replaces each threshold by the percentile among the starter-universe peers.
Missing sub-scores are dropped and the remaining weights renormalized.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.data import starter
from app.services import market, profile

PRESETS: dict[str, dict[str, float]] = {
    "balanced": {"profitability": 0.25, "leverage": 0.15, "growth": 0.15, "volatility": 0.15,
                 "drawdown": 0.10, "momentum": 0.10, "news_tone": 0.10},
    "quality": {"profitability": 0.35, "leverage": 0.20, "growth": 0.15, "volatility": 0.10,
                "drawdown": 0.10, "momentum": 0.05, "news_tone": 0.05},
    "risk": {"profitability": 0.10, "leverage": 0.15, "growth": 0.05, "volatility": 0.30,
             "drawdown": 0.25, "momentum": 0.05, "news_tone": 0.10},
}

LABELS = {
    "profitability": "Sous-score profitabilité",
    "leverage": "Sous-score endettement",
    "growth": "Sous-score croissance",
    "volatility": "Sous-score volatilité",
    "drawdown": "Sous-score repli maximal",
    "momentum": "Sous-score momentum",
    "news_tone": "Sous-score ton médiatique",
}

THRESHOLDS: dict[str, tuple[float, float]] = {
    "net_margin": (-0.05, 0.25),
    "roe": (0.0, 0.30),
    "debt_to_equity": (2.0, 0.0),
    "equity_to_assets": (0.04, 0.12),
    "revenue_growth": (-0.10, 0.30),
    "volatility": (0.60, 0.10),
    "max_drawdown": (-0.50, -0.05),
    "momentum": (-0.20, 0.40),
    "news_tone": (-3.0, 3.0),
}
LOWER_IS_BETTER = {"debt_to_equity", "volatility"}

FUNDAMENTAL_METRICS = ("net_margin", "roe", "debt_to_equity", "equity_to_assets", "revenue_growth")
PRICE_METRICS = ("volatility", "max_drawdown", "momentum")


@dataclass
class PriceMetrics:
    as_of: pd.Timestamp
    volatility: float | None
    max_drawdown: float | None
    momentum: float | None
    rows: int


def price_metrics(series: pd.Series, as_of: pd.Timestamp, years: int = 1) -> PriceMetrics:
    win = market.window(series, as_of - pd.DateOffset(years=years), as_of)
    return PriceMetrics(as_of, market.annualized_volatility(win), market.max_drawdown(win),
                        market.momentum_12_1(series, as_of), len(win))


def raw_metrics(fund: Any, prices: PriceMetrics, tone: float | None) -> dict[str, float | None]:
    out: dict[str, float | None] = {k: None for k in (*FUNDAMENTAL_METRICS, *PRICE_METRICS, "news_tone")}
    if fund is not None:
        out.update(net_margin=fund.net_margin, roe=fund.roe, debt_to_equity=fund.debt_to_equity,
                   equity_to_assets=fund.equity_to_assets, revenue_growth=fund.revenue_growth)
    out.update(volatility=prices.volatility, max_drawdown=prices.max_drawdown, momentum=prices.momentum,
               news_tone=tone)
    return out


def percentile(x: float | None, peers: list[float], lower_is_better: bool) -> float | None:
    vals = [p for p in peers if p is not None and p == p]
    if x is None or not vals:
        return None
    below = sum(1 for p in vals if p < x) + 0.5 * sum(1 for p in vals if p == x)
    rank = below / len(vals)
    return float((1 - rank if lower_is_better else rank) * 100)


def metric_scores(metrics: dict[str, float | None], peers: dict[str, list[float]] | None = None
                  ) -> dict[str, float | None]:
    """0-100 score per raw metric, by fixed thresholds or by universe percentile when peers given."""
    out = {}
    for name, value in metrics.items():
        if peers is not None and name in peers:
            out[name] = percentile(value, peers[name], name in LOWER_IS_BETTER)
        else:
            lo, hi = THRESHOLDS[name]
            out[name] = market.scale(value, lo, hi)
    return out


def subscores(scores: dict[str, float | None], financial: bool) -> dict[str, float | None]:
    prof = [s for s in (scores["net_margin"], scores["roe"]) if s is not None]
    return {
        "profitability": sum(prof) / len(prof) if prof else None,
        "leverage": scores["equity_to_assets"] if financial else scores["debt_to_equity"],
        "growth": scores["revenue_growth"],
        "volatility": scores["volatility"],
        "drawdown": scores["max_drawdown"],
        "momentum": scores["momentum"],
        "news_tone": scores["news_tone"],
    }


def weighted_score(subs: dict[str, float | None], weights: dict[str, float]
                   ) -> tuple[float | None, dict[str, float]]:
    available = {k: v for k, v in subs.items() if v is not None}
    total_w = sum(weights[k] for k in available)
    if total_w == 0:
        return None, {}
    effective = {k: weights[k] / total_w for k in available}
    return sum(available[k] * effective[k] for k in available), effective


def price_only_score(pm: PriceMetrics) -> float | None:
    scores = metric_scores({"volatility": pm.volatility, "max_drawdown": pm.max_drawdown,
                            "momentum": pm.momentum})
    subs = {k: None for k in PRESETS["balanced"]}
    subs.update(volatility=scores["volatility"], drawdown=scores["max_drawdown"], momentum=scores["momentum"])
    return weighted_score(subs, PRESETS["balanced"])[0]


def universe_price_peers(as_of: pd.Timestamp, years: int) -> dict[str, list[float]]:
    peers: dict[str, list[float]] = {m: [] for m in PRICE_METRICS}
    for t in starter.universe()["ticker"]:
        pm = price_metrics(starter.adj_close(t), as_of, years)
        for m in PRICE_METRICS:
            v = getattr(pm, m)
            if v is not None:
                peers[m].append(v)
    return peers


def suggest(persona: dict[str, Any], held: list[str], as_of: pd.Timestamp, corr_years: int,
            k: int = 3) -> tuple[list[dict[str, Any]], int]:
    """Universe assets that lower portfolio correlation and respect the persona's constraints.

    rank = 50 % diversification ((1 - weekly correlation with the equal-weight portfolio, in CAD)
           / 1.2) + 30 % price-only score + 20 % new-sector bonus. Returns (top k, candidates seen).
    """
    held = [t for t in dict.fromkeys(held) if starter.in_starter(t)]
    if not held:
        return [], 0
    start = as_of - pd.DateOffset(years=corr_years)
    weekly = [market.weekly_returns(market.window(starter.adj_close_cad(t), start, as_of)) for t in held]
    port = pd.concat(weekly, axis=1, join="inner").mean(axis=1)
    held_sectors = {starter.asset_info(t)["sector"] for t in held}
    out, seen = [], 0
    for _, row in starter.universe().iterrows():
        cand = row["ticker"]
        if cand in held:
            continue
        info = row.to_dict()
        pm = price_metrics(starter.adj_close(cand), as_of)
        if not profile.fits(persona, info, pm.volatility):
            continue
        seen += 1
        cw = market.weekly_returns(market.window(starter.adj_close_cad(cand), start, as_of))
        both = pd.concat({"p": port, "c": cw}, axis=1, join="inner").dropna()
        if len(both) < 20:
            continue
        corr = float(both["p"].corr(both["c"]))
        diversification = max(0.0, min(100.0, (1 - corr) / 1.2 * 100))
        quality = price_only_score(pm) or 0.0
        new_sector = info["sector"] not in held_sectors
        rank = 0.5 * diversification + 0.3 * quality + 0.2 * (100.0 if new_sector else 0.0)
        out.append({"ticker": cand, "name": info["name"], "sector": info["sector"], "corr": corr,
                    "volatility": pm.volatility, "price_score": quality, "new_sector": new_sector,
                    "rank": rank})
    out.sort(key=lambda r: r["rank"], reverse=True)
    return out[:k], seen
