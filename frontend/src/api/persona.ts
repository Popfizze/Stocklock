import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

/*
 * Decision support adapted to the active investor profile (Amira, Mateo, Robert):
 * - fit verdict of a title for a profile: GET /api/fit/{ticker}?persona= (stock page),
 *   POST /api/fit (up to 100 titles, for the dashboard's cards);
 * - hype signal « battage »: GET /api/hype/{ticker}, POST /api/hype;
 * - ESG risk and controversies: GET /api/esg/{ticker};
 * - portfolio analysis: POST /api/portfolio/analyze (no login: the client keeps the
 *   holdings in localStorage per profile and sends them; see `@/lib/example-portfolios`).
 *
 * Every ratio is a fraction (0.523 is 52,3 %) unless its comment says otherwise.
 */

// --- Hype signal « battage » ---------------------------------------------------

/** `faible`: 0-1 point, `modere`: 2 points, `eleve`: 3 points or more. */
export type HypeLevel = 'faible' | 'modere' | 'eleve'

export const HYPE_LEVEL_LABELS: Record<HypeLevel, string> = {
  faible: 'Faible',
  modere: 'Modéré',
  eleve: 'Élevé',
}

export type HypeComponentId = 'volume' | 'run_up' | 'news'

export interface HypeComponent {
  id: HypeComponentId
  /** « Volume échangé », « Hausse sur un mois », « Attention médiatique ». */
  label: string
  /** 0 normal, 1 notable, 2 strong; `null` when not evaluated (no data, or news in a batch). */
  points: 0 | 1 | 2 | null
  /**
   * `volume`: max(last volume, 10-day average) ÷ 3-month average (2.4 is 2,4×);
   * `run_up`: the stronger of the 1-month and 5-session returns, in units of its own σ (2.1 is 2,1 σ);
   * `news`: articles per day of the last 7 days ÷ the 83 before (GDELT), or of the last 2 days ÷ the
   *   rest of Yahoo's latest 50 headlines (fallback).
   */
  ratio: number | null
  /** French sentence with the numbers. */
  message: string
}

export interface HypeSignal {
  ticker: string
  level: HypeLevel
  /** Sum of the components' points (0-6). */
  points: number
  components: HypeComponent[]
  /** French sentences of the components that scored (empty when `faible` with 0 point). */
  reasons: string[]
  volume_last: number | null
  volume_avg_10d: number | null
  volume_avg_3m: number | null
  /** Return over the last month (0.18 is +18 %). */
  return_1m: number | null
  /** Annualised volatility over one year of daily closes. */
  volatility_1y: number | null
  /** `gdelt`: GDELT DOC 2.0 coverage; `yahoo`: Yahoo Finance headlines (fallback); `null`: not evaluated. */
  news_source: 'gdelt' | 'yahoo' | null
  /** Date of the last price used, `YYYY-MM-DD`. */
  as_of: string | null
}

export interface HypeBatch {
  items: HypeSignal[]
  /** Requested symbols Yahoo Finance has no data for. */
  missing: string[]
}

// --- ESG risk and controversies -------------------------------------------------

/** Sustainalytics risk categories (lower risk is better): <10, 10-20, 20-30, 30-40, ≥40. */
export type EsgRiskCategory = 'negligeable' | 'faible' | 'moyen' | 'eleve' | 'grave'

export interface EsgScores {
  /** ESG risk score band as Yahoo's screener knows it, e.g. 15 to 20 (5-point bands). */
  risk_low: number
  /** `null` for the open band (50 and more). */
  risk_high: number | null
  risk_category: EsgRiskCategory
  /** « Risque ESG faible (15 à 20) ». */
  risk_label: string
  /** Highest controversy level: 0 none, 1 low, 2 moderate, 3 significant, 4 high, 5 severe; `null` if unknown. */
  controversy_level: number | null
  /** « Controverse de niveau 4 sur 5 (élevée) »; `null` if unknown. */
  controversy_label: string | null
  /** Exact Sustainalytics total when Yahoo's quoteSummary still serves it (rare); else `null`. */
  total_esg: number | null
  /** Product involvement flags (« Armes controversées », « Tabac »…) when Yahoo serves them; often empty. */
  involvement: string[]
  source: string
}

export interface EsgControversyEvent {
  title: string
  /** `YYYY-MM-DD`. */
  date: string
  url: string | null
  publisher: string | null
  /** The controversy keyword found in the headline (« lawsuit », « fine », « recall »…). */
  keyword: string
}

export interface SourceRef { id: string; title: string; url: string | null }

export interface EsgReport {
  ticker: string
  /** `null` when Yahoo has no ESG data (ETF, crypto, many small caps): `message` says so. */
  esg: EsgScores | null
  message: string | null
  /** Recent controversy-type headlines (Yahoo Finance news, keyword match); empty when none. */
  events: EsgControversyEvent[]
  sources: SourceRef[]
}

// --- Fit verdict ------------------------------------------------------------------

