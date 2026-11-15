"""Repeatable evaluation of the deterministic French bias-detection baseline.

The labelled corpus is deliberately small and public: it protects known French phrasing from
regressions and reports false positives/negatives instead of presenting a model as untested.
Claude Haiku remains optional at runtime; it is separately constrained to verbatim excerpts.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from app.services import lexicon

CASES_PATH = Path(__file__).resolve().parents[1] / "evaluation" / "bias_classifier_cases.json"


def load_cases() -> list[dict[str, Any]]:
    """Read the auditable, labelled French phrases used for baseline regression checks."""
    cases = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    if not isinstance(cases, list):
        raise ValueError("bias validation corpus must be a JSON array")
    return cases


def evaluate_lexicon(cases: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    """Return precision/recall and every mismatch for the deterministic lexicon baseline."""
    cases = cases or load_cases()
    by_category: dict[str, dict[str, int]] = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    false_positives: list[dict[str, str]] = []
    false_negatives: list[dict[str, str]] = []

    for case in cases:
        expected = set(case["expected"])
        detected = {signal["category"] for signal in lexicon.detect(case["message"])}
        for category in detected & expected:
            by_category[category]["tp"] += 1
        for category in detected - expected:
            by_category[category]["fp"] += 1
            false_positives.append({"id": case["id"], "category": category, "message": case["message"]})
        for category in expected - detected:
            by_category[category]["fn"] += 1
            false_negatives.append({"id": case["id"], "category": category, "message": case["message"]})

    tp = sum(row["tp"] for row in by_category.values())
    fp = sum(row["fp"] for row in by_category.values())
    fn = sum(row["fn"] for row in by_category.values())
    precision = tp / (tp + fp) if tp + fp else 1.0
    recall = tp / (tp + fn) if tp + fn else 1.0
    return {
        "method": "lexique déterministe",
        "cases": len(cases),
        "precision": precision,
        "recall": recall,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
        "by_category": dict(sorted(by_category.items())),
    }
