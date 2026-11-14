"""Group runs of the Labo: one step on every title of a group, inside the API's time limit.

Synchronous on purpose. The API runs on a Lambda behind a BUFFERED function URL (300 s, 6 MB): once
the response is sent the process is frozen, so no work can continue in the background, and the
function can neither write to the data bucket nor invoke itself (an asynchronous run would need a
queue, a store and new permissions). So a group run is checked before it starts — a duration estimate
that counts the serialized GDELT calls (one every 5.5 s at most) and the Bedrock calls — and refused
with the size that would fit when it cannot finish; while it runs, a deadline guarantees an answer
before the Lambda's limit, and a title that did not finish is reported `timeout`, never dropped.

Titles run in parallel on a bounded pool; EDGAR requests share the process-wide SEC limiter
(`app.data.http`), GDELT its throttle and cooldown (a refusal falls back as in a single run). Each
title returns a summary — status, key result, governance, main decisions, error — and a `run_request`
to fetch its full run (stages, datasets, decisions) on demand with POST /api/lab/run: full datasets
of 25 titles would not fit in one response.
"""

from __future__ import annotations

import math
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, wait
from typing import Any

from app.data import gdelt
from app.pipeline.core import PipelineInputError, RunResult, StepSpec, _cell, resolve_options
from app.pipeline.registry import STEPS, execute, parse_inputs
from app.services.lab_groups import MAX_TITLES, ResolvedGroup

WORKERS = 6
BUDGET_S = 240.0  # Lambda timeout 300 s: margin for the cold start, the group resolution and the response
OVERHEAD_S = 5.0
PER_TITLE_S = {"score": 6.0, "explain_move": 15.0, "bias": 5.0}  # one title, warm caches excluded
BEDROCK_CALL_S = 6.0
GDELT_CALL_S = gdelt.MIN_INTERVAL_S + 2.0  # throttle interval + a typical answer

# Main decisions of a title: (stage id, question prefix), in the step's order.
MAIN_DECISIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "score": (("identification", "Où identifier le titre"), ("fundamentals", "Quelle source de relevés"),
              ("prices", "Quelle source de prix"), ("prices", "Titre compatible avec le profil"),
              ("events", "Quelle source d'événements"), ("scoring", "Que faire des sous-scores manquants"),
              ("scoring", "Score global")),
    "explain_move": (("prices", "Où identifier le titre"), ("prices", "Quelle source de prix"),
                     ("benchmark", "Quel indice de référence"), ("benchmark", "Comment calculer le rendement attendu"),
                     ("benchmark", "Le titre a-t-il fait mieux"), ("moves", "Quelles séances sont des mouvements"),
                     ("world_events", "Quelle source d'événements du monde"),
                     ("attribution", "Niveau de confiance"), ("plausibility", "Niveau de confiance")),
    "bias": (("message_analysis", "De quel titre parle le message"), ("message_analysis", "Quels biais retenir"),
             ("hype_signal", "Battage détecté"), ("profile_check", ""), ("simulation_2022", "Conserver ou vendre")),
}
FAILURE_QUESTION = "Que faire après l'échec de l'étape ?"


class BatchError(ValueError):
    """The group run cannot start (HTTP 422), with a French explanation."""


# --- estimate ----------------------------------------------------------------------------------------

def gdelt_calls(step_id: str, options: dict[str, Any], n: int) -> int:
    """GDELT requests a run of `n` titles may make (worst case: nothing cached)."""
    if step_id == "score":
        return n if options.get("events.source") in {"gdelt", "gdelt_then_yfinance_news"} else 0
    if step_id == "explain_move":
        per_title = n if options.get("world_events.source") == "gdelt" else 0
        shared = 1 if options.get("political_events.source") in {"both", "gdelt"} else 0  # one query for all
        return per_title + shared
    if step_id == "bias":
        return n if options.get("hype_signal.enabled") == "on" else 0
    return 0


