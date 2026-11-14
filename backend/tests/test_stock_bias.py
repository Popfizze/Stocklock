"""Stock-page bias analysis uses the selected asset and makes uncertainty explicit."""

import pandas as pd

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
