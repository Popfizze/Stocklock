"""Stock-page bias analysis uses the selected asset and makes uncertainty explicit."""

import pandas as pd
import pytest

from app.data import starter


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


def test_stock_bias_validates_ticker_and_blank_message(client):
    assert client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'AAPL', 'message': '   '}).status_code == 422
    assert client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'ZZZZ', 'message': 'acheter'}).status_code == 422
    assert client.post('/api/bias/stock', json={'persona_id': 'robert', 'ticker': 'AAPL', 'message': 'réfléchir', 'intent': 'invalid'}).status_code == 422


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
