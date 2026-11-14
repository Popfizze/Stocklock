import { useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

/** Identity of an asset of the starter kit, as `assets_universe.csv` lists it. */
export interface StockIdentity {
  ticker: string
  name: string
  asset_class: string
  market: string
  currency: string
  sector: string
}

/** Last close and day change against the same ticker's previous close. */
export interface StockQuote {
  last_close: number
  change_abs: number
  /** Day change in percent (-4.34 means -4.34 %). */
  change_pct: number
  /** Date of the last close, `YYYY-MM-DD`. */
  as_of: string
}

// --- GET /api/stocks ----------------------------------------------------------

export interface StockSummary extends StockIdentity, StockQuote {
  /** The last 30 closes, oldest first. */
  sparkline: number[]
}

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

export interface StockDetail extends StockIdentity, StockQuote {
  points: PricePoint[]
  stats: StockStats
}

// --- Hooks --------------------------------------------------------------------

export const STOCK_QUERY_KEYS = {
  all: ['stocks'] as const,
  list: () => [...STOCK_QUERY_KEYS.all, 'list'] as const,
  details: () => [...STOCK_QUERY_KEYS.all, 'detail'] as const,
  detail: (ticker: string, range: StockRange) =>
    [...STOCK_QUERY_KEYS.details(), ticker, range] as const,
}

/** The starter kit's prices are fixed for the datathon, so a result never goes stale. */
export function useStocks() {
  return useQuery<StockSummary[], ApiError>({
    queryKey: STOCK_QUERY_KEYS.list(),
    queryFn: () => apiClient.request<StockSummary[]>('/api/stocks'),
    staleTime: Infinity,
  })
}

/** One asset over `range`; the previous range stays on screen while the next one loads. */
export function useStock(ticker: string, range: StockRange) {
  return useQuery<StockDetail, ApiError>({
    queryKey: STOCK_QUERY_KEYS.detail(ticker, range),
    queryFn: () =>
      apiClient.request<StockDetail>(
        `/api/stocks/${encodeURIComponent(ticker)}?range=${range}`,
      ),
    placeholderData: (previous) => (previous?.ticker === ticker ? previous : undefined),
    staleTime: Infinity,
  })
}
