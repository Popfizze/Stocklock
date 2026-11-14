/** Pure helpers of the 15-year simulator: field drafts to a projection request. */

import type { ProjectionRequest } from '@/api/accounts'

export interface SimulatorDraft {
  contribution: string
  years: string
  returnPct: string
  /** Empty: the profile's demo income. */
  income: string
  /** null: the profile's demo value. */
  firstHomeBuyer: boolean | null
}

export const DEFAULT_DRAFT: SimulatorDraft = {
  contribution: '7000',
  years: '15',
  returnPct: '5',
  income: '',
  firstHomeBuyer: null,
}

export type DraftErrors = Partial<Record<keyof SimulatorDraft, string>>

/** A number within [min, max], from French or English decimal text; null otherwise. */
export function parseNumber(text: string, min: number, max: number): number | null {
  const cleaned = text.replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < min || value > max) return null
  return value
}

/**
 * The request for `draft`. An invalid field gets an error and falls back to
 * its default, so the charts keep showing a meaningful projection.
 */
export function toProjectionRequest(
  personaId: string,
  draft: SimulatorDraft,
): { request: ProjectionRequest; errors: DraftErrors } {
  const errors: DraftErrors = {}

  const contribution = parseNumber(draft.contribution, 1, 1_000_000)
  if (contribution === null) errors.contribution = 'Entre 1 $ et 1 000 000 $.'

  const years = parseNumber(draft.years, 1, 50)
  const wholeYears = years !== null && Number.isInteger(years) ? years : null
  if (wholeYears === null) errors.years = 'Un nombre entier d’années, de 1 à 50.'

  const returnPct = parseNumber(draft.returnPct, -50, 50)
  if (returnPct === null) errors.returnPct = 'Entre -50 % et 50 %.'

  const income = draft.income.trim() === '' ? null : parseNumber(draft.income, 1, 10_000_000)
  if (draft.income.trim() !== '' && income === null) errors.income = 'Un revenu positif, en dollars.'

  const request: ProjectionRequest = {
    persona_id: personaId,
    annual_contribution: contribution ?? 7000,
    years: wholeYears ?? 15,
    expected_return: (returnPct ?? 5) / 100,
  }
  if (income !== null) request.income = income
  if (draft.firstHomeBuyer !== null) request.first_home_buyer = draft.firstHomeBuyer
  return { request, errors }
}
