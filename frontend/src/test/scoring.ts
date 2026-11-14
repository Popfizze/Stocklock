import type { PortfolioAnalysis } from '@/api/persona'
import {
  DEFAULT_SCORE_WEIGHTS,
  SUB_SCORE_LABELS,
  SUB_SCORE_ORDER,
  type ReweightResponse,
  type ReweightedRow,
  type ScoreSimulation,
  type ScoreWeights,
  type ScoringApplied,
  type ScoringChoice,
} from '@/api/scoring'
import type { SubScoreId } from '@/api/stocks'
import { PORTFOLIO_ROBERT } from './persona'

/*
 * The user's own score, one choice per profile, computed on Apple's real sub-scores
 * (rentabilité 83,52, solidité 43,21, croissance 52,34, valorisation 20,78,
 * momentum et risque 71,23 — 75,89 without the 12-1 momentum —, événements 49,06;
 * default score 56,08).
 */

/** Amira: growth and momentum first. */
export const WEIGHTS_AMIRA: ScoringChoice = {
  weights: { rentabilite: 15, solidite: 10, croissance: 35, valorisation: 10, momentum_risque: 25, evenements: 5 },
}

/** Mateo: solidity and valuation, little momentum. */
export const WEIGHTS_MATEO: ScoringChoice = {
  weights: { rentabilite: 25, solidite: 30, croissance: 10, valorisation: 20, momentum_risque: 10, evenements: 5 },
}

/** Robert: solidity and risk without momentum (the 12-1 return is left out), no growth or events. */
export const WEIGHTS_ROBERT: ScoringChoice = {
  weights: { rentabilite: 25, solidite: 35, croissance: 0, valorisation: 20, momentum_risque: 20, evenements: 0 },
  factors: { excluded_indicators: ['momentum_12_1'] },
}

const AAPL_SUBS: Record<SubScoreId, number> = {
  rentabilite: 83.52,
  solidite: 43.21,
  croissance: 52.34,
  valorisation: 20.78,
  momentum_risque: 71.23,
  evenements: 49.06,
}

const applied = (choice: ScoringChoice): ScoringApplied => ({
  weights: { ...DEFAULT_SCORE_WEIGHTS, ...choice.weights } as ScoreWeights,
  default_weights: DEFAULT_SCORE_WEIGHTS,
  excluded_indicators: choice.factors?.excluded_indicators ?? [],
  custom: true,
})

/** AAPL rescored with a choice whose weights already sum to 100. */
function aapl(choice: ScoringChoice, rank: number, overrides: Partial<Record<SubScoreId, number>> = {}): ReweightedRow {
  const weights = applied(choice).weights
  const subs = { ...AAPL_SUBS, ...overrides }
  const sub_scores = SUB_SCORE_ORDER.map((id) => ({
    id,
    label: SUB_SCORE_LABELS[id],
    score: subs[id],
    default_weight: DEFAULT_SCORE_WEIGHTS[id],
    weight: weights[id],
    effective_weight: weights[id] / 100,
    contribution: Math.round(subs[id] * weights[id]) / 100,
    default_contribution: Math.round(AAPL_SUBS[id] * DEFAULT_SCORE_WEIGHTS[id]) / 100,
  }))
  const custom = Math.round(sub_scores.reduce((sum, s) => sum + (s.score * s.weight) / 100, 0) * 100) / 100
  return {
    symbol: 'AAPL',
    date: '2026-11-13',
    default_score: 56.08,
    custom_score: custom,
    delta: Math.round((custom - 56.08) * 100) / 100,
    default_rank: 71,
    custom_rank: rank,
    rank_change: 71 - rank,
    partiel: false,
    comparison_set: 'Technology, 24 titres',
    sub_scores,
  }
}

const response = (choice: ScoringChoice, items: ReweightedRow[]): ReweightResponse => ({
  status: 'available',
  message: null,
  generated_at: '2026-11-14T22:22:16+00:00',
  applied: applied(choice),
  total: 200,
  items,
  missing: [],
})

export const REWEIGHT_AMIRA = response(WEIGHTS_AMIRA, [aapl(WEIGHTS_AMIRA, 64)])
export const REWEIGHT_MATEO = response(WEIGHTS_MATEO, [aapl(WEIGHTS_MATEO, 88)])
export const REWEIGHT_ROBERT: ReweightResponse = {
  ...response(WEIGHTS_ROBERT, [aapl(WEIGHTS_ROBERT, 69, { momentum_risque: 75.89 })]),
  missing: ['ZZZZ'],
}

/** The score table has not been computed yet. */
export const REWEIGHT_ABSENT: ReweightResponse = {
  status: 'absent',
  message: "La table des scores n'existe pas encore : le pipeline de score n'a pas encore été exécuté.",
  generated_at: null,
  applied: applied({}),
  total: 0,
  items: [],
  missing: [],
}

/** Robert moving each slider on AAPL (5 points of the 21 shown per curve). */
export const SIMULATION_AAPL_ROBERT: ScoreSimulation = {
  status: 'available',
  message: null,
  symbol: 'AAPL',
  applied: applied(WEIGHTS_ROBERT),
  comparison: {
    default_score: 56.08,
    custom_score: 55.34,
    delta: -0.74,
    default_rank: 71,
    custom_rank: 69,
    rank_change: 2,
    partiel: false,
  },
  total: 200,
  curves: SUB_SCORE_ORDER.map((id) => ({
    id,
    label: SUB_SCORE_LABELS[id],
    weight: applied(WEIGHTS_ROBERT).weights[id],
    sub_score: id === 'momentum_risque' ? 75.89 : AAPL_SUBS[id],
    points: [0, 25, 50, 75, 100].map((weight) => {
      const sub = id === 'momentum_risque' ? 75.89 : AAPL_SUBS[id]
      const others = 100 - applied(WEIGHTS_ROBERT).weights[id]
      const rest = 55.34 * 100 - sub * applied(WEIGHTS_ROBERT).weights[id]
      const score = Math.round(((rest + sub * weight) / (others + weight)) * 100) / 100
      return { weight, score, rank: Math.max(1, Math.round(140 - score)) }
    }),
  })),
}

/** Robert's portfolio analysed with his own weights: RY.TO moves up, suggestions say so. */
export const PORTFOLIO_ROBERT_CUSTOM: PortfolioAnalysis = {
  ...PORTFOLIO_ROBERT,
  holdings: PORTFOLIO_ROBERT.holdings.map((h) =>
    h.score
      ? { ...h, score: { ...h.score, custom_score: 66.2, delta: 4.8, custom_rank: 41, rank_change: 17 } }
      : h,
  ),
  suggestions: {
    source: 'score_table',
    message: null,
    items: [
      {
        ticker: 'UNP',
        name: 'Union Pacific Corporation',
        sector: 'Industrials',
        asset_class: 'equity',
        score: 74.6,
        ranking: {
          default_score: 69.1,
          custom_score: 74.6,
          delta: 5.5,
          default_rank: 22,
          custom_rank: 9,
          rank_change: 13,
          partiel: false,
        },
        verdict: 'compatible',
        reasons: [
          'Score StockLock de 75 sur 100 avec vos pondérations (69 par défaut).',
          'Vos pondérations le font passer du 22e au 9e rang (+13 places).',
          'Compatible avec le profil de Robert (volatilité sur 1 an de 21,3 %).',
          'Secteur « Industrie » absent du portefeuille : améliore la diversification.',
        ],
      },
    ],
  },
  scoring: applied(WEIGHTS_ROBERT),
}
