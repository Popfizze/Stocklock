import type { MarkedMove, MoveEvent, StockMovesResult } from '@/api/moves'

/** Test fixtures shaped like `POST /api/explain-move/stock`; the values are placeholders. */

const event = (overrides: Partial<MoveEvent>): MoveEvent => ({
  id: 'e1',
  date: '2026-08-26',
  event_date: '2026-08-26',
  kind: '8-K',
  label: '8-K : résultats financiers (2.02)',
  summary: 'NVIDIA publie des revenus trimestriels record.',
  summary_by: 'haiku',
  category: 'entreprise',
  primary: true,
  url: 'https://www.sec.gov/Archives/edgar/data/1045810/q2fy27pr.htm',
  source_id: 'web_e1',
  ...overrides,
})

const move = (overrides: Partial<MarkedMove>): MarkedMove => ({
  date: '2026-08-27',
  asset: -0.081,
  benchmark: -0.012,
  abnormal: -0.069,
  z: -3.2,
  explanation: 'aucun_evenement',
  verdict: 'aucun événement',
  reason: 'Aucun événement daté dans les jours qui précèdent ce mouvement.',
  excerpt: '',
  judged_by: 'règle',
  event: null,
  events: [],
  ...overrides,
})

const results = event({})
const article = event({
  id: 'e2', date: '2026-11-11', event_date: '2026-11-10', kind: 'pic GDELT', label: 'Nvidia selloff deepens',
  summary: 'Le titre recule avec les craintes sur l’IA.', primary: false, url: 'https://www.aol.com/articles/nvidia',
  source_id: 'web_e2', category: 'marché',
})

export const NVDA_MOVES: StockMovesResult = {
  analysis: {
    answer: 'Analyse pour Robert\n\nNVDA a fait **moins bien** que QQQ [starter_prices].\nSimulation éducative, pas un conseil financier personnalisé.',
    sources: [
      { id: 'starter_prices', title: 'AlphaForge starter kit, prices_daily.csv', url: null, as_of: '2026-11-12' },
      { id: 'web_e1', title: 'sec.gov : 8-K : résultats financiers (2.02)', url: results.url, as_of: null },
    ],
    assumptions: ['Proximité temporelle : ce n’est pas une preuve de causalité.'],
    limits: ['Moins de 60 séances avant la fenêtre.'],
    governance: { passed: true, checks: [] },
  },
  ticker: 'NVDA',
  name: 'NVIDIA',
  period: '1y',
  window: { start: '2025-11-12', end: '2026-11-12' },
  benchmark: 'QQQ',
  method: 'market_model',
  returns: { asset: 0.0512, benchmark: 0.1834, expected: 0.21, abnormal: -0.1322 },
  sigma: 0.0215,
  confidence: 'moyenne',
  series: [
    { date: '2025-11-11', asset: 0, benchmark: 0 },
    { date: '2026-08-27', asset: 0.02, benchmark: 0.15 },
    { date: '2026-11-11', asset: 0.0512, benchmark: 0.1834 },
  ],
  moves: [
    move({
      explanation: 'fait', verdict: 'plausible', judged_by: 'haiku', event: results, events: [results],
      reason: 'Les résultats publiés la veille concernent directement l’entreprise.',
      excerpt: 'revenus trimestriels record',
    }),
    move({
      date: '2026-11-11', asset: -0.05, benchmark: -0.01, abnormal: -0.04, z: -2.4, explanation: 'hypothese',
      verdict: 'indéterminé', judged_by: 'haiku', event: article, events: [article], reason: 'Lien possible.',
    }),
    move({ date: '2026-03-02', asset: 0.06, benchmark: 0.01, abnormal: 0.05, z: 2.3 }),
  ],
  policy_events: [
    { date: '2026-09-16', kind: 'décision Fed', label: 'Réserve fédérale (Fed) : hausse du taux de 0,25 point', url: 'https://www.federalreserve.gov/' },
  ],
  profile_flags: ['Volatilité annualisée de 48,2 % supérieure au seuil de 15 % retenu pour le profil Robert.'],
  warnings: ['GDELT indisponible (limite de débit atteinte) : aucun événement du monde utilisé, rien n’est inventé.'],
}
