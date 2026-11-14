import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'
import type { SubScoreId } from './stocks'

/*
 * The user's own score: the gold table `score_par_titre` rescored with the user's
 * sub-score weights and method factors, without a new pipeline run.
 * - POST /api/scores/reweight: rows rescored, with default and custom score and rank;
 * - POST /api/scores/simulate: for one title, its custom score and rank along each
 *   weight's slider (21 points), so the UI shows sensitivity while dragging;
 * - POST /api/portfolio/analyze accepts the same `weights` / `factors` (see persona.ts).
 *
 * Only what the gold table can recompute is adjustable: the six weights and leaving
 * indicators out (a sub-score is the mean of its indicators' stored ranks). The events
 * half-life and the price window are not: the table keeps neither the events nor a
 * 3-year price history, so changing them needs a new pipeline run.
 *
 * Debounce-friendly: send the weights the sliders settle on (e.g. useDebouncedValue
 * 300 ms); the previous answer stays on screen while the next one loads.
 */

/** Weight of each sub-score; any scale (the server normalises to 100). */
export type ScoreWeights = Record<SubScoreId, number>

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  rentabilite: 25,
  solidite: 20,
  croissance: 15,
  valorisation: 15,
  momentum_risque: 15,
  evenements: 10,
}

export const SUB_SCORE_ORDER: SubScoreId[] = [
  'rentabilite',
  'solidite',
  'croissance',
  'valorisation',
  'momentum_risque',
  'evenements',
]

export const SUB_SCORE_LABELS: Record<SubScoreId, string> = {
  rentabilite: 'Rentabilité',
  solidite: 'Solidité financière',
  croissance: 'Croissance',
  valorisation: 'Valorisation',
  momentum_risque: 'Momentum et risque',
  evenements: 'Événements récents',
}

export type ScoreIndicatorId =
  | 'roe'
  | 'net_margin'
  | 'debt_to_equity'
  | 'interest_coverage'
  | 'revenue_cagr_3y'
  | 'eps_cagr_3y'
  | 'pe'
  | 'pb'
  | 'momentum_12_1'
  | 'volatility_1y'
  | 'max_drawdown_1y'
  | 'events_90d'

/** The indicators that can be left out, by sub-score. */
export const SCORE_INDICATORS: { id: ScoreIndicatorId; label: string; sub_score: SubScoreId }[] = [
  { id: 'roe', label: 'Rendement des capitaux propres (ROE)', sub_score: 'rentabilite' },
  { id: 'net_margin', label: 'Marge nette', sub_score: 'rentabilite' },
  { id: 'debt_to_equity', label: 'Dette / capitaux propres', sub_score: 'solidite' },
  { id: 'interest_coverage', label: 'Couverture des intérêts', sub_score: 'solidite' },
  { id: 'revenue_cagr_3y', label: "Croissance du chiffre d'affaires (3 ans)", sub_score: 'croissance' },
  { id: 'eps_cagr_3y', label: 'Croissance du BPA (3 ans)', sub_score: 'croissance' },
  { id: 'pe', label: 'Cours / bénéfice (C/B)', sub_score: 'valorisation' },
  { id: 'pb', label: 'Cours / valeur comptable (C/VC)', sub_score: 'valorisation' },
  { id: 'momentum_12_1', label: 'Rendement 12 mois sauf le dernier', sub_score: 'momentum_risque' },
  { id: 'volatility_1y', label: 'Volatilité (1 an)', sub_score: 'momentum_risque' },
  { id: 'max_drawdown_1y', label: 'Repli maximal (1 an)', sub_score: 'momentum_risque' },
  { id: 'events_90d', label: 'Événements des 90 derniers jours', sub_score: 'evenements' },
]

export interface ScoreFactors {
  /**
   * Indicators left out of their sub-score's mean. A sub-score left with none counts
   * as weight 0. Unknown ids, or leaving no weighted sub-score, are a 422.
   */
  excluded_indicators?: ScoreIndicatorId[]
}

/** What the user chose; omitted keys keep their default weight. */
export interface ScoringChoice {
  weights?: Partial<ScoreWeights>
  factors?: ScoreFactors
}

/** The choice as the server applied it (weights normalised to 100). */
export interface ScoringApplied {
  weights: ScoreWeights
  default_weights: ScoreWeights
  excluded_indicators: ScoreIndicatorId[]
  /** `false` when it equals the default method (same score as the gold table). */
  custom: boolean
}

export type ScoreTableStatus = 'available' | 'absent' | 'unavailable'

// --- POST /api/scores/reweight ----------------------------------------------------

export interface ReweightRequest extends ScoringChoice {
  /** At most 200 symbols; without them, the `limit` best rows by custom score. */
  tickers?: string[]
  /** Default 50, at most 500 (ignored with `tickers`). */
  limit?: number
}

export interface ReweightedSubScore {
  id: SubScoreId
  label: string
  /** Mean of the kept indicators' ranks (0-100); `null` when missing or all left out. */
  score: number | null
  /** Nominal weights in percent: the gold table's, then the user's (normalised). */
  default_weight: number
  weight: number
  /** Share of the score after missing sub-scores gave their weight away (0.25 is 25 %). */
  effective_weight: number
  /** score × effective_weight, in points of the custom score; then the stored one. */
  contribution: number
  default_contribution: number
}