def bedrock_calls(options: dict[str, Any]) -> int:
    """Bedrock calls per title: every `*.model` option not `none`, and Haiku's message classification."""
    calls = sum(1 for key, value in options.items() if key.endswith(".model") and value != "none")
    return calls + (1 if options.get("message_analysis.method") in {"haiku", "both"} else 0)


def estimate_s(step_id: str, options: dict[str, Any], n: int) -> float:
    per_title = PER_TITLE_S.get(step_id, 10.0) + bedrock_calls(options) * BEDROCK_CALL_S
    parallel = math.ceil(n / WORKERS) * per_title
    return max(parallel, gdelt_calls(step_id, options, n) * GDELT_CALL_S) + OVERHEAD_S


def largest_fitting(step_id: str, options: dict[str, Any]) -> int:
    return max((n for n in range(1, MAX_TITLES + 1) if estimate_s(step_id, options, n) <= BUDGET_S), default=0)


# --- table of the group --------------------------------------------------------------------------------

def _metric(result: RunResult, stage_id: str, name: str) -> Any:
    stage = next((s for s in result.stages if s["id"] == stage_id), None)
    value = stage["metrics"].get(name) if stage else None
    return None if value == "n.d." else value


def _score_row(result: RunResult) -> dict[str, Any]:
    state = result.context.state
    pm = state.get("price_metrics")
    available = _metric(result, "scoring", "sous-scores disponibles")
    score = state.get("score")
    return {
        "score": round(score, 1) if score is not None else None,  # as in the key result
        "fundamentals": _metric(result, "fundamentals", "source utilisée") or "aucun",
        "volatility": pm.volatility if pm else None, "drawdown": pm.max_drawdown if pm else None,
        "momentum": pm.momentum if pm else None, "news_tone": state.get("news_tone"),
        "missing": 7 - int(available) if isinstance(available, (int, float)) else None,
        "profile": "à surveiller" if result.context.report.profile_flags else "oui",
    }


def _main_move(moves: list[dict[str, Any]]) -> str | None:
    if not moves:
        return "aucun mouvement marquant"
    m = moves[0]  # sorted by |abnormal return|
    event = m.get("link_event") or next(iter(m.get("events") or []), None)
    head = f"{m['date']} : {m['ar'] * 100:+.1f} %".replace(".", ",")
    return head + " — " + (str(event.get("label", ""))[:140] if event else "aucun événement daté proche")


def _move_row(result: RunResult) -> dict[str, Any]:
    state = result.context.state
    return {
        "asset_return": _metric(result, "benchmark", "rendement du titre"), "benchmark": state.get("bench"),
        "benchmark_return": _metric(result, "benchmark", "rendement de l'indice"),
        "abnormal": state.get("abnormal"), "moves": len(state["moves"]) if "moves" in state else None,
        "confidence": state.get("confidence"), "main_move": _main_move(state["moves"]) if "moves" in state else None,
    }


def _bias_row(result: RunResult) -> dict[str, Any]:
    state = result.context.state
    sim = state.get("simulation")
    hype = state.get("hype")
    return {
        "hype": None if hype is None else ("oui" if hype else "non"),
        "z_score": _metric(result, "hype_signal", "z-score du rendement 20 séances"),
        "volume_ratio": _metric(result, "hype_signal", "volume 20 séances / 120 précédentes"),
        "signals": len(state.get("signals", [])), "profile_flags": len(result.context.report.profile_flags),
        "hold_minus_panic": sim.difference if sim is not None else None,
    }


