"""AgentCore Runtime entrypoint (BedrockAgentCoreApp).

Receives {task, persona, facts, model_id[, feedback, region]} and returns {answer} (or
{classification} for task "bias_classify"). The backend calls it with boto3
`bedrock-agentcore.invoke_agent_runtime` when AGENT_MODE=agentcore.

In the runtime this folder is the zip root, so it is loaded as a package named
`stocklock_agents` to keep the relative imports used by the backend working.
"""

from __future__ import annotations

import importlib.util
import os
import sys

from bedrock_agentcore.runtime import BedrockAgentCoreApp

if __package__:
    from .narrator import handle
else:  # running as the zip root inside AgentCore
    _here = os.path.dirname(os.path.abspath(__file__))
    _spec = importlib.util.spec_from_file_location(
        "stocklock_agents", os.path.join(_here, "__init__.py"), submodule_search_locations=[_here])
    _pkg = importlib.util.module_from_spec(_spec)
    sys.modules["stocklock_agents"] = _pkg
    _spec.loader.exec_module(_pkg)
    from stocklock_agents.narrator import handle  # type: ignore[no-redef]

app = BedrockAgentCoreApp()


@app.entrypoint
def invoke(payload, context=None):
    return handle(payload, os.environ.get("AWS_REGION", "us-east-1"))


if __name__ == "__main__":
    app.run()
