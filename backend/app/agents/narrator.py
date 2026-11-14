"""Narration and classification entry points shared by local mode and the AgentCore runtime."""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field

from .factory import build_agent
from .prompts import CLASSIFIER_PROMPT, MOVE_DIGEST_PROMPT, MOVE_LINKS_PROMPT, TASK_PROMPTS, system_prompt


class EventDigest(BaseModel):
    id: str
    summary: str = Field(description="Une ou deux phrases en français, tirées de l'extrait")
    event_date: str | None = Field(default=None, description="AAAA-MM-JJ du fait décrit, ou null")
    category: str = Field(description="entreprise, économique, politique, marché ou autre")
    relevant: bool = True


class MoveDigest(BaseModel):
    events: list[EventDigest]


class MoveLink(BaseModel):
    move_id: str
    event_id: str | None = None
    verdict: str = Field(description="plausible, peu_plausible ou indetermine")
    reason: str
    excerpt: str = ""


class MoveLinks(BaseModel):
    links: list[MoveLink]


STRUCTURED_TASKS: dict[str, tuple[str, type[BaseModel], str]] = {
    # task: (system prompt, output model, response key)
    "move_digest": (MOVE_DIGEST_PROMPT, MoveDigest, "digest"),
    "move_links": (MOVE_LINKS_PROMPT, MoveLinks, "links"),
}


class BiasSignal(BaseModel):
    category: str = Field(description="fomo, panique, autorite_sociale, surconfiance, ancrage, "
                                      "concentration, urgence ou euphorie")
    excerpt: str = Field(description="Sous-chaîne exacte du message")
    intensity: float = Field(ge=0, le=1)


class MessageClassification(BaseModel):
    dominant_emotion: str
    signals: list[BiasSignal]


def _persona_view(persona: dict[str, Any]) -> dict[str, Any]:
    keys = ("name", "age", "risk_tolerance", "horizon", "preferences", "summary")
    return {k: persona[k] for k in keys if k in persona}


def narrate(task: str, persona: dict[str, Any], facts: dict[str, Any], model_id: str, region: str,
            feedback: str | None = None) -> str:
    if task not in TASK_PROMPTS:
        raise ValueError(f"unknown narration task {task!r}")
    agent = build_agent(model_id, region, system_prompt(task))
    payload = {"persona": _persona_view(persona), "faits": facts}
    prompt = "Voici les faits calculés (JSON). Rédige l'explication.\n\n" + json.dumps(
        payload, ensure_ascii=False, default=str)
    if feedback:
        prompt += "\n\nCorrection demandée par la gouvernance : " + feedback
    result = agent(prompt)
    return str(result).strip()


def classify(message: str, persona: dict[str, Any], model_id: str, region: str) -> dict[str, Any]:
    agent = build_agent(model_id, region, CLASSIFIER_PROMPT, max_tokens=1200)
    prompt = (f"Profil : {json.dumps(_persona_view(persona), ensure_ascii=False)}\n"
              f"Message à analyser :\n<<<{message}>>>")
    result = agent(prompt, structured_output_model=MessageClassification)
    parsed = result.structured_output
    if parsed is None:
        raise RuntimeError("classifier returned no structured output")
    return parsed.model_dump()


def structured(task: str, facts: dict[str, Any], model_id: str, region: str) -> dict[str, Any]:
    """Step 2 readings (event digests, move-event links) as validated JSON."""
    prompt_text, model, _ = STRUCTURED_TASKS[task]
    agent = build_agent(model_id, region, prompt_text, max_tokens=3000)
    prompt = "Données (JSON) :\n" + json.dumps(facts, ensure_ascii=False, default=str)
    result = agent(prompt, structured_output_model=model)
    parsed = result.structured_output
    if parsed is None:
        raise RuntimeError(f"{task} returned no structured output")
    return parsed.model_dump()


def handle(payload: dict[str, Any], default_region: str) -> dict[str, Any]:
    """Single dispatcher used by the AgentCore entrypoint: {task, persona, facts, model_id}."""
    task = payload.get("task")
    region = payload.get("region") or default_region
    model_id = payload["model_id"]
    persona = payload.get("persona") or {}
    if task == "bias_classify":
        return {"classification": classify(payload["facts"]["message"], persona, model_id, region)}
    if task in STRUCTURED_TASKS:
        return {STRUCTURED_TASKS[task][2]: structured(task, payload.get("facts") or {}, model_id, region)}
    answer = narrate(task, persona, payload.get("facts") or {}, model_id, region, payload.get("feedback"))
    return {"answer": answer}
