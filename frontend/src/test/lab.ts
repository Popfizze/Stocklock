import type { LabBatchResponse, LabCatalog, LabGroupCatalog, LabRunResponse } from '@/api/lab'

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
      group_runnable: true,
      group_input: 'ticker',
    },
    {
      id: 'fluctuations',
      label: '2. Fluctuations',
      inputs: [{ name: 'question', label: 'Question', type: 'textarea', default: 'Pourquoi ?' }],
      stages: [
        { id: 'news', name: 'Actualités', description: 'Cherche les nouvelles.', layer: 'bronze', options: [] },
      ],
      group_runnable: false,
      group_input: null,
    },
  ],
}

export const LAB_GROUPS: LabGroupCatalog = {
  max_titles: 25,
  sections: [
    { id: 'populaires', title: 'Les plus populaires' },
    { id: 'canada-populaires', title: 'Populaires au Canada' },
  ],
  sectors: [
    { name: 'Technologie', count: 48 },
    { name: 'Services financiers', count: 31 },
  ],
  sectors_source: 'Univers du pipeline de score (secteurs Yahoo Finance)',
}

const BATCH_RUN_REQUEST = {
  step: 'score',
  persona_id: 'amira',
  inputs: { peers: ['RY.TO'], as_of: '2026-11-13' },
  options: { 'fetch.window': '1y', 'scoring.method': 'rank' },
}

/** A group run on three titles: one ok, one with a warning, one past the time budget. */
export const LAB_BATCH_RUN: LabBatchResponse = {
  batch_id: 'batch-1',
  step: 'score',
  persona_id: 'amira',
  duration_ms: 48200,
  options_used: { 'fetch.window': '1y', 'scoring.method': 'rank' },
  group: {
    kind: 'section',
    ref: 'populaires',
    label: 'Les plus populaires',
    source: 'Yahoo Finance (filtre de titres)',
    tickers: ['NVDA', 'SHOP.TO', 'INTC'],
    total: 24,
    truncated: true,
  },
  budget: { limit_s: 240, estimated_s: 31, workers: 6, gdelt_calls: 3 },
  summary: { requested: 3, ok: 1, warning: 1, error: 0, timeout: 1 },
  items: [
    {
      ticker: 'NVDA',
      name: 'NVIDIA Corporation',
      status: 'ok',
      duration_ms: 6100,
      key_result: { label: 'Score sur 100', value: 81.2 },
      governance_passed: true,
      decisions: [
        {
          stage: 'fundamentals',
          stage_name: 'Relevés financiers',
          question: 'Quelle source de relevés financiers ?',
          answer: 'SEC EDGAR (companyfacts)',
          reason: 'EDGAR essayé en premier.',
          rule: 'option source = edgar_then_yfinance',
        },
        {
          stage: 'scoring',
          stage_name: 'Score',
          question: 'Score global ?',
          answer: 81.2,
          reason: 'Moyenne des sous-scores disponibles pondérée par les poids effectifs.',
        },
      ],
      warnings: 0,
      error: null,
      run_id: 'run-nvda',
      run_request: { ...BATCH_RUN_REQUEST, inputs: { ...BATCH_RUN_REQUEST.inputs, ticker: 'NVDA' } },
    },
    {
      ticker: 'SHOP.TO',
      name: 'Shopify Inc.',
      status: 'warning',
      duration_ms: 9400,
      key_result: { label: 'Score sur 100', value: 64.5 },
      governance_passed: true,
      decisions: [
        {
          stage: 'events',
          stage_name: 'Événements',
          question: "Quelle source d'événements ?",
          answer: 'actualités yfinance (repli)',
          reason: 'GDELT indisponible (limite de débit atteinte (HTTP 429)).',
        },
      ],
      warnings: 2,
      error: null,
      run_id: 'run-shop',
      run_request: { ...BATCH_RUN_REQUEST, inputs: { ...BATCH_RUN_REQUEST.inputs, ticker: 'SHOP.TO' } },
    },
    {
      ticker: 'INTC',
      name: null,
      status: 'timeout',
      duration_ms: null,
      key_result: null,
      governance_passed: null,
      decisions: [],
      warnings: 0,
      error: "Non terminé dans le temps imparti (240 s) : relancez ce titre seul.",
      run_id: null,
      run_request: { ...BATCH_RUN_REQUEST, inputs: { ...BATCH_RUN_REQUEST.inputs, ticker: 'INTC' } },
    },
  ],
  table: {
    columns: [
      { key: 'ticker', label: 'Titre', kind: 'text' },
      { key: 'status', label: 'Statut', kind: 'text' },
      { key: 'score', label: 'Score /100', kind: 'number' },
      { key: 'volatility', label: 'Volatilité', kind: 'percent' },
      { key: 'profile', label: 'Adapté au profil', kind: 'text' },
    ],
    rows: [
      { ticker: 'NVDA', status: 'ok', score: 81.2, volatility: 0.52, profile: 'à surveiller' },
      { ticker: 'SHOP.TO', status: 'warning', score: 64.5, volatility: 0.48, profile: 'oui' },
      { ticker: 'INTC', status: 'timeout', score: null, volatility: null, profile: null },
    ],
    default_sort: { key: 'score', direction: 'desc' },
  },
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
