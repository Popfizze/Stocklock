"""Persona seed loading. Personas are chosen in the UI; there is no login."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

SEED_PATH = Path(__file__).resolve().parent / "seeds" / "personas.json"

PUBLIC_FIELDS = ("id", "name", "age", "risk_tolerance", "horizon", "preferences", "summary")
# The profile's limits the UI shows (from `constraints`): ratios, and sectors by their GICS name.
LIMIT_FIELDS = ("max_volatility", "max_single_position", "allow_crypto", "excluded_sectors")


@lru_cache(maxsize=1)
def _load() -> tuple[dict[str, Any], ...]:
    data = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    return tuple(data)


def persona_ids() -> set[str]:
    return {p["id"] for p in _load()}


def list_public() -> list[dict[str, Any]]:
    return [{**{k: p[k] for k in PUBLIC_FIELDS}, "limits": {k: p["constraints"][k] for k in LIMIT_FIELDS}}
            for p in _load()]


def get_persona(persona_id: str) -> dict[str, Any]:
    for p in _load():
        if p["id"] == persona_id:
            return p
    raise KeyError(persona_id)
