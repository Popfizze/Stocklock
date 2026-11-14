"""Accumulates the deterministic facts of one analysis before narration."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from app.schemas import Factor, Source


@dataclass
class Report:
    task: str
    factors: list[Factor] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)
    assumptions: list[str] = field(default_factory=list)
    limits: list[str] = field(default_factory=list)
    trace: list[str] = field(default_factory=list)
    profile_flags: list[str] = field(default_factory=list)
    context: dict[str, Any] = field(default_factory=dict)

    def factor(self, name: str, value: float | str | None, unit: str | None = None,
               effect: str | None = None, source_id: str | None = None, digits: int = 4) -> None:
        if isinstance(value, float):
            value = round(value, digits)
        self.factors.append(Factor(name=name, value=value, unit=unit, effect=effect, source_id=source_id))

    def source(self, id: str, title: str, url: str | None = None, as_of: str | None = None) -> str:
        if not any(s.id == id for s in self.sources):
            self.sources.append(Source(id=id, title=title, url=url, as_of=as_of))
        return id

    def assume(self, text: str) -> None:
        if text not in self.assumptions:
            self.assumptions.append(text)

    def limit(self, text: str) -> None:
        if text not in self.limits:
            self.limits.append(text)

    def step(self, text: str, started: float | None = None) -> None:
        if started is not None:
            text = f"{text} ({(time.perf_counter() - started) * 1000:.0f} ms)"
        self.trace.append(text)

    def facts(self) -> dict[str, Any]:
        """Payload handed to the narrator agent: only computed facts, nothing else."""
        return {
            "task": self.task,
            "factors": [f.model_dump(exclude_none=True) for f in self.factors],
            "sources": [s.model_dump(exclude_none=True) for s in self.sources],
            "assumptions": self.assumptions,
            "limits": self.limits,
            "profile_flags": self.profile_flags,
            "context": self.context,
        }