export type FitVerdict = 'compatible' | 'a_surveiller' | 'hors_profil'

export const FIT_VERDICT_LABELS: Record<FitVerdict, string> = {
  compatible: 'Compatible',
  a_surveiller: 'À surveiller',
  hors_profil: 'Hors profil',
}

/** `bloquant` makes the verdict `hors_profil`, `attention` makes it `a_surveiller`. */
export type FitSeverity = 'ok' | 'info' | 'attention' | 'bloquant'

export type FitRuleId =
  | 'volatility'
  | 'crypto'
  | 'sector'
  | 'excluded_ticker'
  | 'position'
  | 'esg_controversy'
  | 'esg_risk'
  | 'esg_unknown'
  | 'hype'
  | 'data'

export interface FitReason {
  rule: FitRuleId
  severity: FitSeverity
  /** Short French sentence with its numbers. */
  message: string
  /** Measured value (a volatility, a controversy level 0-5, an ESG band's low end…); `null` if none. */
  value: number | null
  /** The profile's limit `value` is compared with; `null` for rules without a number. */
  limit: number | null
}

export interface FitResult {
  ticker: string
  name: string
  persona_id: string
  verdict: FitVerdict
  /** One French sentence: « Hors profil pour Robert : volatilité trop élevée. » */
  summary: string
  /** Blocking reasons first, then attention, info, ok. */
  reasons: FitReason[]
  /** `equity`, `etf`, `crypto`, `fund`, … */
  asset_class: string
  /** Yahoo sector (`Technology`, `Energy`…); `null` for ETFs, cryptos and unknown. */
  sector: string | null
  volatility_1y: number | null
  return_1m: number | null
  /** The profile's limits. */
  max_volatility: number
  max_position: number
  hype: HypeSignal | null
  esg: EsgScores | null
}

export interface FitBatchRequest {
  persona_id: string
  /** At most 100 Yahoo symbols. */
  tickers: string[]
}

export interface FitBatch {
  persona_id: string
  /** In the requested order; news attention is not evaluated in a batch (cached only). */
  items: FitResult[]
  missing: string[]
}

// --- Portfolio analysis -----------------------------------------------------------

export interface PortfolioHolding {
  ticker: string
  /** Any positive amount: weights are normalised to sum to 1 (send %, $ or fractions). */
  weight: number
}

export interface PortfolioAnalyzeRequest {
  persona_id: string
  /** At most 40 holdings. */
  holdings: PortfolioHolding[]
}

export interface WeightBucket {
  /** Raw key: a sector, `equity`/`etf`/`crypto`, `US`/`CA`/`none`. */
  key: string
  /** French label: « Technologie », « Actions », « États-Unis », « Non classé ». */
  label: string
  weight: number
}

/** `over_max`: above the profile's maximum position. */
export interface PositionCheck { ticker: string; weight: number; over_max: boolean }

export interface Diversification {
  by_sector: WeightBucket[]
  by_asset_class: WeightBucket[]
  by_country: WeightBucket[]
  /** The three largest positions, largest first. */
  largest: PositionCheck[]
  max_position: number
  positions_over_max: string[]
  /** Σ weight × volatility (ignores correlations: an upper bound). */
  weighted_volatility: number | null
  /** From the covariance of one year of daily returns; `null` with too little common history. */
  portfolio_volatility: number | null
  max_volatility: number
  /** Herfindahl index Σ weight² (1 = a single title). */
  hhi: number
  /** 1 ÷ hhi: the number of equal positions with the same concentration. */
  effective_positions: number
  concentration: 'faible' | 'moderee' | 'elevee'
}

export interface AnalyzedHolding {
  ticker: string
  name: string
  /** Normalised weight. */
  weight: number
  asset_class: string
  sector: string | null
  country: 'US' | 'CA' | null
  volatility_1y: number | null
  over_max_position: boolean
  fit: FitResult
}

export interface PortfolioFinding { severity: FitSeverity; message: string }

export interface PortfolioSuggestion {
  ticker: string
  name: string
  sector: string | null
  asset_class: string
  /** StockLock score 0-100 from the gold table; `null` in the fallback (sections). */
  score: number | null
  verdict: FitVerdict
  /** French sentences: why it fits the profile and how it improves diversification. */
  reasons: string[]
}

export interface PortfolioSuggestions {
  /** `score_table`: best scores of `score_par_titre`; `sections`: the profile's sections (fallback). */
  source: 'score_table' | 'sections'
  /** French note, e.g. why the score table was not used. */
  message: string | null
  items: PortfolioSuggestion[]
}

export interface PortfolioAnalysis {
  persona_id: string
  /** Sum of the weights as sent, before normalisation. */
  total_input_weight: number
  holdings: AnalyzedHolding[]
  /** Symbols Yahoo Finance has no data for (left out of the analysis). */
  missing: string[]
  diversification: Diversification
  findings: PortfolioFinding[]
  suggestions: PortfolioSuggestions
}

// --- Hooks --------------------------------------------------------------------------

