"""Deterministic confrontation of an asset or request with the chosen persona's constraints."""

from __future__ import annotations

from typing import Any


def asset_flags(persona: dict[str, Any], info: dict[str, Any], volatility: float | None) -> list[str]:
    c = persona["constraints"]
    flags: list[str] = []
    if volatility is not None and volatility > c["max_volatility"]:
        flags.append(
            f"Volatilité annualisée de {volatility * 100:.1f} % supérieure au seuil de ".replace(".", ",")
            + f"{c['max_volatility'] * 100:.0f} % retenu pour le profil {persona['name']} "
            f"(risque {persona['risk_tolerance']})."
        )
    if info.get("asset_class") == "crypto" and not c["allow_crypto"]:
        flags.append(f"Cryptoactif hors du profil de {persona['name']} (risque {persona['risk_tolerance']}).")
    if info.get("sector") in c["excluded_sectors"]:
        flags.append(
            f"Secteur « {info['sector']} » exclu par le filtre ESG simplifié de {persona['name']}."
        )
    if info.get("ticker") in c["excluded_tickers"]:
        flags.append(f"{info['ticker']} figure dans la liste d'exclusion de {persona['name']}.")
    return flags


def fits(persona: dict[str, Any], info: dict[str, Any], volatility: float | None) -> bool:
    return not asset_flags(persona, info, volatility)
