"""Pipeline engine: named stages run in order, each declaring its options and producing a record.

Independent of FastAPI. A step (score, explain_move, tax, bias) is a `StepSpec`; the runner
resolves partial options against the declared defaults, runs every stage, records what each one
did, and lets degradable stages fail softly (warning / skipped) so the next ones can adapt.
"""

from __future__ import annotations

import math
import time
import traceback
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from app.services.report import Report

PREVIEW_MAX_ROWS = 20


# --- declarations -------------------------------------------------------------------------------

@dataclass(frozen=True)
class Choice:
    value: Any
    label: str


@dataclass(frozen=True)
class OptionSpec:
    key: str
    label: str
    choices: tuple[Choice, ...]
    default: Any
    description: str | None = None
    lab_default: Any = None

    def values(self) -> list[Any]:
        return [c.value for c in self.choices]


@dataclass(frozen=True)
class InputSpec:
    name: str
    label: str
    type: str  # "text" | "textarea" | "date" | "number" | "tickers" | "boolean"
    default: Any
    help: str | None = None


StageFn = Callable[["Context"], None]


@dataclass(frozen=True)
class StageSpec:
    id: str
    name: str
    description: str
    fn: StageFn
    options: tuple[OptionSpec, ...] = ()
    degradable: bool = True


@dataclass(frozen=True)
class StepSpec:
    id: str
    label: str
    inputs: tuple[InputSpec, ...]
    stages: tuple[StageSpec, ...]
    request_model: type[BaseModel]
    key_result: Callable[["Context"], dict[str, Any]]
    input_defaults: Callable[[], dict[str, Any]] | None = None

    def option_specs(self) -> dict[str, OptionSpec]:
        return {f"{s.id}.{o.key}": o for s in self.stages for o in s.options}

    def defaults(self) -> dict[str, Any]:
        return {k: o.default for k, o in self.option_specs().items()}


# --- errors -------------------------------------------------------------------------------------

class OptionError(ValueError):
    """Unknown option key or value outside the declared choices (HTTP 422)."""


class PipelineInputError(ValueError):
    """The inputs cannot be analysed (unknown ticker, no data at all...) (HTTP 422)."""


class StageSkipped(Exception):
    """Raised by a stage that has nothing to do with the current inputs/options."""


# --- runtime ------------------------------------------------------------------------------------

@dataclass
class StageRecord:
    id: str
    name: str
    status: str = "ok"
    duration_ms: float = 0.0
    options_used: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, float | str] = field(default_factory=dict)
    preview: dict[str, Any] | None = None
    warnings: list[str] = field(default_factory=list)
    sources: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "name": self.name, "status": self.status,
            "duration_ms": round(self.duration_ms, 1), "options_used": self.options_used,
            "metrics": self.metrics, "preview": self.preview, "warnings": self.warnings,
            "sources": self.sources,
        }


def _cell(value: Any) -> str | float | int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "oui" if value else "non"
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return None if math.isnan(value) or math.isinf(value) else round(value, 6)
    if isinstance(value, (date, datetime)):
        return value.isoformat()[:10]
    if hasattr(value, "item"):  # numpy scalar
        return _cell(value.item())
    return str(value)


@dataclass
class Context:
    step: StepSpec
    persona: dict[str, Any]
    inputs: BaseModel
    options: dict[str, Any]
    report: Report
    state: dict[str, Any] = field(default_factory=dict)
    records: list[StageRecord] = field(default_factory=list)
    _current: StageRecord | None = None
    _stage_id: str = ""

    # option access for the running stage (or any stage with an explicit "stage.key")
    def opt(self, key: str) -> Any:
        full = key if "." in key else f"{self._stage_id}.{key}"
        return self.options[full]

    @property
    def record(self) -> StageRecord:
        assert self._current is not None
        return self._current

    def metric(self, name: str, value: Any) -> None:
        cell = _cell(value)
        self.record.metrics[name] = cell if cell is not None else "n.d."

    def warn(self, message: str, *, limit: bool = True) -> None:
        if message not in self.record.warnings:
            self.record.warnings.append(message)
        if limit:
            self.report.limit(message)

    def preview(self, columns: list[str], rows: list[list[Any]]) -> None:
        self.record.preview = {
            "columns": columns,
            "rows": [[_cell(v) for v in r] for r in rows[:PREVIEW_MAX_ROWS]],
        }

    def source(self, id: str, title: str, url: str | None = None, as_of: str | None = None) -> str:
        self.report.source(id, title, url, as_of)
        entry = {"id": id, "title": title}
        if url:
            entry["url"] = url
        if as_of:
            entry["as_of"] = as_of
        if entry not in self.record.sources:
            self.record.sources.append(entry)
        return id


