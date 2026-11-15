"""Stock-page bias analysis uses the selected asset and makes uncertainty explicit."""

import pandas as pd
import pytest

from app.data import starter, yf_live


def test_stock_bias_uses_selected_ticker_and_exposes_history(client):
    response = client.post('/api/bias/stock', json={
        'persona_id': 'robert', 'ticker': 'AAPL',
        'message': 'Tout le monde achète, je veux vendre tout de suite.',
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['simulation']['ticker'] == 'AAPL'
    assert body['simulation']['points'][-1]['date'] == body['simulation']['end']
    assert body['history']['start'] < body['history']['end']
    assert body['history']['return_20d'] is not None
    assert any('historique des décisions' in limit for limit in body['analysis']['limits'])
    assert any('indisponible' in warning for warning in body['warnings'])  # Bedrock/GDELT offline


def test_stock_bias_validates_blank_message_and_intent(client):
    assert client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'AAPL', 'message': '   '}).status_code == 422
    assert client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'AAPL', 'message': 'réfléchir', 'intent': 'invalid'}).status_code == 422


def _external_history(monkeypatch, start='2022-01-03', currency='CAD'):
    monkeypatch.setattr(yf_live, 'info', lambda symbol: {
        'name': 'Example Inc.', 'currency': currency, 'sector': 'Technology', 'quote_type': 'EQUITY',
    })
    dates = pd.bdate_range(start, '2026-11-12')
    prices = [100.0 if i % 2 == 0 else 120.0 for i in range(len(dates))]
    frame = pd.DataFrame({'date': dates, 'close': prices, 'adj_close': prices, 'volume': 1000})
    monkeypatch.setattr(yf_live, 'daily_prices', lambda *args: (frame.copy(), False))


def test_external_stock_uses_its_history_and_profile_for_simulation(client, monkeypatch):
    _external_history(monkeypatch)
    response = client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'ONE.V',
                                                     'message': 'Je réfléchis.', 'intent': 'buy'})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['history']['source'] == 'yfinance'
    assert body['simulation']['ticker'] == 'ONE.V'
    assert body['simulation']['start'] == '2022-01-03'
    assert body['simulation']['end'] <= str(starter.adj_close_cad('ZST.TO').index.max().date())
    assert any('Volatilité annualisée' in flag for flag in body['profile_flags'])
    assert any(source['id'] == 'yfinance_history_ONE.V' for source in body['analysis']['sources'])


def test_external_stock_without_2022_history_keeps_partial_analysis(client, monkeypatch):
    _external_history(monkeypatch, start='2024-01-02')
    response = client.post('/api/bias/stock', json={'persona_id': 'amira', 'ticker': 'ONE.V', 'message': 'Je réfléchis.'})
    assert response.status_code == 200, response.text
    assert response.json()['history']['source'] == 'yfinance'
    assert response.json()['simulation'] is None
    assert any('aucun historique' in warning for warning in response.json()['warnings'])


def test_external_usd_stock_simulation_uses_historical_exchange_rates(client, monkeypatch):
    _external_history(monkeypatch, currency='USD')
    response = client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'ONE.V', 'message': 'Je réfléchis.'})
    assert response.status_code == 200, response.text
    result = response.json()['simulation']
    dates = pd.bdate_range('2022-01-03', '2026-11-12')
    prices = pd.Series([100.0 if i % 2 == 0 else 120.0 for i in range(len(dates))], index=dates)
    converted = starter.to_cad(prices, 'USD')
    assert result['hold_final'] == pytest.approx(10_000 * converted.iloc[-1] / converted.iloc[0])
    assert result['end'] <= str(starter.fx_usdcad().index.max().date())


def test_external_stock_without_volume_is_not_reported_as_complete(client, monkeypatch):
    _external_history(monkeypatch)
    original = yf_live.daily_prices

    def without_volume(*args):
        frame, cached = original(*args)
        frame['volume'] = 0
        return frame, cached

    monkeypatch.setattr(yf_live, 'daily_prices', without_volume)
    response = client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'ONE.V', 'message': 'Je réfléchis.'})
    assert response.status_code == 200, response.text
    assert response.json()['history']['volume_ratio'] is None
    assert any('Volumes insuffisants' in warning for warning in response.json()['warnings'])


def test_external_stock_with_incomplete_2022_does_not_claim_a_yearly_trough(client, monkeypatch):
    _external_history(monkeypatch, start='2022-07-01')
    response = client.post('/api/bias/stock', json={'persona_id': 'amira', 'ticker': 'ONE.V', 'message': 'Je réfléchis.'})
    assert response.status_code == 200, response.text
    assert response.json()['simulation'] is None
    assert any('historique incomplet' in warning for warning in response.json()['warnings'])


