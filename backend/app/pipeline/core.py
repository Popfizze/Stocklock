"""Pipeline engine: named stages run in order, each declaring its options and producing a record.

Independent of FastAPI. A step (score, explain_move, tax, bias) is a `StepSpec`; the runner
resolves partial options against the declared defaults, runs every stage, records what each one
did, and lets degradable stages fail softly (warning / skipped) so the next ones can adapt.
"""

from __future__ import annotations

import json
import math
import time
import traceback
import uuid
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel

from app.services.report import Report

PREVIEW_MAX_ROWS = 20
# Lab responses go through a Lambda function URL (6 MB buffered limit, body escaped inside a JSON
# envelope): complete datasets are cut, rows last, so that the whole response stays under this size.
RESPONSE_MAX_BYTES = 5_000_000


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
    # Where the stage sits in the Labo's diagram: "bronze" (raw data fetched), "silver" (cleaned,
    # derived), "gold" (the computed result) or "sortie" (narration, governance).
    layer: str = "silver"


@dataclass(frozen=True)
class StepSpec:
    id: str
    label: str
    inputs: tuple[InputSpec, ...]
    stages: tuple[StageSpec, ...]
    request_model: type[BaseModel]
    key_result: Callable[["Context"], dict[str, Any]]
    input_defaults: Callable[[], dict[str, Any]] | None = None
    # The input set once per title when the step runs on a group (POST /api/lab/run-batch);
    # None for a step that does not run per title (tax).
    group_input: str | None = None

    def option_specs(self) -> dict[str, OptionSpec]:
        return {f"{s.id}.{o.key}": o for s in self.stages for o in s.options}

    def defaults(self) -> dict[str, Any]:
        return {k: o.default for k, o in self.option_specs().items()}


# --- errors -------------------------------------------------------------------------------------

class OptionError(ValueError):
    """Unknown option key or value outside the declared choices (HTTP 422)."""


class PipelineInputError(ValueError):
    """The inputs cannot be analysed (unknown ticker, no data at all...) (HTTP 422)."""


class NoQuotesInWindow(PipelineInputError):
    """The title has no quotation in the period asked (e.g. listed after it): the source answered, there
    is nothing to analyse. A group run reports such a title as skipped with this reason, not as an error."""

    def __init__(self, ticker: str, start: Any, end: Any, first: Any = None) -> None:
        listed = f" : le titre est coté depuis le {first}" if first is not None else ""
        super().__init__(f"aucune cotation de {ticker} sur la période {start} → {end}{listed}")
        self.ticker, self.first = ticker, first


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
    decisions: list[dict[str, Any]] = field(default_factory=list)
    datasets: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "name": self.name, "status": self.status,
            "duration_ms": round(self.duration_ms, 1), "options_used": self.options_used,
            "metrics": self.metrics, "preview": self.preview, "warnings": self.warnings,
            "sources": self.sources, "decisions": self.decisions, "datasets": self.datasets,
        }

    def decide(self, question: str, answer: Any, reason: str, rule: str | None = None,
               inputs: Mapping[str, Any] | None = None) -> None:
        entry: dict[str, Any] = {"question": question, "answer": _cell(answer), "reason": reason}
        if rule:
            entry["rule"] = rule
        if inputs:
            entry["inputs"] = {str(k): _cell(v) for k, v in inputs.items()}
        self.decisions.append(entry)


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
        return None if value != value else value.isoformat()[:10]  # NaT != NaT
    if hasattr(value, "item"):  # numpy scalar
        return _cell(value.item())
    if isinstance(value, (list, tuple, dict)):
        return json.dumps(value, ensure_ascii=False, default=str)
    return str(value)


# --- datasets: complete tables fetched or produced by a stage (Lab only) ------------------------

def _escaped_size(obj: Any) -> int:
    """Bytes of `obj` as compact JSON once escaped again inside the Lambda response envelope."""
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), default=str)
    return len(text.encode("utf-8")) + text.count('"') + text.count("\\")


def _cut(rows: list[list[Any]], budget: int) -> list[list[Any]]:
    """Leading rows whose serialized size fits in `budget`."""
    used = 0
    for i, row in enumerate(rows):
        used += _escaped_size(row) + 1
        if used > budget:
            return rows[:i]
    return rows


def fit_datasets(stages: list[dict[str, Any]], budget: int) -> None:
    """Cut dataset rows in place so their total size fits in `budget` bytes.

    Small datasets stay complete; the remaining budget is shared equally among the larger ones,
    which keep every column and their leading rows, with `truncated` set (`total_rows` unchanged).
    """
    datasets = [d for s in stages for d in s.get("datasets") or []]
    sizes = [_escaped_size(d["rows"]) for d in datasets]
    if sum(sizes) <= budget:
        return
    remaining = max(budget, 0)
    order = sorted(range(len(datasets)), key=lambda i: sizes[i])
    for rank, i in enumerate(order):
        share = remaining // (len(order) - rank)
        d = datasets[i]
        if sizes[i] > share:
            d["rows"] = _cut(d["rows"], share)
            d["truncated"] = True
            sizes[i] = _escaped_size(d["rows"])
        remaining -= sizes[i]


