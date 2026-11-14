import type { LabCatalog, LabRunResponse } from '@/api/lab'

/** Test fixtures shaped like the Labo API contract; the values are placeholders. */
export const LAB_CATALOG: LabCatalog = {
  steps: [
    {
      id: 'score',
      label: '1. Score',
      inputs: [
        { name: 'ticker', label: 'Titre', type: 'text', default: 'SHOP.TO', help: 'Symbole boursier' },
        { name: 'peers', label: 'Pairs', type: 'tickers', default: ['RY.TO', 'TD.TO'] },
        { name: 'as_of', label: 'Date', type: 'date', default: '2026-11-13' },
        { name: 'amount', label: 'Montant', type: 'number', default: 1000 },
        { name: 'include_esg', label: 'Inclure ESG', type: 'boolean', default: false },
      ],
      stages: [
        {
          id: 'fetch',
          layer: 'bronze',
          name: 'Collecte',
          description: 'Récupère les prix.',
          options: [
            {
              key: 'window',
              label: 'Fenêtre',
              choices: [
                { value: '1y', label: '1 an' },
                { value: '5y', label: '5 ans' },
              ],
              default: '1y',
            },
          ],
        },
        {
          id: 'scoring',
          layer: 'gold',
          name: 'Notation',
          description: 'Calcule le score.',
          options: [
            {
              key: 'method',
              label: 'Méthode',
              description: 'Agrégation des facteurs',
              choices: [
                { value: 'zscore', label: 'Z-score' },
                { value: 'rank', label: 'Rangs' },
              ],
              default: 'zscore',
              lab_default: 'rank',
            },
          ],
        },
      ],
    },
    {
      id: 'fluctuations',
      label: '2. Fluctuations',
      inputs: [{ name: 'question', label: 'Question', type: 'textarea', default: 'Pourquoi ?' }],
      stages: [
        { id: 'news', name: 'Actualités', description: 'Cherche les nouvelles.', layer: 'bronze', options: [] },
      ],
    },
  ],
}

export const LAB_RUN: LabRunResponse = {
  run_id: 'run-1',
  step: 'score',
  duration_ms: 1530,
  options_used: { 'fetch.window': '5y', 'scoring.method': 'rank' },
  key_result: { label: 'Score', value: 72 },
  stages: [
    {
      id: 'fetch',
      name: 'Collecte',
      status: 'ok',
      duration_ms: 420,
      options_used: { window: '5y' },
      metrics: { lignes: 12, fournisseur: 'yfinance' },
      preview: {
        columns: ['date', 'close'],
        rows: [
          ['2026-11-12', 101.5],
          ['2026-11-13', null],
        ],
      },
      warnings: [],
      sources: [
        {
          id: 's1',
          title: 'Yahoo Finance',
          url: 'https://finance.yahoo.com/quote/SHOP.TO',
          as_of: '2026-11-13',
        },
      ],
      decisions: [
        {
          question: 'Quelle source de prix pour SHOP.TO ?',
          answer: 'kit de départ (prices_daily.csv)',
          reason: "Choix de l'option de l'étape.",
          rule: 'option source = starter',
        },
        {
          question: 'Quelles séances garder ?',
          answer: '2 séances sur 1255',
          reason: 'Filtre sur la période 2026-11-12 → 2026-11-13.',
          inputs: { début: '2026-11-12', fin: '2026-11-13' },
        },
      ],
      datasets: [
        {
          id: 'prices_SHOP.TO',
          title: 'Prix quotidiens SHOP.TO (kit, prices_daily.csv)',
          source_id: 's1',
          columns: ['date', 'ticker', 'close', 'volume'],
          rows: [
            ['2026-11-12', 'SHOP.TO', 101.5, 1200],
            ['2026-11-13', 'SHOP.TO', null, 900],
          ],
          total_rows: 2,
          truncated: false,
        },
        {
          id: 'edgar_facts',
          title: 'Faits XBRL EDGAR (companyfacts)',
          source_id: null,
          columns: ['concept', 'val', 'filed'],
          rows: [['Revenues', 100, '2026-02-15']],
          total_rows: 3,
          truncated: true,
        },
      ],
    },
    {
      id: 'scoring',
      name: 'Notation',
      status: 'warning',
      duration_ms: 80,
      options_used: { method: 'rank' },
      metrics: { score: 0.42 },
      preview: null,
      warnings: ['Données ESG manquantes'],
      sources: [{ id: 's2', title: 'Rapport annuel' }],
      decisions: [
        {
          question: 'Que faire des sous-scores manquants ?',
          answer: 'poids redistribué (Sous-score ton médiatique)',
          reason: '1 sous-score sans donnée : son poids est réparti entre les 6 autres.',
          rule: 'poids effectif = poids nominal / somme des poids nominaux disponibles',
          inputs: { 'poids manquant': 0.1 },
        },
      ],
      datasets: [],
    },
  ],
  result: {
    answer: 'Score de 72 sur 100.',
    factors: [{ name: 'Marge', value: 0.31, unit: '%', effect: 'positif', source_id: 's2' }],
    sources: [
      { id: 's1', title: 'Yahoo Finance', url: 'https://finance.yahoo.com/quote/SHOP.TO' },
      { id: 's2', title: 'Rapport annuel', as_of: '2025-12-31' },
    ],
    assumptions: ['Prix de clôture ajustés'],
    limits: ['Pas de données intrajournalières'],
    trace: ['fetch', 'scoring'],
    governance: {
      passed: false,
      checks: [
        { name: 'Sources citées', passed: true, note: 'Deux sources' },
        { name: 'Fraîcheur', passed: false, note: 'Données de plus de 24 h' },
      ],
    },
  },
}
