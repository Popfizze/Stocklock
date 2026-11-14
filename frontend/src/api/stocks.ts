import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

/*
 * Market data of the Tableau de bord and the stock pages:
 * - the universe (SEC + TMX directories, fetched live) and its search;
 * - the dashboard's sections (Yahoo Finance screeners, or the score table);
 * - a stock's page (live Yahoo Finance prices, any title of the universe);
 * - a title's score, read from the gold table `score_par_titre`.
 */

// --- GET /api/universe/search?q=&limit= ---------------------------------------

export interface UniverseMatch {
  /** Yahoo Finance symbol, the stock page's address: `AAPL`, `BRK-B`, `RY.TO`, `ONE.V`. */
  ticker: string
  /** As the SEC or TMX directory writes it (SEC names are often upper case). */
  name: string
  /** `Nasdaq`, `NYSE`, `OTC`, `CBOE`, `TXSE`, `TSX` or `TSXV`. */
  exchange: string
  country: 'US' | 'CA'
}

export interface UniverseSearchResult {
  query: string
  /** Matches over the whole universe; `results` holds the best ones. */
  total: number
  results: UniverseMatch[]
}

// --- GET /api/market/sections[/{id}?limit=] -----------------------------------

export interface MarketSectionInfo {
  /** `populaires`, `meilleurs-scores`, `hausses`, `baisses`, `canada-populaires`, … */
  id: string
  title: string
  description: string
  source: string
}

/** A card of the Tableau de bord's grid. */
export interface StockCardData {
  ticker: string
  name: string
  exchange: string | null
  currency: string | null
  price: number | null
  change_abs: number | null
  /** Day change in percent (-2.01 means -2.01 %). */
  change_pct: number | null
  volume: number | null
  market_cap: number | null
  /** Date of the price, `YYYY-MM-DD`. */
  as_of: string | null
  /** Daily closes over the last month, oldest first; empty when unavailable. */
  sparkline: number[]
  /** Score 0-100 from the score table; `null` while not computed. */
  score: number | null
  score_partiel: boolean | null
}

export interface MarketSection extends MarketSectionInfo {
  /** `empty`: no card, and `message` says why (e.g. the score pipeline has not run yet). */
  status: 'ok' | 'empty'
  message: string | null
  as_of: string | null
  limit: number
  items: StockCardData[]
}

/** Most cards a section serves (`limit` query parameter, default 24). */
export const SECTION_MAX_LIMIT = 96

// --- GET /api/stocks/{ticker}?range= ------------------------------------------

export type StockRange = '1W' | '1M' | '3M' | '1Y' | 'MAX'

export interface PricePoint {
  date: string
  close: number
}

export interface Dividend {
  ex_date: string
  value: number
}

export interface StockStats {
  open: number
  high: number
  low: number
  volume: number
  avg_volume_3m: number | null
  high_52w: number
  low_52w: number
  /** Dividends of the last 12 months over the last close (0.0031 means 0.31 %); `null` without any. */
  dividend_yield_ttm: number | null
  /** Most recent first, at most 12. */
  dividends: Dividend[]
}

export interface DataSource {
  id: string
  title: string
  url: string | null
}

/** Identity of a title. */
export interface StockIdentity {
  /** Yahoo Finance symbol: `AAPL`, `RY.TO`, `BBD-B.TO`. */
  ticker: string
  name: string
  /** `equity`, `etf`, `crypto`, … (the starter kit's list also has `etf_equity`, `etf_bond`). */
  asset_class: string
  /** Exchange: `Nasdaq`, `NYSE`, `TSX`, `TSXV`, … */
  market: string
  currency: string
  /** Sector, or a French note when there is none (« Non applicable (FNB) », « Non disponible »). */
  sector: string
}

/** Last price and day change against the same title's previous close. */
export interface StockQuote {
  /** Last price (the session's close once it is over). */
  last_close: number
  change_abs: number
  /** Day change in percent (-4.34 means -4.34 %). */
  change_pct: number
  /** Date of the last price, `YYYY-MM-DD`. */
  as_of: string
}

export interface StockDetail extends StockIdentity, StockQuote {
  /** Listed in the SEC or TMX directory (a crypto of the starter kit is not). */
  in_universe: boolean
  /** One of the datathon's 31 assets: the account (step 3) and bias (step 4) analyses cover it. */
  starter_kit: boolean
  points: PricePoint[]
  stats: StockStats
  source: DataSource
}

// --- GET /api/scores/{ticker} : the gold table `score_par_titre` --------------

export type SubScoreId =
  | 'rentabilite'
  | 'solidite'
  | 'croissance'
  | 'valorisation'
  | 'momentum_risque'
  | 'evenements'

export interface ScoreIndicator {
  /** `roe`, `net_margin`, `debt_to_equity`, `interest_coverage`, `revenue_cagr_3y`, … */
  id: string
  label: string
  /** Raw value before capping; `null` when the data is missing. */
  value: number | null
  /** `ratio`: 0.31 is 31 %; `multiple`: 12.5 is 12,5×; `number`: shown as is. */
  unit: 'ratio' | 'multiple' | 'number'
  better: 'higher' | 'lower'
  /** Rank 0-100 in the comparison set. */
  rank: number | null
  note: string | null
}

