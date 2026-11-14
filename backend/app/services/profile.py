"""Deterministic confrontation of an asset with the chosen persona's constraints (personas.json).

`checks` applies every rule and returns one reason per rule, each with a severity; `verdict` turns them
into « compatible », « à surveiller » or « hors profil ». The Lab and the bias / score steps use
`asset_flags`: the messages of the blocking rules on volatility, crypto, sector and excluded tickers.

Rules (thresholds come from the persona's constraints unless written here):
- volatility: one-year annualised volatility above `max_volatility` → bloquant; unknown → attention.
- crypto: a cryptoasset when `allow_crypto` is false → bloquant; allowed → info (keep it a minority).
- sector: sector in `excluded_sectors` → bloquant. excluded_ticker: in `excluded_tickers` → bloquant.
- position: always an info reminder of `max_single_position`.
- ESG, for a persona with the « ESG » preference: highest controversy 5 (severe) → bloquant, 4 (high) →
  attention, below → ok; ESG risk of 30 or more (high, severe) → attention; no ESG data → info.
  For other personas a known controversy level is an info line.
- hype: level « élevé » → attention (with a horizon warning when the horizon is 5 years or less);
  « modéré » → info.
The verdict is « hors profil » with any bloquant reason, « à surveiller » with any attention reason,
« compatible » otherwise.
"""

from __future__ import annotations

from typing import Any, Literal

Severity = Literal["ok", "info", "attention", "bloquant"]
Verdict = Literal["compatible", "a_surveiller", "hors_profil"]

SEVERITY_ORDER = {"bloquant": 0, "attention": 1, "info": 2, "ok": 3}
ESG_CONTROVERSY_BLOCK = 5
ESG_CONTROVERSY_WATCH = 4
ESG_RISK_WATCH = 30
CONTROVERSY_LABELS = {0: "aucune", 1: "faible", 2: "modérée", 3: "significative", 4: "élevée", 5: "grave"}
VERDICT_LABELS = {"compatible": "Compatible", "a_surveiller": "À surveiller", "hors_profil": "Hors profil"}
# Rules whose blocking message is an « asset flag » for the Lab, bias and score steps.
ASSET_FLAG_RULES = ("volatility", "crypto", "sector", "excluded_ticker")


def pct(value: float, digits: int = 1) -> str:
    """0.523 -> « 52,3 % »."""
    return f"{value * 100:.{digits}f} %".replace(".", ",")


def of_name(name: str) -> str:
    """« de Robert », « d’Amira »."""
    return f"d’{name}" if name[:1].upper() in "AEIOUYÉÈH" else f"de {name}"


def is_esg_persona(persona: dict[str, Any]) -> bool:
    return "ESG" in persona.get("preferences", [])


def controversy_label(level: int) -> str:
    return f"Controverse de niveau {level} sur 5 ({CONTROVERSY_LABELS.get(level, 'inconnue')})"


def _reason(rule: str, severity: Severity, message: str, value: float | None = None,
            limit: float | None = None, short: str | None = None) -> dict[str, Any]:
    return {"rule": rule, "severity": severity, "message": message, "value": value, "limit": limit,
            "short": short}


def _core(persona: dict[str, Any], info: dict[str, Any], volatility: float | None) -> list[dict[str, Any]]:
    c, name = persona["constraints"], persona["name"]
    out = []
    if volatility is None:
        out.append(_reason("volatility", "attention", "Volatilité sur 1 an non mesurable (historique trop court "
                           "ou indisponible) : le risque ne peut pas être comparé au profil.", None,
                           c["max_volatility"], "volatilité inconnue"))
    elif volatility > c["max_volatility"]:
        out.append(_reason(
            "volatility", "bloquant",
            f"Volatilité annualisée de {volatility * 100:.1f} % supérieure au seuil de ".replace(".", ",")
            + f"{c['max_volatility'] * 100:.0f} % retenu pour le profil {name} (risque {persona['risk_tolerance']}).",
            volatility, c["max_volatility"], "volatilité trop élevée"))
    else:
        out.append(_reason("volatility", "ok", f"Volatilité sur 1 an de {pct(volatility)}, sous le maximum de "
                           f"{pct(c['max_volatility'], 0)} du profil {of_name(name)}.", volatility, c["max_volatility"]))
    if info.get("asset_class") == "crypto":
        if not c["allow_crypto"]:
            out.append(_reason("crypto", "bloquant", f"Cryptoactif hors du profil de {name} "
                               f"(risque {persona['risk_tolerance']}).", short="cryptoactif exclu"))
        else:
            out.append(_reason("crypto", "info", f"Cryptoactif permis pour {name} : à garder minoritaire pour "
                               "rester diversifié."))
    if info.get("sector") in c["excluded_sectors"]:
        out.append(_reason("sector", "bloquant", f"Secteur « {info['sector']} » exclu par le filtre ESG simplifié "
                           f"de {name}.", short=f"secteur « {info['sector']} » exclu"))
    if info.get("ticker") in c["excluded_tickers"]:
        out.append(_reason("excluded_ticker", "bloquant", f"{info['ticker']} figure dans la liste d'exclusion "
                           f"de {name}.", short="titre exclu"))
    return out


