import { describe, expect, it } from 'vitest'
import type { ScoreSensitivity, ScoreSimulation } from '@/api/scoring'
import { DEFAULT_SCORE_WEIGHTS } from '@/api/scoring'
import { liveReading, readCurve, sliderFor } from './mixerLive'

/** A title at 80 on growth and 50 on everything else, growth weighing 15 % today: score 54,5. */
const curve: ScoreSensitivity = {
  id: 'croissance',
  label: 'Croissance',
  weight: 15,
  sub_score: 80,
  points: Array.from({ length: 21 }, (_, step) => {
    const slider = step * 5
    const share = slider / (slider + 85)
    return { weight: slider, score: 50 + 30 * share, rank: 40 - step }
  }),
}

const simulation: ScoreSimulation = {
  status: 'available',
  message: null,
  symbol: 'AAPL',
  applied: null,
  comparison: { default_score: 54.5, custom_score: 54.5, delta: 0, default_rank: 37, custom_rank: 37, rank_change: 0, partiel: false },
  total: 200,
  curves: [curve],
}

describe('mixerLive', () => {
  it('turns a share of the desk into the slider value of the curve', () => {
    // Unmoved: the slider is the weight itself.
    expect(sliderFor(15, curve)).toBeCloseTo(15)
    // 50 % of the score while the others kept their 85 points: a slider at 85.
    expect(sliderFor(50, curve)).toBeCloseTo(85)
    expect(sliderFor(0, curve)).toBe(0)
    expect(sliderFor(100, curve)).toBe(100)
  })

  it('reads a curve between two of its points', () => {
    expect(readCurve(curve, 15)?.score).toBeCloseTo(54.5)
    const between = readCurve(curve, 87.5)
    expect(between?.score).toBeGreaterThan(readCurve(curve, 85)?.score ?? 0)
    expect(between?.score).toBeLessThan(readCurve(curve, 90)?.score ?? 100)
    expect(readCurve({ ...curve, points: curve.points.map((point) => ({ ...point, score: null })) }, 20)).toBeNull()
  })

  it('follows the column being moved at once, and the server everywhere else', () => {
    // Nothing moved yet: the server's own answer.
    expect(liveReading(simulation, null, DEFAULT_SCORE_WEIGHTS)).toEqual({ score: 54.5, rank: 37 })
    // Growth dragged to 50 %: half of 80 and half of 50, read off the curve before any request.
    const moved = liveReading(simulation, 'croissance', { ...DEFAULT_SCORE_WEIGHTS, croissance: 50 })
    expect(moved?.score).toBeCloseTo(65, 0)
    // A factor without a curve, or a table that is not there: nothing invented.
    expect(liveReading(simulation, 'solidite', { ...DEFAULT_SCORE_WEIGHTS, solidite: 40 })).toEqual({ score: 54.5, rank: 37 })
    expect(liveReading({ ...simulation, status: 'absent', comparison: null }, 'croissance', DEFAULT_SCORE_WEIGHTS)).toBeNull()
    expect(liveReading(undefined, null, DEFAULT_SCORE_WEIGHTS)).toBeNull()
  })
})
