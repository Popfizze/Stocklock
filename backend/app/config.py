"""Runtime configuration read from environment variables (and an optional backend/.env file)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader: KEY=VALUE lines, '#' comments; never overrides real env vars."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def _env(name: str, default: str) -> str:
    value = os.environ.get(name, "").strip()
    return value or default


@dataclass(frozen=True)
class Settings:
    bedrock_model_id: str
    bedrock_fast_model_id: str
    aws_region: str
    agent_mode: str
    agentcore_runtime_arn: str
    sec_user_agent: str
    cors_origins: list[str] = field(default_factory=list)
    data_dir: Path = REPO_DIR / "alphaforge_starter"
    cache_dir: Path = BACKEND_DIR / ".cache"
    http_timeout_s: float = 8.0
    gdelt_timeout_s: float = 15.0
    agent_timeout_s: float = 90.0


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    _load_dotenv(BACKEND_DIR / ".env")
    data_dir = Path(_env("DATA_DIR", str(REPO_DIR / "alphaforge_starter")))
    cache_dir = Path(_env("CACHE_DIR", str(BACKEND_DIR / ".cache")))
    if not data_dir.is_absolute():
        data_dir = (BACKEND_DIR / data_dir).resolve()
    if not cache_dir.is_absolute():
        cache_dir = (BACKEND_DIR / cache_dir).resolve()
    mode = _env("AGENT_MODE", "local").lower()
    if mode not in {"local", "agentcore"}:
        raise ValueError(f"AGENT_MODE must be 'local' or 'agentcore', got {mode!r}")
    return Settings(
        bedrock_model_id=_env("BEDROCK_MODEL_ID", "global.anthropic.claude-sonnet-5"),
        bedrock_fast_model_id=_env(
            "BEDROCK_FAST_MODEL_ID", "global.anthropic.claude-haiku-4-5-20251001-v1:0"
        ),
        aws_region=_env("AWS_REGION", "us-east-1"),
        agent_mode=mode,
        agentcore_runtime_arn=_env("AGENTCORE_RUNTIME_ARN", ""),
        sec_user_agent=_env("SEC_USER_AGENT", "StockLock datathon research contact@example.com"),
        cors_origins=[
            o.strip() for o in _env("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
        ],
        data_dir=data_dir,
        cache_dir=cache_dir,
        http_timeout_s=float(_env("HTTP_TIMEOUT_S", "8")),
        gdelt_timeout_s=float(_env("GDELT_TIMEOUT_S", "15")),
        agent_timeout_s=float(_env("AGENT_TIMEOUT_S", "90")),
    )
