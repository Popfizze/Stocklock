"""Real Amazon Bedrock call (skipped by default; run with: pytest -m bedrock)."""

import pytest

from app.personas import get_persona

pytestmark = pytest.mark.bedrock


def test_real_narration_cites_only_given_facts(monkeypatch):
    import importlib

    from app.services import governance, narration
    from app.services.report import Report

    importlib.reload(narration)  # drop the offline patch installed by conftest
    report = Report(task="score")
    report.source("starter_prices", "AlphaForge starter kit")
    report.factor("Score global", 72.5, "/100", source_id="starter_prices")
    report.factor("Volatilité annualisée (1 an)", 0.249, "ratio", source_id="starter_prices")
    answer = narration.narrate("score", get_persona("amira"), report.facts(), "haiku")
    assert "72" in answer
    _, verdict, bad = governance.check(answer, report, get_persona("amira"), {})
    assert next(c for c in verdict.checks if c.name == "sources").passed
    assert len(bad) <= 2, bad
