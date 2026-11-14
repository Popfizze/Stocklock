import type { StockDetail, StockSummary } from '@/api/stocks'

const sparkline = (from: number, to: number) =>
  Array.from({ length: 30 }, (_, i) => from + ((to - from) * i) / 29)

/** One asset per section of the Tableau de bord, plus a second Canadian one. */
export const STOCKS: StockSummary[] = [
  {
    ticker: 'RY.TO',
    name: 'Royal Bank of Canada',
    asset_class: 'equity',
    market: 'TSX',
    currency: 'CAD',
    sector: 'Financials',
    last_close: 289.39,
    change_abs: -0.61,
    change_pct: -0.2103,
    as_of: '2026-11-12',
    sparkline: sparkline(277.86, 289.39),
  },
  {
    ticker: 'SHOP.TO',
    name: 'Shopify',
    asset_class: 'equity',
    market: 'TSX',
    currency: 'CAD',
    sector: 'Information Technology',
    last_close: 1234.5,
    change_abs: 12.25,
    change_pct: 1.0024,
    as_of: '2026-11-12',
    sparkline: sparkline(1250, 1234.5),
  },
  {
    ticker: 'NVDA',
    name: 'NVIDIA',
    asset_class: 'equity',
    market: 'NASDAQ',
    currency: 'USD',
    sector: 'Information Technology',
    last_close: 166.19,
    change_abs: -7.54,
    change_pct: -4.3401,
    as_of: '2026-11-12',
    sparkline: sparkline(190, 166.19),
  },
  {
    ticker: 'XIU.TO',
    name: 'iShares S&P/TSX 60 Index ETF',
    asset_class: 'etf_equity',
    market: 'TSX',
    currency: 'CAD',
    sector: 'Broad market (Canada)',
    last_close: 42.1,
    change_abs: 0.2,
    change_pct: 0.4773,
    as_of: '2026-11-12',
    sparkline: sparkline(40, 42.1),
  },
  {
    ticker: 'BTC-USD',
    name: 'Bitcoin',
    asset_class: 'crypto',
    market: 'Crypto (24/7)',
    currency: 'USD',
    sector: 'Crypto asset',
    last_close: 71342.97,
    change_abs: -2621.5,
    change_pct: -3.5443,
    as_of: '2026-11-12',
    sparkline: sparkline(75000, 71342.97),
  },
]

const point = (date: string, close: number) => ({ date, close })

/** NVDA over 1 month (the default range). */
export const NVDA_1M: StockDetail = {
  ticker: 'NVDA',
  name: 'NVIDIA',
  asset_class: 'equity',
  market: 'NASDAQ',
  currency: 'USD',
  sector: 'Information Technology',
  last_close: 166.19,
  change_abs: -7.54,
  change_pct: -4.3401,
  as_of: '2026-11-12',
  points: [point('2026-10-13', 190.1), point('2026-11-11', 173.73), point('2026-11-12', 166.19)],
  stats: {
    open: 151.01,
    high: 167.14,
    low: 148.8,
    volume: 742789000,
    avg_volume_3m: 140898889,
    high_52w: 243.37,
    low_52w: 148.8,
    dividend_yield_ttm: 0.003128948793549552,
    dividends: [
      { ex_date: '2026-09-10', value: 0.25 },
      { ex_date: '2024-03-05', value: 0.004 },
    ],
  },
}

/** NVDA over 1 year: up over the period. */
export const NVDA_1Y: StockDetail = {
  ...NVDA_1M,
  points: [point('2025-11-12', 140.2), point('2026-06-01', 200.5), point('2026-11-12', 166.19)],
}

/** An asset without any dividend. */
export const BTC_1M: StockDetail = {
  ...NVDA_1M,
  ticker: 'BTC-USD',
  name: 'Bitcoin',
  asset_class: 'crypto',
  market: 'Crypto (24/7)',
  sector: 'Crypto asset',
  stats: { ...NVDA_1M.stats, dividend_yield_ttm: null, dividends: [] },
}