def _esg(persona: dict[str, Any], esg: dict[str, Any] | None) -> list[dict[str, Any]]:
    name = persona["name"]
    level = esg.get("controversy_level") if esg else None
    if not is_esg_persona(persona):
        return [] if level is None else [_reason("esg_controversy", "info", f"{controversy_label(level)}.", level)]
    if esg is None:
        return [_reason("esg_unknown", "info", f"Aucune donnée ESG pour ce titre : la préférence ESG de {name} "
                        "ne peut pas être vérifiée (seul le filtre sectoriel s'applique).")]
    out = []
    if level is not None:
        if level >= ESG_CONTROVERSY_BLOCK:
            out.append(_reason("esg_controversy", "bloquant", f"{controversy_label(level)} : {name} exclut les "
                               "entreprises à controverses graves.", level, ESG_CONTROVERSY_BLOCK, "controverse grave"))
        elif level >= ESG_CONTROVERSY_WATCH:
            out.append(_reason("esg_controversy", "attention", f"{controversy_label(level)} : à vérifier avant "
                               f"d'investir selon les critères de {name}.", level, ESG_CONTROVERSY_WATCH,
                               "controverse élevée"))
        else:
            out.append(_reason("esg_controversy", "ok", f"{controversy_label(level)} : sous le seuil de "
                               f"{ESG_CONTROVERSY_WATCH}.", level, ESG_CONTROVERSY_WATCH))
    low = esg.get("risk_low")
    if low is not None and low >= ESG_RISK_WATCH:
        out.append(_reason("esg_risk", "attention", f"{esg['risk_label']} : au-dessus de {ESG_RISK_WATCH}, à "
                           "vérifier pour un profil ESG.", low, ESG_RISK_WATCH, "risque ESG élevé"))
    elif low is not None:
        out.append(_reason("esg_risk", "ok", f"{esg['risk_label']}.", low, ESG_RISK_WATCH))
    return out


def _hype(persona: dict[str, Any], hype: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not hype or hype["level"] == "faible":
        return []
    scored = [comp["label"].lower() for comp in hype["components"] if comp.get("points")]
    what = ", ".join(scored) if scored else "signaux de marché"
    if hype["level"] == "modere":
        return [_reason("hype", "info", f"Battage modéré ({hype['points']} points sur 6) : {what}.", hype["points"], 3)]
    lo, hi = persona["constraints"]["horizon_years"]
    horizon = (f" Avec un horizon de {persona['horizon']}, une correction laisserait peu de temps pour se refaire."
               if hi <= 5 else "")
    return [_reason("hype", "attention", f"Battage élevé ({hype['points']} points sur 6) : {what} anormaux. "
                    f"Une décision sous l'effet de l'emballement est risquée.{horizon}", hype["points"], 3,
                    "battage élevé")]


def checks(persona: dict[str, Any], info: dict[str, Any], volatility: float | None,
           esg: dict[str, Any] | None = None, hype: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Every rule's reason, blocking first; `info` holds ticker, asset_class and sector."""
    c = persona["constraints"]
    reasons = _core(persona, info, volatility) + _esg(persona, esg) + _hype(persona, hype)
    reasons.append(_reason("position", "info", f"Position maximale pour {persona['name']} : "
                           f"{pct(c['max_single_position'], 0)} du portefeuille.", None, c["max_single_position"]))
    return sorted(reasons, key=lambda r: SEVERITY_ORDER[r["severity"]])


def verdict(reasons: list[dict[str, Any]]) -> Verdict:
    severities = {r["severity"] for r in reasons}
    return "hors_profil" if "bloquant" in severities else ("a_surveiller" if "attention" in severities
                                                           else "compatible")


def summary(persona: dict[str, Any], reasons: list[dict[str, Any]]) -> str:
    v = verdict(reasons)
    name = persona["name"]
    if v == "compatible":
        return f"Compatible avec le profil {of_name(name)}."
    blocking = [r["short"] for r in reasons if r["severity"] == "bloquant" and r["short"]]
    watch = [r["short"] for r in reasons if r["severity"] == "attention" and r["short"]]
    if v == "hors_profil":
        return f"Hors profil pour {name} : " + " ; ".join(blocking + watch) + "."
    return f"À surveiller pour {name} : " + " ; ".join(watch) + "."


def public(reasons: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reasons as the API serves them (without the summary's short labels)."""
    return [{k: r[k] for k in ("rule", "severity", "message", "value", "limit")} for r in reasons]


def asset_flags(persona: dict[str, Any], info: dict[str, Any], volatility: float | None) -> list[str]:
    return [r["message"] for r in _core(persona, info, volatility)
            if r["severity"] == "bloquant" and r["rule"] in ASSET_FLAG_RULES]


def fits(persona: dict[str, Any], info: dict[str, Any], volatility: float | None) -> bool:
    return not asset_flags(persona, info, volatility)