export const PROFILE_QUERY_KEYS = {
  all: ['profile-fit'] as const,
  fit: (ticker: string, personaId: string) => [...PROFILE_QUERY_KEYS.all, 'fit', ticker, personaId] as const,
  fitBatch: (personaId: string, tickers: string[]) =>
    [...PROFILE_QUERY_KEYS.all, 'fit-batch', personaId, tickers.join(',')] as const,
  hype: (ticker: string) => [...PROFILE_QUERY_KEYS.all, 'hype', ticker] as const,
  hypeBatch: (tickers: string[]) => [...PROFILE_QUERY_KEYS.all, 'hype-batch', tickers.join(',')] as const,
  esg: (ticker: string) => [...PROFILE_QUERY_KEYS.all, 'esg', ticker] as const,
  portfolio: (personaId: string, holdings: PortfolioHolding[]) =>
    [...PROFILE_QUERY_KEYS.all, 'portfolio', personaId, JSON.stringify(holdings)] as const,
}

const MINUTE = 60 * 1000

/** Unique, trimmed, upper-case symbols, at most 100 (the batch endpoints' limit). */
export function batchTickers(tickers: string[]): string[] {
  return [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))].slice(0, 100)
}

/** Fit of one title for a profile (stock page): verdict, reasons, hype and ESG in one call. */
export function useFit(ticker: string, personaId: string | null) {
  return useQuery<FitResult, ApiError>({
    queryKey: PROFILE_QUERY_KEYS.fit(ticker, personaId ?? ''),
    queryFn: () =>
      apiClient.request<FitResult>(
        `/api/fit/${encodeURIComponent(ticker)}?persona=${encodeURIComponent(personaId ?? '')}`,
      ),
    enabled: Boolean(ticker && personaId),
    staleTime: 10 * MINUTE,
  })
}

/** Fit of many titles (dashboard cards); idle without a profile or titles. */
export function useFitBatch(personaId: string | null, tickers: string[]) {
  const symbols = batchTickers(tickers)
  return useQuery<FitBatch, ApiError>({
    queryKey: PROFILE_QUERY_KEYS.fitBatch(personaId ?? '', symbols),
    queryFn: () =>
      apiClient.request<FitBatch>('/api/fit', {
        method: 'POST',
        body: JSON.stringify({ persona_id: personaId ?? '', tickers: symbols } satisfies FitBatchRequest),
      }),
    enabled: Boolean(personaId) && symbols.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10 * MINUTE,
  })
}

/** The fit results of a batch by symbol, for a card grid. */
export function fitByTicker(batch: FitBatch | undefined): Record<string, FitResult> {
  return Object.fromEntries((batch?.items ?? []).map((item) => [item.ticker, item]))
}

/** Hype signal of one title, with news attention (GDELT, or Yahoo headlines as a fallback). */
export function useHype(ticker: string) {
  return useQuery<HypeSignal, ApiError>({
    queryKey: PROFILE_QUERY_KEYS.hype(ticker),
    queryFn: () => apiClient.request<HypeSignal>(`/api/hype/${encodeURIComponent(ticker)}`),
    enabled: Boolean(ticker),
    staleTime: 10 * MINUTE,
  })
}

/** Hype signals of many titles (price and volume; news only when already cached). */
export function useHypeBatch(tickers: string[]) {
  const symbols = batchTickers(tickers)
  return useQuery<HypeBatch, ApiError>({
    queryKey: PROFILE_QUERY_KEYS.hypeBatch(symbols),
    queryFn: () =>
      apiClient.request<HypeBatch>('/api/hype', {
        method: 'POST',
        body: JSON.stringify({ tickers: symbols }),
      }),
    enabled: symbols.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10 * MINUTE,
  })
}

/** ESG risk band, controversy level and recent controversy headlines of a title. */
export function useEsg(ticker: string) {
  return useQuery<EsgReport, ApiError>({
    queryKey: PROFILE_QUERY_KEYS.esg(ticker),
    queryFn: () => apiClient.request<EsgReport>(`/api/esg/${encodeURIComponent(ticker)}`),
    enabled: Boolean(ticker),
    staleTime: 60 * MINUTE,
  })
}

/**
 * Analysis of the holdings the client keeps for a profile; idle without a profile or
 * holdings, and the previous analysis stays on screen while the next one loads.
 */
export function usePortfolioAnalysis(personaId: string | null, holdings: PortfolioHolding[]) {
  const kept = holdings.filter((h) => h.ticker.trim() && h.weight > 0)
  return useQuery<PortfolioAnalysis, ApiError>({
    queryKey: PROFILE_QUERY_KEYS.portfolio(personaId ?? '', kept),
    queryFn: () =>
      apiClient.request<PortfolioAnalysis>('/api/portfolio/analyze', {
        method: 'POST',
        body: JSON.stringify({ persona_id: personaId ?? '', holdings: kept } satisfies PortfolioAnalyzeRequest),
      }),
    enabled: Boolean(personaId) && kept.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10 * MINUTE,
  })
}
