"""Stock-page view of step 2 (POST /api/explain-move/stock): window, chart series, moves and their events."""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from app.data import starter
from app.pipeline import explain_move_events as ev
from app.pipeline.core import RunResult
from app.schemas import AnalysisResponse

PERIOD_MONTHS = {"3m": 3, "6m": 6, "1y": 12}


def window_for(period: str) -> tuple[date, date]:
    """[start, end] of a period: the last months up to the kit's last price, or a whole year ("2024")."""
    if period.isdigit():
        return date(int(period), 1, 1), min(date(int(period), 12, 31), starter.last_price_date().date())
    end = starter.last_price_date()
    return (end - pd.DateOffset(months=PERIOD_MONTHS[period])).date(), end.date()


def _num(value: Any) -> float | None:
    return None if value is None or pd.isna(value) else round(float(value), 6)


def _event(e: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": e.get("id"), "date": e["date"].isoformat(), "event_date": ev.when(e).isoformat(),
        "kind": e["kind"], "label": e["label"], "summary": e.get("summary") or e["label"],
        "summary_by": e.get("summary_by", "source"), "category": ev.default_category(e),
        "primary": ev.is_primary(e), "url": e.get("read_url") or e.get("url"),
        "source_id": e.get("page_source_id") or e.get("source_id"),
    }


def _series(rets: pd.DataFrame | None, before: pd.Series | None) -> list[dict[str, Any]]:
    """Cumulative return of the title and of its index over the window; it starts at 0 on the last
    common session before the window (`before`: the estimation returns) when there is one."""
    if rets is None or rets.empty:
        return []
    growth = (1 + rets[["asset", "bench"]]).cumprod() - 1
    points = []
    if before is not None and len(before):
        points.append({"date": before.index[-1].date().isoformat(), "asset": 0.0, "benchmark": 0.0})
    points += [{"date": d.date().isoformat(), "asset": _num(r["asset"]), "benchmark": _num(r["bench"])}
               for d, r in growth.iterrows()]
    return points


def _key_event(e: dict[str, Any]) -> dict[str, Any]:
    r = e["reaction"]
    return {**_event(e), "on_move": e["on_move"],
            "reaction": {"start": r["start"].isoformat(), "end": r["end"].isoformat(), "asset": _num(r["asset"]),
                         "benchmark": _num(r["benchmark"]), "abnormal": _num(r["abnormal"])}}


def _move(m: dict[str, Any]) -> dict[str, Any]:
    link = m.get("link") or {"verdict": "non jugé", "reason": "", "excerpt": "", "by": "règle"}
    chosen = m.get("link_event")
    return {
        "date": m["date"].isoformat(), "asset": _num(m["asset"]), "benchmark": _num(m["bench"]),
        "abnormal": _num(m["ar"]), "z": _num(m["z"]), "explanation": m.get("explanation", "hypothese"),
        "verdict": link["verdict"], "reason": link["reason"], "excerpt": link["excerpt"], "judged_by": link["by"],
        "event": _event(chosen) if chosen else None,
        "events": [_event(e) for e in m.get("events") or []],
    }


def build(result: RunResult, response: AnalysisResponse, period: str) -> dict[str, Any]:
    ctx = result.context
    st = ctx.state
    info = st.get("asset") or {}
    start, end = ctx.inputs.start, ctx.inputs.end
    return {
        "analysis": response.model_dump(mode="json"),
        "ticker": ctx.inputs.ticker, "name": info.get("name"), "currency": info.get("currency"),
        "period": period, "window": {"start": start.isoformat(), "end": end.isoformat()},
        "benchmark": st.get("bench"), "method": st.get("method"),
        "returns": {"asset": _num(st.get("r_asset")), "benchmark": _num(st.get("r_bench")),
                    "expected": _num(st.get("expected")), "abnormal": _num(st.get("abnormal"))},
        "sigma": _num(st.get("sigma")), "confidence": st.get("confidence"),
        "series": _series(st.get("rets"), st.get("ar_est")),
        "moves": [_move(m) for m in st.get("moves") or []],
        "key_events": [_key_event(e) for e in st.get("key_events") or []],
        "policy_events": [{"date": e["date"].isoformat(), "kind": e["kind"], "label": e["label"], "url": e["url"]}
                          for e in st.get("policy_events") or []],
        "profile_flags": ctx.report.profile_flags,
        "warnings": list(dict.fromkeys(w for stage in result.stages for w in stage["warnings"])),
    }