COMMON_COLUMNS = (("ticker", "Titre", "text"), ("name", "Nom", "text"), ("status", "Statut", "text"))
TABLES: dict[str, tuple[tuple[tuple[str, str, str], ...], Callable[[RunResult], dict[str, Any]], str]] = {
    "score": ((("score", "Score /100", "number"), ("fundamentals", "Relevés", "text"),
               ("volatility", "Volatilité", "percent"), ("drawdown", "Repli maximal", "percent"),
               ("momentum", "Momentum 12-1", "percent"), ("news_tone", "Ton médiatique", "number"),
               ("missing", "Sous-scores manquants", "number"), ("profile", "Adapté au profil", "text")),
              _score_row, "score"),
    "explain_move": ((("asset_return", "Rendement du titre", "percent"), ("benchmark", "Indice", "text"),
                      ("benchmark_return", "Rendement de l'indice", "percent"),
                      ("abnormal", "Rendement anormal", "percent"), ("moves", "Mouvements marquants", "number"),
                      ("confidence", "Confiance", "text"), ("main_move", "Mouvement principal", "text")),
                     _move_row, "abnormal"),
    "bias": ((("hype", "Battage", "text"), ("z_score", "Z-score 20 séances", "number"),
              ("volume_ratio", "Volume / habituel", "number"), ("signals", "Biais du message", "number"),
              ("profile_flags", "Écarts au profil", "number"),
              ("hold_minus_panic", "Conserver − vendre 2022 (CAD)", "number")),
             _bias_row, "z_score"),
}


def table_spec(step_id: str) -> tuple[list[dict[str, str]], Callable[[RunResult], dict[str, Any]], str]:
    specific, row_fn, sort_key = TABLES[step_id]
    columns = [*COMMON_COLUMNS, *specific, ("governance", "Gouvernance", "text")]
    return [{"key": k, "label": label, "kind": kind} for k, label, kind in columns], row_fn, sort_key


# --- one title ---------------------------------------------------------------------------------------