export interface SubScore {
  id: SubScoreId
  label: string
  /** Nominal weight (0.25 is 25 %). */
  weight: number
  /** Weight after redistribution; 0 when the sub-score is missing. */
  effective_weight: number
  /** 0-100; `null` when missing (no statements for an ETF, missing data). */
  score: number | null
  /** score × effective_weight, in points of the final score. */
  contribution: number
  indicators: ScoreIndicator[]
}

export interface ScoreSource {
  id: string
  title: string
  url: string | null
  as_of: string | null
}

export interface ScoreRow {
  symbol: string
  /** Date of the data the score is computed on, `YYYY-MM-DD`. */
  date: string
  /** 0-100: the sum of the sub-scores' contributions. */
  score: number
  /** At least one sub-score is missing and its weight was redistributed. */
  partiel: boolean
  /** « Technologie, 48 titres » */
  comparison_set: string | null
  sub_scores: SubScore[]
  sources: ScoreSource[]
}

/**
 * `available`: `score` is set. `not_scored`: the table exists without this
 * title. `absent`: the score pipeline has not run yet. `unavailable`: the
 * table could not be read. Every status but `available` has a French `message`.
 */
export type ScoreStatus = 'available' | 'not_scored' | 'absent' | 'unavailable'

export interface StockScoreResponse {
  status: ScoreStatus
  message: string | null
  /** When the table was computed (ISO date-time). */
  generated_at: string | null
  score: ScoreRow | null
}

// --- Legacy: GET /api/stocks (the starter kit's 31 assets) --------------------

/** The first dashboard's row; the live grid uses `StockCardData` from the sections. */
export interface StockSummary extends StockIdentity, StockQuote {
  /** The last 30 closes, oldest first. */
  sparkline: number[]
}

// --- Hooks --------------------------------------------------------------------

export const STOCK_QUERY_KEYS = {
  all: ['stocks'] as const,
  list: () => [...STOCK_QUERY_KEYS.all, 'list'] as const,
  details: () => [...STOCK_QUERY_KEYS.all, 'detail'] as const,
  detail: (ticker: string, range: StockRange) =>
    [...STOCK_QUERY_KEYS.details(), ticker, range] as const,
  search: (query: string, limit: number) => [...STOCK_QUERY_KEYS.all, 'search', query, limit] as const,
  sections: () => [...STOCK_QUERY_KEYS.all, 'sections'] as const,
  section: (id: string, limit: number) => [...STOCK_QUERY_KEYS.sections(), id, limit] as const,
  score: (ticker: string) => [...STOCK_QUERY_KEYS.all, 'score', ticker] as const,
}

const MINUTE = 60 * 1000

/** Titles of the universe matching `query` (symbol or name); idle while the query is blank. */
export function useUniverseSearch(query: string, limit = 12) {
  const q = query.trim()
  return useQuery<UniverseSearchResult, ApiError>({
    queryKey: STOCK_QUERY_KEYS.search(q, limit),
    queryFn: () =>
      apiClient.request<UniverseSearchResult>(
        `/api/universe/search?q=${encodeURIComponent(q)}&limit=${limit}`,
      ),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60 * MINUTE,
  })
}

/** The Tableau de bord's sections, in display order (each one's cards load separately). */
export function useMarketSections() {
  return useQuery<MarketSectionInfo[], ApiError>({
    queryKey: STOCK_QUERY_KEYS.sections(),
    queryFn: () => apiClient.request<MarketSectionInfo[]>('/api/market/sections'),
    staleTime: Infinity,
  })
}

/** One section's cards; asking for more keeps the current cards on screen meanwhile. */
export function useMarketSection(id: string, limit = 24) {
  return useQuery<MarketSection, ApiError>({
    queryKey: STOCK_QUERY_KEYS.section(id, limit),
    queryFn: () =>
      apiClient.request<MarketSection>(
        `/api/market/sections/${encodeURIComponent(id)}?limit=${limit}`,
      ),
    placeholderData: keepPreviousData,
    // Live market data: the server caches screeners 5 minutes.
    staleTime: 5 * MINUTE,
  })
}

/** One title over `range`; the previous range stays on screen while the next one loads. */
export function useStock(ticker: string, range: StockRange) {
  return useQuery<StockDetail, ApiError>({
    queryKey: STOCK_QUERY_KEYS.detail(ticker, range),
    queryFn: () =>
      apiClient.request<StockDetail>(
        `/api/stocks/${encodeURIComponent(ticker)}?range=${range}`,
      ),
    placeholderData: (previous) => (previous?.ticker === ticker ? previous : undefined),
    // Live prices: the server caches a title's history 15 minutes.
    staleTime: 5 * MINUTE,
  })
}

/** A title's score from the gold table, or why there is none (`status`, `message`). */
export function useStockScore(ticker: string) {
  return useQuery<StockScoreResponse, ApiError>({
    queryKey: STOCK_QUERY_KEYS.score(ticker),
    queryFn: () =>
      apiClient.request<StockScoreResponse>(`/api/scores/${encodeURIComponent(ticker)}`),
    staleTime: 10 * MINUTE,
  })
}

/** Legacy: the starter kit's 31 assets at their last close (fixed data, never stale). */
export function useStocks() {
  return useQuery<StockSummary[], ApiError>({
    queryKey: STOCK_QUERY_KEYS.list(),
    queryFn: () => apiClient.request<StockSummary[]>('/api/stocks'),
    staleTime: Infinity,
  })
}