@dataclass
class RunResult:
    run_id: str
    step: str
    duration_ms: float
    options_used: dict[str, Any]
    key_result: dict[str, Any]
    stages: list[dict[str, Any]]
    context: Context

    def to_dict(self, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "run_id": self.run_id, "step": self.step, "duration_ms": round(self.duration_ms, 1),
            "options_used": self.options_used, "key_result": self.key_result,
            "stages": self.stages, "result": result,
        }

    @property
    def failed(self) -> bool:
        return any(s["status"] == "error" for s in self.stages)


def resolve_options(step: StepSpec, partial: dict[str, Any] | None) -> dict[str, Any]:
    specs = step.option_specs()
    resolved = step.defaults()
    for key, value in (partial or {}).items():
        if key not in specs:
            raise OptionError(f"option inconnue {key!r} pour l'étape {step.id} ; options : {sorted(specs)}")
        allowed = specs[key].values()
        if value not in allowed:
            raise OptionError(f"valeur {value!r} invalide pour {key} ; choix : {allowed}")
        resolved[key] = value
    return resolved


def run(step: StepSpec, persona: dict[str, Any], inputs: BaseModel,
        options: dict[str, Any] | None = None) -> RunResult:
    resolved = resolve_options(step, options)
    ctx = Context(step=step, persona=persona, inputs=inputs, options=resolved,
                  report=Report(task=step.id))
    started = time.perf_counter()
    aborted = False
    for spec in step.stages:
        rec = StageRecord(id=spec.id, name=spec.name,
                          options_used={f"{spec.id}.{o.key}": resolved[f"{spec.id}.{o.key}"]
                                        for o in spec.options})
        ctx.records.append(rec)
        if aborted:
            rec.status = "skipped"
            rec.warnings.append("Étape non exécutée : une étape précédente a échoué.")
            continue
        ctx._current, ctx._stage_id = rec, spec.id
        t0 = time.perf_counter()
        try:
            spec.fn(ctx)
            if rec.warnings and rec.status == "ok":
                rec.status = "warning"
        except PipelineInputError:
            raise
        except StageSkipped as exc:
            rec.status = "skipped"
            if str(exc):
                rec.warnings.append(str(exc))
        except Exception as exc:  # stage failure: degrade or abort
            message = f"{type(exc).__name__}: {exc}"
            if spec.degradable:
                rec.status = "warning"
                rec.warnings.append(f"Étape dégradée ({message}) ; la suite s'adapte.")
                ctx.report.limit(f"{spec.name} : étape dégradée ({exc}).")
            else:
                rec.status = "error"
                rec.warnings.append(message)
                rec.metrics["traceback"] = traceback.format_exc(limit=2)[-500:]
                aborted = True
        finally:
            rec.duration_ms = (time.perf_counter() - t0) * 1000
        ctx.report.trace.append(_trace_line(rec))
    ctx._current = None
    total_ms = (time.perf_counter() - started) * 1000
    try:
        key = step.key_result(ctx)
    except Exception:  # key result must never break the response
        key = {"label": "Résultat indisponible", "value": None}
    return RunResult(run_id=uuid.uuid4().hex, step=step.id, duration_ms=total_ms,
                     options_used=resolved, key_result=key,
                     stages=[r.to_dict() for r in ctx.records], context=ctx)


def _trace_line(rec: StageRecord) -> str:
    bits = [f"{rec.name} : {rec.status}", f"{rec.duration_ms:.0f} ms"]
    shown = [f"{k}={v}" for k, v in list(rec.metrics.items())[:3] if k != "traceback"]
    if shown:
        bits.append(", ".join(shown))
    return " · ".join(bits)
