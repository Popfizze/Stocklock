/**
 * The mixing desk's live reading: while a column is dragged, the followed title's score is read
 * off its sensitivity curve (POST /api/scores/simulate, 21 points per factor) instead of waiting
 * for the server to rescore the portfolio.
 */

import type { ScoreSensitivity, ScoreSimulation, ScoreWeights } from '@/api/scoring'
import type { SubScoreId } from '@/api/stocks'

export interface LiveReading {
  score: number
  rank: number | null
}

/**
 * The slider value that gives a factor the share `weight` (0-100, the desk's unit, where the six
 * always sum to 100). A curve moves one slider while the others stay as they were, then
 * normalises: a slider at `s` weighs `s / (s + rest)`, with `rest` the others' sum.
 */
export function sliderFor(weight: number, curve: ScoreSensitivity): number {
  const rest = 100 - curve.weight
  if (weight >= 100) return 100
  return Math.min(100, Math.max(0, (weight * rest) / (100 - weight)))
}

/** The curve read at a slider value, between its two nearest points; `null` off a curve with no score. */
export function readCurve(curve: ScoreSensitivity, slider: number): LiveReading | null {
  const points = curve.points.filter((point) => point.score !== null)
  if (points.length === 0) return null
  const after = points.findIndex((point) => point.weight >= slider)
  if (after === -1) return { score: points[points.length - 1].score ?? 0, rank: points[points.length - 1].rank }
  if (after === 0) return { score: points[0].score ?? 0, rank: points[0].rank }
  const low = points[after - 1]
  const high = points[after]
  const share = (slider - low.weight) / (high.weight - low.weight || 1)
  return {
    score: (low.score ?? 0) + ((high.score ?? 0) - (low.score ?? 0)) * share,
    // A rank is not interpolated: the nearest point's.
    rank: share < 0.5 ? low.rank : high.rank,
  }
}

/**
 * The followed title's score for the weights on the desk right now: read off the curve of the
 * factor being moved; without one (nothing moved yet), the server's own answer.
 */
export function liveReading(
  simulation: ScoreSimulation | undefined,
  moved: SubScoreId | null,
  weights: ScoreWeights,
): LiveReading | null {
  if (!simulation || simulation.status !== 'available' || !simulation.comparison) return null
  const settled = simulation.comparison
  const curve = moved === null ? undefined : simulation.curves.find((candidate) => candidate.id === moved)
  if (curve && moved !== null && Math.abs(weights[moved] - curve.weight) > 0.05) {
    const reading = readCurve(curve, sliderFor(weights[moved], curve))
    if (reading) return reading
  }
  return settled.custom_score === null ? null : { score: settled.custom_score, rank: settled.custom_rank }
}

/** A curve as the points of an SVG polyline in a `width` × `height` box (score 0-100 bottom to top). */
export function curvePath(curve: ScoreSensitivity, width: number, height: number): string {
  return curve.points
    .filter((point) => point.score !== null)
    .map((point) => `${((point.weight / 100) * width).toFixed(1)},${(height - ((point.score ?? 0) / 100) * height).toFixed(1)}`)
    .join(' ')
}
