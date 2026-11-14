"""Calls the narration agents in-process (AGENT_MODE=local) or on AgentCore (AGENT_MODE=agentcore)."""

from __future__ import annotations

import json
import uuid
from typing import Any

from app.config import get_settings


def model_id_for(choice: str) -> str:
    s = get_settings()
    if choice == "sonnet":
        return s.bedrock_model_id
    if choice == "haiku":
        return s.bedrock_fast_model_id
    raise ValueError(f"no model for narration choice {choice!r}")


def _invoke_agentcore(payload: dict[str, Any]) -> dict[str, Any]:
    import boto3
    from botocore.config import Config

    s = get_settings()
    if not s.agentcore_runtime_arn:
        raise RuntimeError("AGENT_MODE=agentcore mais AGENTCORE_RUNTIME_ARN est vide")
    client = boto3.client("bedrock-agentcore", region_name=s.aws_region,
                          config=Config(read_timeout=s.agent_timeout_s, connect_timeout=5))
    response = client.invoke_agent_runtime(
        agentRuntimeArn=s.agentcore_runtime_arn,
        runtimeSessionId=uuid.uuid4().hex + uuid.uuid4().hex[:8],  # >= 33 chars required
        contentType="application/json",
        accept="application/json",
        payload=json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"),
    )
    body = response["response"].read()
    return json.loads(body)


def _call(payload: dict[str, Any]) -> dict[str, Any]:
    s = get_settings()
    if s.agent_mode == "agentcore":
        return _invoke_agentcore(payload)
    from app.agents.narrator import handle

    return handle(payload, s.aws_region)


def narrate(task: str, persona: dict[str, Any], facts: dict[str, Any], model_choice: str,
            feedback: str | None = None) -> str:
    payload = {"task": task, "persona": persona, "facts": facts,
               "model_id": model_id_for(model_choice), "feedback": feedback,
               "region": get_settings().aws_region}
    return str(_call(payload)["answer"])


def classify(message: str, persona: dict[str, Any], model_choice: str = "haiku") -> dict[str, Any]:
    payload = {"task": "bias_classify", "persona": persona, "facts": {"message": message},
               "model_id": model_id_for(model_choice), "region": get_settings().aws_region}
    return _call(payload)["classification"]
