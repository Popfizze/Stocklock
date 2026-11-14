"""Builds Strands agents backed by Amazon Bedrock.

Self-contained (no import from the backend app) so this folder can be zipped as-is for an
AgentCore Runtime. Sampling parameters are deliberately not sent: Claude Sonnet 5 rejects
`temperature` / `top_p`.
"""

from __future__ import annotations

from botocore.config import Config
from strands import Agent
from strands.models import BedrockModel


def build_agent(model_id: str, region: str, system_prompt: str, max_tokens: int = 2000,
                read_timeout_s: float = 90.0) -> Agent:
    model = BedrockModel(
        model_id=model_id,
        region_name=region,
        max_tokens=max_tokens,
        streaming=False,
        boto_client_config=Config(read_timeout=read_timeout_s, connect_timeout=5,
                                  retries={"max_attempts": 2, "mode": "standard"}),
    )
    return Agent(model=model, system_prompt=system_prompt, callback_handler=None)
