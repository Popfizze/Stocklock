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
        { id: 'news', name: 'Actualités', description: 'Cherche les nouvelles.', options: [] },
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