/** Score and rank of a title, by default and with the user's weights; ranks start at 1. */
export interface ScoreComparison {
  default_score: number
  /** `null` when no weighted sub-score is left (e.g. only « événements » for an ETF). */
  custom_score: number | null
  /** custom − default, in points. */
  delta: number | null
  default_rank: number
  custom_rank: number | null
  /** default_rank − custom_rank: positive when the title moves up. */
  rank_change: number | null
  /** A sub-score is missing in the data (kept from the gold table). */
  partiel: boolean
}

export interface ReweightedRow extends ScoreComparison {
  symbol: string
  /** Date of the data, `YYYY-MM-DD`. */
  date: string
  comparison_set: string | null
  sub_scores: ReweightedSubScore[]
}

export interface ReweightResponse {
  /** Not `available`: `items` is empty and `message` says why (pipeline not run yet…). */
  status: ScoreTableStatus
  message: string | null
  generated_at: string | null
  applied: ScoringApplied
  /** Rows ranked (the whole table). */
  total: number
  /** Requested order with `tickers`, else best custom score first. */
  items: ReweightedRow[]
  /** Requested symbols the table does not hold. */
  missing: string[]
}

// --- POST /api/scores/simulate ----------------------------------------------------

export interface ScoreSimulationRequest extends ScoringChoice {
  ticker: string
}

export interface ScoreSimulationPoint {
  /** The slider's value (0 to 100, step 5), the other weights unchanged. */
  weight: number
  score: number | null
  rank: number | null
}

export interface ScoreSensitivity {
  id: SubScoreId
  label: string
  /** The sub-score's current weight (normalised), where the curve meets `custom_score`. */
  weight: number
  /** The title's value on this sub-score; `null` when missing or left out (flat curve). */
  sub_score: number | null
  points: ScoreSimulationPoint[]
}

export interface ScoreSimulation {
  status: ScoreTableStatus
  message: string | null
  symbol: string
  applied: ScoringApplied | null
  comparison: ScoreComparison | null
  total: number
  curves: ScoreSensitivity[]
}

// --- Helpers and hooks ------------------------------------------------------------

/** Weights scaled to sum to 100 (the server's normalisation); all zero stays all zero. */
export function normaliseWeights(weights: Partial<ScoreWeights>): ScoreWeights {
  const full = { ...DEFAULT_SCORE_WEIGHTS, ...weights }
  const total = SUB_SCORE_ORDER.reduce((sum, id) => sum + Math.max(0, full[id]), 0)
  return Object.fromEntries(
    SUB_SCORE_ORDER.map((id) => [id, total > 0 ? (Math.max(0, full[id]) / total) * 100 : 0]),
  ) as ScoreWeights
}

/** Same method as the gold table: default weights, no indicator left out. */
export function isDefaultScoring(choice: ScoringChoice | undefined): boolean {
  const weights = normaliseWeights(choice?.weights ?? {})
  const sameWeights = SUB_SCORE_ORDER.every((id) => Math.abs(weights[id] - DEFAULT_SCORE_WEIGHTS[id]) < 1e-6)
  return sameWeights && !(choice?.factors?.excluded_indicators ?? []).length
}

/** A stable body for a choice (sorted ids), so equal choices share a query key. */
export function scoringBody(choice: ScoringChoice | undefined): ScoringChoice {
  if (!choice || isDefaultScoring(choice)) return {}
  const excluded = [...(choice.factors?.excluded_indicators ?? [])].sort()
  return { weights: normaliseWeights(choice.weights ?? {}), factors: { excluded_indicators: excluded } }
}

export const SCORING_QUERY_KEYS = {
  all: ['scoring'] as const,
  reweight: (body: ReweightRequest) => [...SCORING_QUERY_KEYS.all, 'reweight', JSON.stringify(body)] as const,
  simulate: (body: ScoreSimulationRequest) =>
    [...SCORING_QUERY_KEYS.all, 'simulate', JSON.stringify(body)] as const,
}

const MINUTE = 60 * 1000

/** The gold table rescored with the user's choice; idle while `request` is null. */
export function useReweight(request: ReweightRequest | null) {
  const body: ReweightRequest | null = request
    ? { ...scoringBody(request), tickers: request.tickers, limit: request.limit }
    : null
  return useQuery<ReweightResponse, ApiError>({
    queryKey: SCORING_QUERY_KEYS.reweight(body ?? {}),
    queryFn: () =>
      apiClient.request<ReweightResponse>('/api/scores/reweight', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    enabled: body !== null,
    placeholderData: keepPreviousData,
    staleTime: 10 * MINUTE,
  })
}

/** One title's score along each weight's slider; idle without a title. */
export function useScoreSimulation(ticker: string | null, choice?: ScoringChoice) {
  const body: ScoreSimulationRequest = { ...scoringBody(choice), ticker: ticker ?? '' }
  return useQuery<ScoreSimulation, ApiError>({
    queryKey: SCORING_QUERY_KEYS.simulate(body),
    queryFn: () =>
      apiClient.request<ScoreSimulation>('/api/scores/simulate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    enabled: Boolean(ticker),
    placeholderData: keepPreviousData,
    staleTime: 10 * MINUTE,
  })
}
