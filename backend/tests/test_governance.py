from app.personas import get_persona
from app.services import governance as gov
from app.services.report import Report


def _report():
    r = Report(task="score")
    r.source("starter_prices", "Kit")
    r.factor("Volatilité annualisée (1 an)", 0.2495, "ratio", source_id="starter_prices")
    r.factor("Score global", 78.04, "/100")
    r.factor("Valeur nette après impôt — CELI", 101315.4, "$")
    return r


def test_extract_numbers_french_formats():
    nums = [t.value for t in gov.extract_numbers("Score 78,0/100, volatilité 24,9 %, valeur 101 315 $ le 2022-05-26 [gdelt_X_1]")]
    assert nums == [78.0, 100.0, 24.9, 101315.0]


def test_grounded_answer_passes():
    answer = ("Le score est de 78/100 et la volatilité de 24,9 % [starter_prices]. Le CELI vaut 101 315 $ en 2041. "
              "Simulation éducative, pas un conseil financier personnalisé.")
    final, verdict, bad = gov.check(answer, _report(), get_persona("amira"), {})
    assert verdict.passed and bad == []
    assert final == answer


def test_invented_number_fails():
    answer = "Le titre va monter de 37 % d'ici 2027. Simulation, pas un conseil."
    _, verdict, bad = gov.check(answer, _report(), get_persona("amira"), {})
    assert bad == ["37"]
    check = next(c for c in verdict.checks if c.name == "numbers_grounded")
    assert not check.passed and not verdict.passed


def test_disclaimer_added_when_missing():
    final, verdict, _ = gov.check("Score de 78/100.", _report(), get_persona("amira"), {})
    assert final.endswith(gov.DISCLAIMER)
    assert next(c for c in verdict.checks if c.name == "disclaimer").note == "mention ajoutée automatiquement"


def test_profile_warning_added_for_robert():
    r = _report()
    r.profile_flags.append("Volatilité annualisée de 63,4 % supérieure au seuil de 25 %.")
    final, verdict, _ = gov.check("Score de 78/100. Simulation, pas un conseil.", r, get_persona("robert"), {})
    assert "Écart avec votre profil" in final
    assert verdict.passed


def test_dangling_source_reference_fails():
    r = _report()
    r.factor("Ton", 0.5, None, source_id="gdelt_missing")
    _, verdict, _ = gov.check("Simulation, pas un conseil.", r, get_persona("amira"), {})
    assert not next(c for c in verdict.checks if c.name == "sources").passed


def test_inputs_and_persona_numbers_are_allowed():
    answer = "Avec 7 000 $ par an pendant 15 ans à 5 %, Mateo (41 ans)... Simulation, pas un conseil."
    _, verdict, bad = gov.check(answer, _report(), get_persona("mateo"),
                                {"annual_contribution": 7000, "years": 15, "expected_return": 0.05})
    assert bad == [], bad