@dataclass
class Context:
    step: StepSpec
    persona: dict[str, Any]
    inputs: BaseModel
    options: dict[str, Any]
    report: Report
    state: dict[str, Any] = field(default_factory=dict)
    records: list[StageRecord] = field(default_factory=list)
    collect_datasets: bool = False
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

    def decide(self, question: str, answer: Any, reason: str, rule: str | None = None,
               inputs: Mapping[str, Any] | None = None) -> None:
        """Records a branch the running stage took: the question, the answer chosen and why
        (`rule`: the option or threshold applied; `inputs`: the values that decided)."""
        self.record.decide(question, answer, reason, rule, inputs)

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

    # Complete datasets (every column, every row). Only collected for the Lab: the business routes
    # skip the conversion, so pass generators or raw objects rather than prebuilt lists when large.
    def dataset(self, id: str, title: str, columns: Sequence[str], rows: Iterable[Sequence[Any]],
                source_id: str | None = None) -> None:
        if not self.collect_datasets:
            return
        cells = [[_cell(v) for v in r] for r in rows]
        self.record.datasets.append({
            "id": id, "title": title, "source_id": source_id, "columns": [str(c) for c in columns],
            "rows": cells, "total_rows": len(cells), "truncated": False,
        })

    def dataset_records(self, id: str, title: str, records: Iterable[Mapping[str, Any]],
                        source_id: str | None = None, columns: Sequence[str] = ()) -> None:
        """One row per mapping; columns are `columns` then every other key, in first-seen order."""
        if not self.collect_datasets:
            return
        records = list(records)
        columns = list(dict.fromkeys([*columns, *(k for r in records for k in r)]))
        self.dataset(id, title, columns, ([r.get(c) for c in columns] for r in records), source_id)

    def dataset_frame(self, id: str, title: str, frame: Any, source_id: str | None = None,
                      index: str | None = None) -> None:
        """A pandas DataFrame; its index becomes the first column, named `index`, when given."""
        if not self.collect_datasets:
            return
        df = frame.reset_index() if index else frame
        if index:
            df = df.rename(columns={df.columns[0]: index})
        self.dataset(id, title, list(df.columns), df.itertuples(index=False, name=None), source_id)

    def dataset_mapping(self, id: str, title: str, mapping: Mapping[str, Any], source_id: str | None = None,
                        key: str = "champ", value: str = "valeur") -> None:
        """A flat mapping as two columns."""
        self.dataset(id, title, [key, value], ([k, v] for k, v in mapping.items()), source_id)

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

    def to_dict(self, result: dict[str, Any], max_bytes: int | None = None) -> dict[str, Any]:
        """The Lab response; dataset rows are cut so the whole stays under `max_bytes`
        (default `RESPONSE_MAX_BYTES`)."""
        payload = {
            "run_id": self.run_id, "step": self.step, "duration_ms": round(self.duration_ms, 1),
            "options_used": self.options_used, "key_result": self.key_result,
            "stages": self.stages, "result": result,
        }
        limit = RESPONSE_MAX_BYTES if max_bytes is None else max_bytes
        without_rows = {**payload, "stages": [
            {**s, "datasets": [{**d, "rows": []} for d in s.get("datasets") or []]} for s in self.stages]}
        fit_datasets(self.stages, limit - _escaped_size(without_rows))
        return payload

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
        options: dict[str, Any] | None = None, collect_datasets: bool = False,
        state: dict[str, Any] | None = None) -> RunResult:
    """`state` seeds the context's state (e.g. the stock page's time budget, see explain_move_fetch)."""
    resolved = resolve_options(step, options)
    ctx = Context(step=step, persona=persona, inputs=inputs, options=resolved,
                  report=Report(task=step.id), state=dict(state or {}), collect_datasets=collect_datasets)
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
            rec.decide("Exécuter l'étape ?", "non", "Une étape précédente non dégradable a échoué : le "
                       "pipeline s'arrête.", "étape critique en erreur → étapes suivantes ignorées")
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
            rec.decide("Exécuter l'étape ?", "non, étape ignorée", str(exc) or "Rien à faire avec ces entrées.")
        except Exception as exc:  # stage failure: degrade or abort
            message = f"{type(exc).__name__}: {exc}"
            if spec.degradable:
                rec.status = "warning"
                rec.warnings.append(f"Étape dégradée ({message}) ; la suite s'adapte.")
                ctx.report.limit(f"{spec.name} : étape dégradée ({exc}).")
                rec.decide("Que faire après l'échec de l'étape ?", "dégrader et continuer", message,
                           "étape dégradable : les étapes suivantes s'adaptent à l'absence de ses résultats")
            else:
                rec.status = "error"
                rec.warnings.append(message)
                rec.metrics["traceback"] = traceback.format_exc(limit=2)[-500:]
                aborted = True
                rec.decide("Que faire après l'échec de l'étape ?", "arrêter le pipeline", message,
                           "étape critique (non dégradable) : la suite ne peut pas s'exécuter sans elle")
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
