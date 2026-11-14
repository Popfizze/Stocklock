import { describe, expect, it } from 'vitest'
import { LAB_CATALOG } from '@/test/lab'
import {
  changedOptionLabels,
  formatDuration,
  initialInputDraft,
  initialOptionValues,
  runErrorMessage,
  toRequestInputs,
} from './labForm'

const score = LAB_CATALOG.steps[0]

describe('labForm', () => {
  it('fills the fields from the input defaults and converts them back for the request', () => {
    const draft = initialInputDraft(score.inputs)
    expect(draft).toEqual({
      ticker: 'SHOP.TO',
      peers: 'RY.TO, TD.TO',
      as_of: '2026-11-13',
      amount: '1000',
      include_esg: false,
    })

    expect(
      toRequestInputs(score.inputs, { ...draft, peers: ' bce.to;  t.to ,', amount: '', include_esg: true }),
    ).toEqual({
      ticker: 'SHOP.TO',
      peers: ['BCE.TO', 'T.TO'],
      as_of: '2026-11-13',
      amount: null,
      include_esg: true,
    })
  })

  it('starts each option at lab_default, else default, and lists those that differ from default', () => {
    const values = initialOptionValues(score.stages)
    expect(values).toEqual({ 'fetch.window': '1y', 'scoring.method': 'rank' })
    expect(changedOptionLabels(score.stages, values)).toEqual(['Notation · Méthode : Rangs'])
    expect(
      changedOptionLabels(score.stages, { 'fetch.window': '1y', 'scoring.method': 'zscore' }),
    ).toEqual([])
  })

  it('formats durations in French', () => {
    expect(formatDuration(80)).toBe('80 ms')
    expect(formatDuration(1530)).toBe('1,5 s')
  })

  it('explains a failed run', () => {
    expect(runErrorMessage({ status: 422, message: 'x', details: { detail: 'Ticker inconnu' } })).toBe(
      'Entrée invalide : Ticker inconnu',
    )
    expect(runErrorMessage({ status: 0, message: 'Failed to fetch' })).toMatch(
      /^Impossible de joindre le serveur/,
    )
    expect(runErrorMessage({ status: 500, message: 'Request failed', details: 'oops' })).toBe(
      "L'exécution a échoué (erreur 500)",
    )
  })
})
