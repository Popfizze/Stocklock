"""The fit rules of app.services.profile, one by one, on the three personas."""

from __future__ import annotations

import pytest

from app.personas import get_persona
from app.services import profile

AMIRA, MATEO, ROBERT = (get_persona(p) for p in ("amira", "mateo", "robert"))
EQUITY = {"ticker": "NVDA", "asset_class": "equity", "sector": "Technology"}


def esg(low: int, level: int | None) -> dict:
    return {"risk_low": low, "risk_high": low + 5, "risk_label": f"Risque ESG ({low} à {low + 5})",
            "controversy_level": level}


def hype(level: str, points: int) -> dict:
    return {"level": level, "points": points,
            "components": [{"label": "Volume échangé", "points": 2}, {"label": "Hausse sur un mois", "points": 1},
                           {"label": "Attention médiatique", "points": 0}]}


def rules(reasons: list[dict], severity: str) -> list[str]:
    return [r["rule"] for r in reasons if r["severity"] == severity]


def test_volatility_above_the_profile_maximum_is_out_of_profile_and_kept_as_an_asset_flag():
    reasons = profile.checks(ROBERT, EQUITY, 0.486)
    assert profile.verdict(reasons) == "hors_profil"
    assert reasons[0]["rule"] == "volatility" and reasons[0]["value"] == 0.486 and reasons[0]["limit"] == 0.25
    assert profile.summary(ROBERT, reasons) == "Hors profil pour Robert : volatilité trop élevée."
    # The Lab / bias / score steps keep their message.
    assert profile.asset_flags(ROBERT, EQUITY, 0.486) == [
        "Volatilité annualisée de 48,6 % supérieure au seuil de 25 % retenu pour le profil Robert "
        "(risque faible à modéré)."]
    assert profile.verdict(profile.checks(AMIRA, EQUITY, 0.486)) == "compatible"
    assert profile.summary(AMIRA, profile.checks(AMIRA, EQUITY, 0.486)) == "Compatible avec le profil d’Amira."


def test_unknown_volatility_is_to_watch_and_the_position_reminder_is_always_there():
    reasons = profile.checks(MATEO, EQUITY, None)
    assert profile.verdict(reasons) == "a_surveiller"
    position = next(r for r in reasons if r["rule"] == "position")
    assert position["severity"] == "info" and position["limit"] == 0.15
    assert "15 % du portefeuille" in position["message"]


def test_crypto_is_blocking_unless_the_profile_allows_it():
    crypto = {"ticker": "BTC-USD", "asset_class": "crypto", "sector": None}
    robert = profile.checks(ROBERT, crypto, 0.2)
    assert rules(robert, "bloquant") == ["crypto"]
    assert profile.summary(ROBERT, robert) == "Hors profil pour Robert : cryptoactif exclu."
    amira = profile.checks(AMIRA, crypto, 0.45)
    assert profile.verdict(amira) == "compatible"
    assert "minoritaire" in next(r for r in amira if r["rule"] == "crypto")["message"]


def test_an_excluded_sector_is_out_of_profile():
    reasons = profile.checks(MATEO, {"ticker": "XOM", "asset_class": "equity", "sector": "Energy"}, 0.22)
    assert rules(reasons, "bloquant") == ["sector"]
    assert profile.summary(MATEO, reasons) == "Hors profil pour Mateo : secteur « Energy » exclu."


@pytest.mark.parametrize("level, low, verdict, rule_severities", [
    (5, 15, "hors_profil", {"esg_controversy": "bloquant", "esg_risk": "ok"}),
    (4, 15, "a_surveiller", {"esg_controversy": "attention", "esg_risk": "ok"}),
    (2, 30, "a_surveiller", {"esg_controversy": "ok", "esg_risk": "attention"}),
    (2, 15, "compatible", {"esg_controversy": "ok", "esg_risk": "ok"}),
])
def test_esg_rules_apply_to_the_esg_profile(level, low, verdict, rule_severities):
    reasons = profile.checks(MATEO, EQUITY, 0.2, esg(low, level))
    assert profile.verdict(reasons) == verdict
    assert {r["rule"]: r["severity"] for r in reasons if r["rule"].startswith("esg")} == rule_severities


def test_esg_is_information_only_for_other_profiles_and_unknown_esg_is_said():
    robert = profile.checks(ROBERT, EQUITY, 0.2, esg(40, 5))
    assert profile.verdict(robert) == "compatible"
    assert [(r["rule"], r["severity"]) for r in robert if r["rule"].startswith("esg")] == [("esg_controversy", "info")]
    mateo = profile.checks(MATEO, EQUITY, 0.2, None)
    unknown = next(r for r in mateo if r["rule"] == "esg_unknown")
    assert unknown["severity"] == "info" and "ne peut pas être vérifiée" in unknown["message"]
    assert profile.verdict(mateo) == "compatible"


def test_high_hype_is_to_watch_with_a_horizon_warning_for_a_short_horizon():
    robert = profile.checks(ROBERT, EQUITY, 0.2, None, hype("eleve", 4))
    reason = next(r for r in robert if r["rule"] == "hype")
    assert reason["severity"] == "attention" and reason["value"] == 4
    assert "volume échangé, hausse sur un mois" in reason["message"]
    assert "3 à 5 ans" in reason["message"]
    assert profile.summary(ROBERT, robert) == "À surveiller pour Robert : battage élevé."
    amira = profile.checks(AMIRA, EQUITY, 0.2, None, hype("eleve", 4))
    assert "horizon" not in next(r for r in amira if r["rule"] == "hype")["message"]
    assert next(r for r in profile.checks(AMIRA, EQUITY, 0.2, None, hype("modere", 2))
                if r["rule"] == "hype")["severity"] == "info"
    assert not [r for r in profile.checks(AMIRA, EQUITY, 0.2, None, hype("faible", 1)) if r["rule"] == "hype"]


def test_reasons_are_ordered_blocking_first_and_public_reasons_drop_the_short_labels():
    reasons = profile.checks(MATEO, {"ticker": "XOM", "asset_class": "equity", "sector": "Energy"}, 0.5,
                             esg(35, 4), hype("eleve", 3))
    severities = [r["severity"] for r in reasons]
    assert severities == sorted(severities, key=profile.SEVERITY_ORDER.get)
    assert profile.summary(MATEO, reasons) == ("Hors profil pour Mateo : volatilité trop élevée ; secteur « Energy » "
                                               "exclu ; controverse élevée ; risque ESG élevé ; battage élevé.")
    assert set(profile.public(reasons)[0]) == {"rule", "severity", "message", "value", "limit"}
