import { describe, expect, it } from 'vitest'
import { DEFAULT_SCORE_WEIGHTS, SUB_SCORE_ORDER, type ScoreWeights } from '@/api/scoring'
import { PORTFOLIO_ROBERT } from '@/test/persona'
import { PORTFOLIO_ROBERT_CUSTOM, WEIGHTS_ROBERT } from '@/test/scoring'
import {
  DEFAULT_SETUP,
  explainChange,
  isDefaultSetup,
  readScoreSetup,
  setWeight,
  storeScoreSetup,
  toScoringChoice,
  type ScoreSetup,
} from './scoreWeights'

const sum = (weights: ScoreWeights) => SUB_SCORE_ORDER.reduce((total, id) => total + weights[id], 0)

describe('scoreWeights', () => {
  it('raises one weight and rescales the others in proportion, still summing to 100', () => {
    const next = setWeight(DEFAULT_SCORE_WEIGHTS, 'croissance', 40)

    expect(next.croissance).toBe(40)
    expect(sum(next)).toBeCloseTo(100, 5)
    // The others keep their order of importance.
    expect(next.rentabilite).toBeGreaterThan(next.solidite)
    expect(next.solidite).toBeGreaterThan(next.evenements)
    expect(next.rentabilite).toBeLessThan(DEFAULT_SCORE_WEIGHTS.rentabilite)
  })

  it('clamps a weight between 0 and 100', () => {
    const all = setWeight(DEFAULT_SCORE_WEIGHTS, 'solidite', 140)
    expect(all.solidite).toBe(100)
    expect(sum(all)).toBeCloseTo(100, 5)
    expect(all.rentabilite).toBe(0)

    const none = setWeight(DEFAULT_SCORE_WEIGHTS, 'solidite', -5)
    expect(none.solidite).toBe(0)
    expect(sum(none)).toBeCloseTo(100, 5)
  })

  it('shares what is left equally when the other weights are all at zero', () => {
    const only = setWeight(DEFAULT_SCORE_WEIGHTS, 'valorisation', 100)
    const back = setWeight(only, 'valorisation', 50)

    expect(back.valorisation).toBe(50)
    expect(back.rentabilite).toBe(10)
    expect(sum(back)).toBeCloseTo(100, 5)
  })

  it('keeps a profile’s setup in storage and forgets it when it is the default again', () => {
    const custom: ScoreSetup = { weights: setWeight(DEFAULT_SCORE_WEIGHTS, 'croissance', 40), excluded: ['pe'] }
    storeScoreSetup('amira', custom)

    expect(readScoreSetup('amira')).toEqual(custom)
    expect(readScoreSetup('robert')).toEqual(DEFAULT_SETUP)
    expect(toScoringChoice(custom)).toEqual({ weights: custom.weights, factors: { excluded_indicators: ['pe'] } })

    storeScoreSetup('amira', { weights: { ...DEFAULT_SCORE_WEIGHTS }, excluded: [] })
    expect(window.localStorage.getItem('stocklock.scoreWeights.amira')).toBeNull()
    expect(isDefaultSetup(readScoreSetup('amira'))).toBe(true)
  })

  it('ignores stored content that is not a setup', () => {
    window.localStorage.setItem('stocklock.scoreWeights.mateo', '{"weights":{"rentabilite":"beaucoup"},"excluded":[]}')
    expect(readScoreSetup('mateo')).toEqual(DEFAULT_SETUP)
    window.localStorage.setItem('stocklock.scoreWeights.mateo', 'pas du json')
    expect(readScoreSetup('mateo')).toEqual(DEFAULT_SETUP)
  })

  it('says in one line what the user’s weights changed', () => {
    const setup: ScoreSetup = {
      weights: { ...DEFAULT_SCORE_WEIGHTS, ...WEIGHTS_ROBERT.weights },
      excluded: ['momentum_12_1'],
    }

    // UNP moves most (+5,5): Robert values solidity more than StockLock does.
    expect(explainChange(PORTFOLIO_ROBERT_CUSTOM, setup)).toBe(
      'UNP passe de 69 à 75 car vous valorisez davantage « solidité financière ».',
    )
    // Nothing to say with the default setup, or when no score moved.
    expect(explainChange(PORTFOLIO_ROBERT_CUSTOM, DEFAULT_SETUP)).toBeNull()
    expect(explainChange(PORTFOLIO_ROBERT, setup)).toBeNull()
  })
})
