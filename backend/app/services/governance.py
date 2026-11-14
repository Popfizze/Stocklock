"""Governance checks applied to every answer before it leaves the backend.

- sources: at least one source, and every factor's source_id points to a declared source;
- disclaimer: the "simulation, not advice" sentence is present (appended if missing);
- profile_consistency: when the asset/request clashes with the persona, the answer says so
  (a deterministic warning is appended otherwise);
- numbers_grounded: every number in the answer matches a computed fact (simple heuristic:
  rounding tolerance, ratios may be written as percentages, years and dates ignored).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.schemas import Governance, GovernanceCheck
from app.services.report import Report

DISCLAIMER = "Simulation éducative, pas un conseil financier personnalisé."

_DATE_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_DAY_MONTH_RE = re.compile(r"\b\d{1,2}(?:er)?\s+(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|"
                           r"septembre|octobre|novembre|décembre|decembre)\b", re.IGNORECASE)
_BRACKET_RE = re.compile(r"\[[^\]]*\]")
_NUM_RE = re.compile(r"(?<![\w.,])[-+−]?(?:\d{1,3}(?:[   ]\d{3})+|\d+)(?:[.,]\d+)?(?![\w])")


@dataclass
class NumberToken:
    text: str
    value: float
    decimals: int


def extract_numbers(text: str) -> list[NumberToken]:
    cleaned = _BRACKET_RE.sub(" ", _DAY_MONTH_RE.sub(" ", _DATE_RE.sub(" ", text)))
    out = []
    for m in _NUM_RE.finditer(cleaned):
        raw = m.group(0)
        norm = raw.replace("−", "-").replace(" ", "").replace(" ", "").replace(" ", "")
        decimals = 0
        if "," in norm or "." in norm:
            sep = "," if "," in norm else "."
            decimals = len(norm.split(sep)[1])
            norm = norm.replace(",", ".")
        try:
            out.append(NumberToken(raw, float(norm), decimals))
        except ValueError:
            continue
    return out


def _numbers_in(value: Any) -> list[float]:
    if isinstance(value, bool) or value is None:
        return []
    if isinstance(value, (int, float)):
        return [float(value)]
    if isinstance(value, str):
        return [t.value for t in extract_numbers(value)]
    if isinstance(value, dict):
        return [n for v in value.values() for n in _numbers_in(v)]
    if isinstance(value, (list, tuple)):
        return [n for v in value for n in _numbers_in(v)]
    return []


def allowed_numbers(report: Report, persona: dict[str, Any], inputs: dict[str, Any]) -> list[float]:
    pool: list[float] = [100.0]  # "/100" scale and "100 %" are always allowed
    for f in report.factors:
        nums = _numbers_in(f.value)
        pool += nums
        if f.unit == "ratio":
            pool += [n * 100 for n in nums]
        pool += _numbers_in(f.name) + _numbers_in(f.effect)
    pool += _numbers_in(report.assumptions) + _numbers_in(report.limits)
    pool += _numbers_in(report.profile_flags) + _numbers_in(report.context)
    pool += _numbers_in(inputs)
    pool += [n * 100 for n in _numbers_in(inputs) if abs(n) < 1]
    pool += _numbers_in({k: persona.get(k) for k in ("age", "horizon", "summary")})
    return pool


def _matches(token: NumberToken, pool: list[float]) -> bool:
    a = abs(token.value)
    tol_abs = 0.51 * 10 ** (-token.decimals)
    for b in pool:
        b = abs(b)
        if abs(a - b) <= max(tol_abs, 0.01 * b):
            return True
    return False


def unsupported_numbers(answer: str, pool: list[float]) -> list[str]:
    bad = []
    for tok in extract_numbers(answer):
        v = abs(tok.value)
        if tok.decimals == 0 and (v <= 5 or 1990 <= v <= 2100):
            continue
        if not _matches(tok, pool):
            bad.append(tok.text.strip())
    return sorted(set(bad))


def check(answer: str, report: Report, persona: dict[str, Any], inputs: dict[str, Any]
          ) -> tuple[str, Governance, list[str]]:
    checks: list[GovernanceCheck] = []

    # 1. sources
    ids = {s.id for s in report.sources}
    dangling = sorted({f.source_id for f in report.factors if f.source_id and f.source_id not in ids})
    ok = bool(ids) and not dangling
    note = f"{len(ids)} source(s) déclarée(s)"
    if dangling:
        note += f" ; références sans source : {', '.join(dangling)}"
    if not ids:
        note = "aucune source déclarée"
    checks.append(GovernanceCheck(name="sources", passed=ok, note=note))

    # 2. disclaimer
    lowered = answer.lower()
    if "pas un conseil" in lowered and "simulation" in lowered:
        checks.append(GovernanceCheck(name="disclaimer", passed=True, note="mention présente dans la réponse"))
    else:
        answer = answer.rstrip() + "\n\n" + DISCLAIMER
        checks.append(GovernanceCheck(name="disclaimer", passed=True, note="mention ajoutée automatiquement"))

    # 3. profile consistency
    flags = report.profile_flags
    if not flags:
        checks.append(GovernanceCheck(name="profile_consistency", passed=True,
                                      note="aucun écart avec le profil détecté par les règles"))
    else:
        mentions = "profil" in lowered or persona["name"].lower() in lowered
        if not mentions:
            answer = answer.rstrip() + "\n\nÉcart avec votre profil : " + " ".join(flags)
        checks.append(GovernanceCheck(
            name="profile_consistency", passed=True,
            note=(f"{len(flags)} écart(s) signalé(s)" + ("" if mentions else " (avertissement ajouté)"))))

    # 4. numbers grounded in facts
    bad = unsupported_numbers(answer, allowed_numbers(report, persona, inputs))
    checks.append(GovernanceCheck(
        name="numbers_grounded", passed=not bad,
        note="tous les chiffres proviennent des faits calculés" if not bad
        else f"chiffres absents des faits : {', '.join(bad[:8])}"))

    return answer, Governance(passed=all(c.passed for c in checks), checks=checks), bad
