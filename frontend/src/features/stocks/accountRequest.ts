import type { ProjectionRequest } from '@/api/accounts'
import { DEFAULT_DRAFT, toProjectionRequest } from '@/features/accounts/simulatorForm'

/** Pre-tax amount set aside each year in the stock page's account comparison. */
const ANNUAL_CONTRIBUTION = 7000
const YEARS = 15

/**
 * The projection behind « Quel compte ? » : the title's own for one of the
 * datathon's 31 assets (`ticker`), the profile's general one otherwise (the
 * account endpoint only knows those assets) — the same request as the Comptes
 * tab's, so both share one cached answer.
 */
export function stockAccountRequest(personaId: string, ticker: string | null): ProjectionRequest {
  if (ticker === null) return toProjectionRequest(personaId, DEFAULT_DRAFT).request
  return { persona_id: personaId, ticker, annual_contribution: ANNUAL_CONTRIBUTION, years: YEARS }
}
