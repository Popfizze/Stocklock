"""Calls the narration agents in-process (AGENT_MODE=local) or on AgentCore (AGENT_MODE=agentcore).

AgentCore starts a micro-VM for every new runtime session (about 3.5 s before the first token); calls
on a session already started cost the model's time only. The agents keep no state between calls (each
builds a fresh Strands agent), so one warm session is reused by every call of this process (concurrent
calls on one session run side by side) and renewed before AgentCore closes it for inactivity. The boto3
client is built once per process too (thread-safe), by the warm-up: built by each of several parallel
first calls at once, it cost about 2 s on a fresh Lambda instance.
"""

from __future__ import annotations

import json
import logging
import threading
import time
import uuid
from typing import Any

from app.config import get_settings

log = logging.getLogger(__name__)

SESSION_IDLE_S = 12 * 60     # AgentCore closes an idle session after 15 min: renew it a little before
SESSION_MAX_AGE_S = 6 * 3600  # and well before its 8 h maximum lifetime

_session_lock = threading.Lock()
_session = {"id": "", "created": 0.0, "used": 0.0}
_clients: dict[tuple[str, float], Any] = {}


def model_id_for(choice: str) -> str:
    s = get_settings()
    if choice == "sonnet":
        return s.bedrock_model_id
    if choice == "haiku":
        return s.bedrock_fast_model_id
    raise ValueError(f"no model for narration choice {choice!r}")


def session_id(now: float | None = None) -> tuple[str, bool]:
    """(the process's AgentCore session id, whether it is new); a new one after inactivity or old age."""
    now = time.monotonic() if now is None else now
    with _session_lock:
        fresh = (not _session["id"] or now - _session["used"] > SESSION_IDLE_S
                 or now - _session["created"] > SESSION_MAX_AGE_S)
        if fresh:
            _session.update(id=uuid.uuid4().hex + uuid.uuid4().hex[:8], created=now)  # >= 33 chars required
        _session["used"] = now
        return _session["id"], fresh


def reset_session() -> None:
    with _session_lock:
        _session.update(id="", created=0.0, used=0.0)
        _clients.clear()


def _client(region: str, read_timeout_s: float) -> Any:
    """The process's bedrock-agentcore client (built once, under the lock)."""
    with _session_lock:
        key = (region, read_timeout_s)
        if key not in _clients:
            import boto3
            from botocore.config import Config

            _clients[key] = boto3.client("bedrock-agentcore", region_name=region,
                                         config=Config(read_timeout=read_timeout_s, connect_timeout=5,
                                                       max_pool_connections=16))
        return _clients[key]


def _invoke_agentcore(payload: dict[str, Any]) -> dict[str, Any]:
    s = get_settings()
    if not s.agentcore_runtime_arn:
        raise RuntimeError("AGENT_MODE=agentcore mais AGENTCORE_RUNTIME_ARN est vide")
    client = _client(s.aws_region, s.agent_timeout_s)
    response = client.invoke_agent_runtime(
        agentRuntimeArn=s.agentcore_runtime_arn,
        runtimeSessionId=session_id()[0],
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


def warm_up() -> bool:
    """Starts the AgentCore session in the background when it is cold, so that the first model call of a
    request does not wait for it; True when a warm-up was started. No model is called."""
    if get_settings().agent_mode != "agentcore" or not session_id()[1]:
        return False

    def ping() -> None:
        try:
            _call({"task": "ping", "persona": {}, "facts": {}, "model_id": "", "region": get_settings().aws_region})
        except Exception as exc:  # an older runtime refuses the task, but its session is started all the same
            log.info("agentcore warm-up: %s", type(exc).__name__)

    threading.Thread(target=ping, name="agentcore-warm-up", daemon=True).start()
    return True


def narrate(task: str, persona: dict[str, Any], facts: dict[str, Any], model_choice: str,
            feedback: str | None = None) -> str:
    payload = {"task": task, "persona": persona, "facts": facts,
               "model_id": model_id_for(model_choice), "feedback": feedback,
               "region": get_settings().aws_region}
    return str(_call(payload)["answer"])


def digest_events(facts: dict[str, Any], model_choice: str = "haiku") -> list[dict[str, Any]]:
    """Step 2: one summary, date, category and relevance per event (validated by the pipeline)."""
    payload = {"task": "move_digest", "persona": {}, "facts": facts,
               "model_id": model_id_for(model_choice), "region": get_settings().aws_region}
    return list(_call(payload)["digest"]["events"])


def judge_links(facts: dict[str, Any], model_choice: str = "haiku") -> list[dict[str, Any]]:
    """Step 2: for each move, the event that plausibly explains it, or none (validated by the pipeline)."""
    payload = {"task": "move_links", "persona": {}, "facts": facts,
               "model_id": model_id_for(model_choice), "region": get_settings().aws_region}
    return list(_call(payload)["links"]["links"])


def classify(message: str, persona: dict[str, Any], model_choice: str = "haiku") -> dict[str, Any]:
    payload = {"task": "bias_classify", "persona": persona, "facts": {"message": message},
               "model_id": model_id_for(model_choice), "region": get_settings().aws_region}
    return _call(payload)["classification"]
