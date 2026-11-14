import { describe, expect, it } from 'vitest'
import { DEFAULT_DRAFT, parseNumber, toProjectionRequest } from './simulatorForm'

describe('parseNumber', () => {
  it('reads French and English decimals and spaces', () => {
    expect(parseNumber('62 000', 0, 1e7)).toBe(62000)
    expect(parseNumber('4,5', -50, 50)).toBe(4.5)
    expect(parseNumber('4.5', -50, 50)).toBe(4.5)
  })

  it('rejects empty, non-numeric and out-of-range text', () => {
    expect(parseNumber('', 0, 10)).toBeNull()
    expect(parseNumber('abc', 0, 10)).toBeNull()
    expect(parseNumber('11', 0, 10)).toBeNull()
  })
})

describe('toProjectionRequest', () => {
  it('sends the defaults and leaves the profile’s income and first-home answer to the server', () => {
    const { request, errors } = toProjectionRequest('amira', DEFAULT_DRAFT)
    expect(request).toEqual({ persona_id: 'amira', annual_contribution: 7000, years: 15, expected_return: 0.05 })
    expect(errors).toEqual({})
  })

  it('sends the overrides, as numbers', () => {
    const { request } = toProjectionRequest('robert', {
      contribution: '10 000',
      years: '20',
      returnPct: '6,3',
      income: '110000',
      firstHomeBuyer: false,
    })
    expect(request).toEqual({
      persona_id: 'robert',
      annual_contribution: 10000,
      years: 20,
      expected_return: 0.063,
      income: 110000,
      first_home_buyer: false,
    })
  })

  it('flags invalid fields and falls back to the defaults', () => {
    const { request, errors } = toProjectionRequest('amira', {
      ...DEFAULT_DRAFT,
      contribution: '0',
      years: '7.5',
      returnPct: '80',
      income: '-3',
    })
    expect(request).toEqual({ persona_id: 'amira', annual_contribution: 7000, years: 15, expected_return: 0.05 })
    expect(Object.keys(errors).sort()).toEqual(['contribution', 'income', 'returnPct', 'years'])
  })
})
