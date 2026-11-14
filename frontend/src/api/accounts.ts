import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'
import type { LabSource } from './lab'

/** The four accounts, keyed as the API keys them. */
export type AccountId = 'CELI' | 'REER' | 'CELIAPP' | 'Non enregistré'

export const ACCOUNT_IDS: AccountId[] = ['CELI', 'REER', 'CELIAPP', 'Non enregistré']

export type TaxSource = LabSource

// --- GET /api/accounts/rules --------------------------------------------------

/** The versioned 2026 tax rules and the long-term return assumptions. */
export interface TaxRules {
  year: number
  jurisdiction: string
  sources: TaxSource[]
  tfsa: { eligibility_age: number; annual_limits: Record<string, number>; source_id: string }
  rrsp: { rate_of_earned_income: number; dollar_limit: number; source_id: string }
  fhsa: {
    annual_limit: number
    lifetime_limit: number
    max_participation_years: number
    max_age: number
    source_id: string
  }
  capital_gains: { inclusion_rate: number; source_id: string }
  eligible_dividends: {
    gross_up: number
    federal_credit_rate: number
    quebec_credit_rate: number
    source_ids: string[]
  }
  us_dividend_withholding: { rate: number; exempt_accounts: string[]; source_id: string }
  rrsp_maturity: { max_age: number; source_id: string }
  home_buyers_plan: { withdrawal_limit: number; repayment_years: number; source_id: string }
  tfsa_total_since_2009: number
  projection_returns: Record<string, number>
  projection_source_id: string
}

// --- GET /api/accounts/assets -------------------------------------------------

export interface AssetSummary {
  ticker: string
  name: string
  asset_class: string
  currency: string
  sector: string
}

// --- POST /api/accounts/projection --------------------------------------------

export interface ProjectionRequest {
  persona_id: string
  ticker?: string
  annual_contribution?: number
  years?: number
  /** Total annual return, e.g. 0.05; default: the asset's assumption. */
  expected_return?: number
  income?: number
  retirement_income?: number
  first_home_buyer?: boolean
}

export interface TaxProfile {
  persona_id: string
  name: string
  age: number
  horizon: string
  horizon_years: [number, number]
  risk_tolerance: string
  income: number
  retirement_income: number
  first_home_buyer: boolean
  rate_now: number
  rate_retirement: number
  rate_federal: number
  rate_quebec: number
  eligible_dividend_rate: number
  tfsa_room: number
  rrsp_room: number
  fhsa_eligible: boolean
  fhsa_years: number
  fhsa_reason: string
  demo_assumptions: string[]
}

export type IncomeType = 'growth' | 'cad_dividend' | 'foreign_dividend' | 'interest' | 'none'

export interface AssetProfile {
  ticker: string
  name: string
  asset_class: string
  currency: string
  market: string
  sector: string
  income_type: IncomeType
  income_label: string
  dividend_yield: number
  us_withholding: boolean
  hist_return: number | null
  hist_volatility: number | null
  hist_period: string
  expected_return: number
  expected_return_basis: string
}

export interface AccountOutcome {
  account: AccountId
  eligible: boolean
  deposits: number
  side_deposits: number
  gross_value: number
  tax_at_exit: number
  after_tax: number
  annual_tax_paid: number
  withholding_lost: number
  notes: string[]
  after_tax_low: number | null
  after_tax_high: number | null
}

/** After-tax value if everything were withdrawn at the end of `year`; `null` when not eligible. */
export type SeriesPoint = { year: number } & Record<AccountId, number | null>

export type Verdict = 'best' | 'close' | 'behind' | 'ineligible'

export interface AccountAdvice {
  account: AccountId
  rank: number | null
  verdict: Verdict
  verdict_label: string
  summary: string
  pros: string[]
  cons: string[]
}

export interface AccountProjection {
  profile: TaxProfile
  asset: AssetProfile | null
  inputs: {
    annual_contribution: number
    years: number
    total_return: number
    price_return: number
    dividend_yield: number
    distribution_rate: number
    scenario_spread: number
  }
  series: SeriesPoint[]
  accounts: AccountOutcome[]
  ranking: Array<{ account: AccountId; after_tax: number }>
  recommendations: { headline: string; accounts: AccountAdvice[] }
  profile_flags: string[]
  assumptions: string[]
  limits: string[]
  sources: TaxSource[]
}

// --- Hooks --------------------------------------------------------------------

export const ACCOUNT_QUERY_KEYS = {
  all: ['accounts'] as const,
  rules: () => [...ACCOUNT_QUERY_KEYS.all, 'rules'] as const,
  assets: () => [...ACCOUNT_QUERY_KEYS.all, 'assets'] as const,
  projections: () => [...ACCOUNT_QUERY_KEYS.all, 'projection'] as const,
  projection: (request: ProjectionRequest) =>
    [...ACCOUNT_QUERY_KEYS.projections(), request] as const,
}

/** The 2026 rules. Versioned server-side, so fetched once. */
export function useAccountRules() {
  return useQuery<TaxRules, ApiError>({
    queryKey: ACCOUNT_QUERY_KEYS.rules(),
    queryFn: () => apiClient.request<TaxRules>('/api/accounts/rules'),
    staleTime: Infinity,
  })
}

/** The starter kit's 31 assets. Fixed, so fetched once. */
export function useAssets() {
  return useQuery<AssetSummary[], ApiError>({
    queryKey: ACCOUNT_QUERY_KEYS.assets(),
    queryFn: () => apiClient.request<AssetSummary[]>('/api/accounts/assets'),
    staleTime: Infinity,
  })
}

/**
 * The per-account projection. A pure computation (POST only to carry the
 * inputs), so it is a query keyed by its inputs; the previous result stays
 * on screen while a new one is computed. `null` waits for a profile.
 */
export function useAccountProjection(request: ProjectionRequest | null) {
  return useQuery<AccountProjection, ApiError>({
    queryKey: ACCOUNT_QUERY_KEYS.projection(request ?? { persona_id: '' }),
    queryFn: () =>
      apiClient.request<AccountProjection>('/api/accounts/projection', {
        method: 'POST',
        body: JSON.stringify(request),
      }),
    enabled: request !== null,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  })
}
