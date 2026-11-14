"""Registry of the four step pipelines and the serializable Lab catalog."""

from __future__ import annotations

from datetime import date
from typing import Any

from pydantic import BaseModel, ValidationError

from app.pipeline import bias, explain_move, score, tax
from app.pipeline.core import PipelineInputError, RunResult, StepSpec, run
from app.schemas import AnalysisResponse, Governance, GovernanceCheck

STEPS: dict[str, StepSpec] = {s.id: s for s in (score.STEP, explain_move.STEP, tax.STEP, bias.STEP)}


def catalog() -> dict[str, Any]:
    steps = []
    for step in STEPS.values():
        inputs = []
        for i in step.inputs:
            entry: dict[str, Any] = {"name": i.name, "label": i.label, "type": i.type, "default": i.default}
            if i.name == "as_of" and i.default == "":
                entry["default"] = date.today().isoformat()
            if i.help:
                entry["help"] = i.help
            inputs.append(entry)
        stages = []
        for s in step.stages:
            options = []
            for o in s.options:
                opt: dict[str, Any] = {"key": o.key, "label": o.label,
                                       "choices": [{"value": c.value, "label": c.label} for c in o.choices],
                                       "default": o.default}
                if o.description:
                    opt["description"] = o.description
                if o.lab_default is not None:
                    opt["lab_default"] = o.lab_default
                options.append(opt)
            stages.append({"id": s.id, "name": s.name, "description": s.description, "layer": s.layer,
                           "options": options})
        steps.append({"id": step.id, "label": step.label, "inputs": inputs, "stages": stages})
    return {"steps": steps}


def parse_inputs(step: StepSpec, inputs: dict[str, Any] | BaseModel) -> BaseModel:
    if isinstance(inputs, BaseModel):
        return step.request_model.model_validate(inputs.model_dump())
    return step.request_model.model_validate(inputs)


def build_response(result: RunResult) -> AnalysisResponse:
    ctx = result.context
    r = ctx.report
    answer = ctx.state.get("answer")
    if not answer:
        failed = [s for s in result.stages if s["status"] == "error"]
        reason = failed[0]["warnings"][0] if failed and failed[0]["warnings"] else "étape en erreur"
        answer = f"Analyse interrompue : {reason}"
    governance = ctx.state.get("governance") or Governance(
        passed=False, checks=[GovernanceCheck(name="pipeline", passed=False,
                                              note="la gouvernance n'a pas pu s'exécuter")])
    return AnalysisResponse(answer=answer, factors=r.factors, sources=r.sources, assumptions=r.assumptions,
                            limits=r.limits, trace=r.trace, governance=governance)


def execute(step_id: str, persona: dict[str, Any], inputs: dict[str, Any] | BaseModel,
            options: dict[str, Any] | None = None, datasets: bool = False) -> tuple[RunResult, AnalysisResponse]:
    """Runs one step. Raises KeyError (unknown step), ValidationError (inputs), OptionError,
    PipelineInputError (unanalysable inputs). `datasets` collects each stage's complete tables (Lab)."""
    step = STEPS[step_id]
    parsed = parse_inputs(step, inputs)
    result = run(step, persona, parsed, options, collect_datasets=datasets)
    return result, build_response(result)


__all__ = ["STEPS", "catalog", "execute", "PipelineInputError", "ValidationError"]
