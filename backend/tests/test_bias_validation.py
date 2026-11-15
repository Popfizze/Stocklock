from app.services.bias_validation import evaluate_lexicon, load_cases
from app.agents.prompts import TASK_PROMPTS


def test_labelled_french_corpus_keeps_the_lexicon_baseline_measurable():
    report = evaluate_lexicon()

    assert len(load_cases()) >= 9
    assert report["cases"] >= 9
    assert report["precision"] >= 0.9
    assert report["recall"] >= 0.9
    assert report["false_positives"] == []
    assert report["false_negatives"] == []


def test_bias_narration_is_constrained_to_profile_specific_descriptive_language():
    prompt = TASK_PROMPTS["bias"]

    assert "pas d'impératif" in prompt
    assert "propre au profil reçu" in prompt
    assert "ne constituent pas une recommandation" in prompt