def main_decisions(step_id: str, stages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    wanted = MAIN_DECISIONS.get(step_id, ())
    out = []
    for stage in stages:
        for d in stage.get("decisions", []):
            keep = d["question"] == FAILURE_QUESTION or any(
                stage["id"] == sid and d["question"].startswith(prefix) for sid, prefix in wanted)
            if keep:
                out.append({**d, "stage": stage["id"], "stage_name": stage["name"]})
    return out


def _summary_item(step: StepSpec, ticker: str, name: str | None, run_request: dict[str, Any],
                  status: str, error: str | None, duration_ms: float | None = None) -> dict[str, Any]:
    return {"ticker": ticker, "name": name, "status": status, "duration_ms": duration_ms, "key_result": None,
            "governance_passed": None, "decisions": [], "warnings": 0, "error": error, "run_id": None,
            "run_request": run_request}


def _run_title(step: StepSpec, persona: dict[str, Any], ticker: str, name: str | None, inputs: dict[str, Any],
               options: dict[str, Any], run_request: dict[str, Any], row_fn: Callable[[RunResult], dict[str, Any]],
               deadline: float) -> tuple[dict[str, Any], dict[str, Any]]:
    if time.monotonic() > deadline:
        item = _summary_item(step, ticker, name, run_request, "timeout",
                             f"Non commencé dans le temps imparti ({BUDGET_S:.0f} s) : relancez ce titre seul.")
        return item, {}
    t0 = time.perf_counter()
    try:
        result, response = execute(step.id, persona, inputs, options)
    except PipelineInputError as exc:
        return _summary_item(step, ticker, name, run_request, "error", f"Titre non analysable : {exc}.",
                             round((time.perf_counter() - t0) * 1000, 1)), {}
    except Exception as exc:  # one title must never break the group
        return _summary_item(step, ticker, name, run_request, "error", f"{type(exc).__name__} : {exc}",
                             round((time.perf_counter() - t0) * 1000, 1)), {}
    duration = round((time.perf_counter() - t0) * 1000, 1)
    stages = result.stages
    failed = next((s for s in stages if s["status"] == "error"), None)
    status = "error" if failed else ("warning" if any(s["status"] == "warning" for s in stages) else "ok")
    asset_name = (result.context.state.get("asset") or {}).get("name")
    item = {
        "ticker": ticker, "name": asset_name or name, "status": status, "duration_ms": duration,
        "key_result": {k: _cell(v) if k == "value" else v for k, v in result.key_result.items()},
        "governance_passed": response.governance.passed, "decisions": main_decisions(step.id, stages),
        "warnings": sum(len(s["warnings"]) for s in stages),
        "error": f"Étape « {failed['name']} » en erreur : {'; '.join(failed['warnings'])}" if failed else None,
        "run_id": result.run_id, "run_request": run_request,
    }
    row = {**row_fn(result), "governance": "réussie" if response.governance.passed else "échouée"}
    return item, row


# --- the group ---------------------------------------------------------------------------------------

def check_step(step_id: str) -> StepSpec:
    step = STEPS[step_id]
    if step.group_input is None:
        raise BatchError(f"L'étape « {step.label} » ne porte pas sur un titre : elle ne s'exécute pas sur un "
                         "groupe (group_runnable = false dans le catalogue).")
    return step


def run_batch(step_id: str, persona: dict[str, Any], persona_id: str, group: ResolvedGroup,
              inputs: dict[str, Any], options: dict[str, Any] | None) -> dict[str, Any]:
    """Runs `step_id` on each title of `group`. Raises BatchError, OptionError or ValidationError (422)."""
    step = check_step(step_id)
    started = time.monotonic()
    resolved = resolve_options(step, options)
    base = {k: v for k, v in (inputs or {}).items() if k != step.group_input}
    parse_inputs(step, {**base, step.group_input: group.tickers[0]})  # every input but the title, checked once
    n = len(group.tickers)
    estimated = estimate_s(step_id, resolved, n)
    calls = gdelt_calls(step_id, resolved, n)
    if estimated > BUDGET_S:
        fit = largest_fitting(step_id, resolved)
        hint = " ou désactivez les options qui appellent GDELT (une requête toutes les 5,5 s)" if calls else ""
        raise BatchError(f"Groupe trop grand pour une exécution : environ {estimated:.0f} s estimées pour {n} titres, "
                         f"limite {BUDGET_S:.0f} s. Lancez {fit} titres au plus avec ces options{hint}.")

    columns, row_fn, sort_key = table_spec(step_id)
    deadline = started + BUDGET_S
    pool = ThreadPoolExecutor(max_workers=min(WORKERS, n), thread_name_prefix="lab-batch")
    futures = {}
    for ticker in group.tickers:
        title_inputs = {**base, step.group_input: ticker}
        run_request = {"step": step_id, "persona_id": persona_id, "inputs": title_inputs, "options": resolved}
        futures[ticker] = pool.submit(_run_title, step, persona, ticker, group.names.get(ticker), title_inputs,
                                      resolved, run_request, row_fn, deadline)
    done, _ = wait(futures.values(), timeout=max(0.0, deadline - time.monotonic()))
    pool.shutdown(wait=False, cancel_futures=True)  # a title still running is reported, not awaited

    items, rows = [], []
    for ticker, future in futures.items():
        if future in done:
            item, row = future.result()
        else:
            run_request = {"step": step_id, "persona_id": persona_id,
                           "inputs": {**base, step.group_input: ticker}, "options": resolved}
            item, row = _summary_item(step, ticker, group.names.get(ticker), run_request, "timeout",
                                      f"Non terminé dans le temps imparti ({BUDGET_S:.0f} s) : relancez ce titre "
                                      "seul."), {}
        items.append(item)
        values = {"ticker": item["ticker"], "name": item["name"], "status": item["status"], **row}
        rows.append({c["key"]: _cell(values.get(c["key"])) for c in columns})

    counts = {s: sum(1 for i in items if i["status"] == s) for s in ("ok", "warning", "error", "timeout")}
    return {
        "batch_id": uuid.uuid4().hex, "step": step_id, "persona_id": persona_id,
        "duration_ms": round((time.monotonic() - started) * 1000, 1), "options_used": resolved,
        "group": group.to_dict(),
        "budget": {"limit_s": BUDGET_S, "estimated_s": round(estimated, 1), "workers": min(WORKERS, n),
                   "gdelt_calls": calls},
        "summary": {"requested": n, **counts},
        "items": items,
        "table": {"columns": columns, "rows": rows, "default_sort": {"key": sort_key, "direction": "desc"}},
    }
