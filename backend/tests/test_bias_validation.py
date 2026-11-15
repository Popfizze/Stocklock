from app.services.bias_validation import evaluate_lexicon, load_cases


def test_labelled_french_corpus_keeps_the_lexicon_baseline_measurable():
    report = evaluate_lexicon()

    assert len(load_cases()) >= 9
    assert report["cases"] >= 9
    assert report["precision"] >= 0.9
    assert report["recall"] >= 0.9
    assert report["false_positives"] == []
    assert report["false_negatives"] == []
