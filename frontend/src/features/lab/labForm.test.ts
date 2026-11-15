import { describe, expect, it } from 'vitest'
import { LAB_CATALOG } from '@/test/lab'
import { formatValue, initialOptionValues, runErrorMessage } from './labForm'

const score = LAB_CATALOG.steps[0]

describe('labForm', () => {
  it('starts each option at lab_default, else default', () => {
    const values = initialOptionValues(score.stages)
    expect(values).toEqual({ 'fetch.window': '1y', 'scoring.method': 'rank' })
  })

  it('shortens long decimals read from text files, and leaves other text alone', () => {
    expect(formatValue('115.29000091552734')).toBe('115,29')
    expect(formatValue('2026-11-14')).toBe('2026-11-14')
    expect(formatValue('0000320193')).toBe('0000320193')
    expect(formatValue('1.5')).toBe('1.5')
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
