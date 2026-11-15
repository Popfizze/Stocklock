/**
 * The user's own score weights, per investor profile: the six sub-score
 * weights always sum to 100, are kept in localStorage, and start from
 * StockLock's defaults.
 */

import type { PortfolioAnalysis } from '@/api/persona'
import {
  DEFAULT_SCORE_WEIGHTS,
  SUB_SCORE_LABELS,
  SCORE_INDICATORS,
  SUB_SCORE_ORDER,
  type ScoreIndicatorId,
  type ScoreWeights,
  type ScoringChoice,
} from '@/api/scoring'
import type { SubScoreId } from '@/api/stocks'

const STORAGE_PREFIX = 'stocklock.scoreWeights.'

const round = (value: number) => Math.round(value * 10) / 10

/**
 * Sets one weight (0-100) and rescales the others in proportion, so the six
 * still sum to 100. When the others are all at zero they share what is left.
 */
export function setWeight(weights: ScoreWeights, id: SubScoreId, value: number): ScoreWeights {
  const next = Math.min(100, Math.max(0, value))
  const others = SUB_SCORE_ORDER.filter((other) => other !== id)
  const rest = 100 - next
  const sum = others.reduce((total, other) => total + weights[other], 0)
  const out = { ...weights, [id]: round(next) }
  for (const other of others) {
    out[other] = round(sum > 0 ? (weights[other] / sum) * rest : rest / others.length)
  }
  // Rounding can leave a tenth over or under: the largest other weight absorbs it.
  const drift = round(100 - SUB_SCORE_ORDER.reduce((total, key) => total + out[key], 0))
  if (drift !== 0) {
    const largest = [...others].sort((a, b) => out[b] - out[a])[0]
    out[largest] = round(Math.max(0, out[largest] + drift))
  }
  return out
}

/**
 * The six weights as whole percentages that still add up to 100 (largest remainder), for display:
 * rounding each one on its own could show 99 % or 101 % in total.
 */
export function displayWeights(weights: ScoreWeights): ScoreWeights {
  const total = SUB_SCORE_ORDER.reduce((sum, id) => sum + Math.max(0, weights[id]), 0)
  const scaled = SUB_SCORE_ORDER.map((id) => ({
    id,
    exact: total > 0 ? (Math.max(0, weights[id]) / total) * 100 : 100 / SUB_SCORE_ORDER.length,
  }))
  const out = { ...weights }
  for (const { id, exact } of scaled) out[id] = Math.floor(exact)
  let left = 100 - SUB_SCORE_ORDER.reduce((sum, id) => sum + out[id], 0)
  const byRemainder = [...scaled].sort((a, b) => (b.exact % 1) - (a.exact % 1))
  for (const { id } of byRemainder) {
    if (left <= 0) break
    out[id] += 1
    left -= 1
  }
  return out
}

export function isDefaultWeights(weights: ScoreWeights): boolean {
  return SUB_SCORE_ORDER.every((id) => Math.abs(weights[id] - DEFAULT_SCORE_WEIGHTS[id]) < 0.05)
}

/** What a profile chose for its own score: the six weights and the indicators it switched off. */
export interface ScoreSetup {
  weights: ScoreWeights
  excluded: ScoreIndicatorId[]
}

export const DEFAULT_SETUP: ScoreSetup = { weights: { ...DEFAULT_SCORE_WEIGHTS }, excluded: [] }

export function isDefaultSetup(setup: ScoreSetup): boolean {
  return isDefaultWeights(setup.weights) && setup.excluded.length === 0
}

/** The setup as the API takes it. */
export function toScoringChoice(setup: ScoreSetup): ScoringChoice {
  return { weights: setup.weights, factors: { excluded_indicators: setup.excluded } }
}

function isSetup(value: unknown): value is ScoreSetup {
  if (typeof value !== 'object' || value === null) return false
  const { weights, excluded } = value as { weights?: unknown; excluded?: unknown }
  if (typeof weights !== 'object' || weights === null || !Array.isArray(excluded)) return false
  const record = weights as Record<string, unknown>
  const known = new Set<string>(SCORE_INDICATORS.map((indicator) => indicator.id))
  return (
    SUB_SCORE_ORDER.every((id) => typeof record[id] === 'number' && Number.isFinite(record[id])) &&
    excluded.every((id) => typeof id === 'string' && known.has(id))
  )
}

/** The stored setup, else the defaults (nothing stored, storage blocked, or not ours). */
export function readScoreSetup(personaId: string): ScoreSetup {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + personaId) ?? 'null')
    return isSetup(parsed) ? parsed : { weights: { ...DEFAULT_SCORE_WEIGHTS }, excluded: [] }
  } catch {
    return { weights: { ...DEFAULT_SCORE_WEIGHTS }, excluded: [] }
  }
}

/** Never throws; storing the defaults forgets the profile's own setup. */
export function storeScoreSetup(personaId: string, setup: ScoreSetup): void {
  try {
    if (isDefaultSetup(setup)) window.localStorage.removeItem(STORAGE_PREFIX + personaId)
    else window.localStorage.setItem(STORAGE_PREFIX + personaId, JSON.stringify(setup))
  } catch {
    // Storage blocked.
  }
}

const SCORE = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 0 })

/**
 * One line on what the user's weights changed: the holding or suggestion whose
 * score moved most, and the sub-score the user values more than StockLock does.
 * `null` with the default setup, or when no score moved.
 */
export function explainChange(analysis: PortfolioAnalysis, setup: ScoreSetup): string | null {
  if (isDefaultSetup(setup)) return null
  const { weights } = setup
  const moved = [
    ...analysis.holdings.map((holding) => ({ ticker: holding.ticker, score: holding.score })),
    ...analysis.suggestions.items.map((item) => ({ ticker: item.ticker, score: item.ranking })),
  ]
    .filter((item) => item.score?.custom_score != null && item.score.delta != null)
    .sort((a, b) => Math.abs(b.score?.delta ?? 0) - Math.abs(a.score?.delta ?? 0))[0]
  if (!moved?.score || moved.score.custom_score == null || Math.abs(moved.score.delta ?? 0) < 0.5) return null

  const up = (moved.score.delta ?? 0) > 0
  // The sub-score whose weight the user raised (or cut) the most explains the direction.
  const shifted = [...SUB_SCORE_ORDER].sort(
    (a, b) =>
      (up ? 1 : -1) * (weights[b] - DEFAULT_SCORE_WEIGHTS[b] - (weights[a] - DEFAULT_SCORE_WEIGHTS[a])),
  )[0]
  const reason = `${SUB_SCORE_LABELS[shifted].toLowerCase()}`
  const verb = weights[shifted] >= DEFAULT_SCORE_WEIGHTS[shifted] ? 'valorisez davantage' : 'valorisez moins'
  return `${moved.ticker} passe de ${SCORE.format(moved.score.default_score)} à ${SCORE.format(moved.score.custom_score)} car vous ${verb} « ${reason} ».`
}