def test_external_stock_with_unknown_currency_does_not_assume_usd(client, monkeypatch):
    _external_history(monkeypatch, currency=None)
    response = client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'ONE.V', 'message': 'Je réfléchis.'})
    assert response.status_code == 200, response.text
    assert response.json()['history']['source'] == 'yfinance'
    assert response.json()['simulation'] is None
    assert any('devise' in warning for warning in response.json()['warnings'])


def test_external_stock_without_prices_still_analyzes_message(client, monkeypatch):
    monkeypatch.setattr(yf_live, 'info', lambda symbol: {
        'name': 'Example Inc.', 'currency': 'CAD', 'sector': 'Energy', 'quote_type': 'EQUITY',
    })
    response = client.post('/api/bias/stock', json={'persona_id': 'mateo', 'ticker': 'ONE.V',
                                                     'message': 'Tout le monde achète.'})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['history'] is None and body['simulation'] is None
    assert any(signal['category'] == 'autorite_sociale' for signal in body['signals'])
    assert any('exclu' in flag for flag in body['profile_flags'])
    assert any('Historique' in warning for warning in body['warnings'])


@pytest.mark.parametrize(('intent', 'label'), [('buy', 'acheter'), ('sell', 'vendre'), ('undecided', 'indécis')])
def test_declared_intent_reaches_narration_as_structured_facts(client, fake_narrator, intent, label):
    response = client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'AAPL',
                                                     'message': 'Je réfléchis à cette décision.', 'intent': intent})
    assert response.status_code == 200, response.text
    narrator = next(call for call in fake_narrator if call['task'] == 'bias')
    assert narrator['facts']['context']['intention_declaree'] == label
    assert any(f['name'] == 'Intention déclarée' and f['value'] == label for f in response.json()['analysis']['factors'])


def test_profile_changes_the_analysis_for_the_same_cryptoasset(client):
    payload = {'ticker': 'BTC-USD', 'message': 'Je réfléchis à acheter ce titre.'}
    amira = client.post('/api/bias/stock', json={**payload, 'persona_id': 'amira'}).json()
    robert = client.post('/api/bias/stock', json={**payload, 'persona_id': 'robert'}).json()
    assert not any('Cryptoactif hors du profil' in flag for flag in amira['profile_flags'])
    assert any('Cryptoactif hors du profil de Robert' in flag for flag in robert['profile_flags'])


def test_mateo_esg_limit_is_visible_even_when_no_sector_is_excluded(client):
    response = client.post('/api/bias/stock', json={'persona_id': 'mateo', 'ticker': 'AAPL', 'message': 'Je réfléchis.'})
    assert response.status_code == 200
    assert any('controverses ESG' in limit for limit in response.json()['analysis']['limits'])


def test_stock_bias_without_2022_prices_does_not_simulate_another_asset(client, monkeypatch):
    original = starter.adj_close_cad

    def missing_2022(ticker):
        series = original(ticker)
        return series.loc[series.index >= pd.Timestamp('2023-01-01')] if ticker == 'AAPL' else series

    monkeypatch.setattr(starter, 'adj_close_cad', missing_2022)
    response = client.post('/api/bias/stock', json={'persona_id': 'amira', 'ticker': 'AAPL', 'message': 'Je réfléchis.'})
    assert response.status_code == 200, response.text
    assert response.json()['simulation'] is None
    assert any('aucun historique' in warning for warning in response.json()['warnings'])


def test_typographic_apostrophes_neither_hide_a_signal_nor_reject_a_true_excerpt():
    """The app's own proposed messages are written with « ’ »: the lexicon and the excerpt check read them."""
    from app.services import lexicon

    message = "Le titre a perdu 19,5 % : j’ai peur que ça s’effondre, je veux tout vendre aujourd’hui."
    found = lexicon.detect(message)
    assert {"panique", "urgence"} <= {s["category"] for s in found}
    assert all(s["excerpt"] in message for s in found)  # still copied from the message itself
    assert lexicon.excerpt_is_verbatim("j'ai peur que ça s'effondre", message)
    assert lexicon.excerpt_is_verbatim("« J’ai peur que  ça s’effondre… »", message)
    assert not lexicon.excerpt_is_verbatim("je suis certain de gagner", message)
    assert not lexicon.excerpt_is_verbatim("  ", message)
    # The sale the stock page proposes after a fall is read as what it is.
    proposed = "Le titre a perdu 19,5 % en un mois : j’ai peur que la baisse continue et je pense vendre avant de perdre davantage."
    assert "panique" in {s["category"] for s in lexicon.detect(proposed)}
