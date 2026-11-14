import type {
  MarketSection,
  MarketSectionInfo,
  ScoreIndicator,
  ScoreRow,
  StockCardData,
  StockDetail,
  StockScoreResponse,
  StockSummary,
  SubScore,
  UniverseSearchResult,
} from '@/api/stocks'

const sparkline = (from: number, to: number) =>
  Array.from({ length: 30 }, (_, i) => from + ((to - from) * i) / 29)

// --- Legacy: GET /api/stocks (the starter kit's 31 assets) --------------------

/** One asset per section of the first Tableau de bord, plus a second Canadian one. */
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

// --- GET /api/stocks/{ticker}?range= ------------------------------------------

const point = (date: string, close: number) => ({ date, close })

/** NVDA over 1 month (the default range). */
export const NVDA_1M: StockDetail = {
  ticker: 'NVDA',
  name: 'NVIDIA',
  asset_class: 'equity',
  market: 'NASDAQ',
  currency: 'USD',
  sector: 'Information Technology',
  in_universe: true,
  starter_kit: true,
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
  source: {
    id: 'yahoo_finance',
    title: 'Yahoo Finance (cours quotidiens, différés)',
    url: 'https://finance.yahoo.com/',
  },
}

/** NVDA over 1 year: up over the period. */
export const NVDA_1Y: StockDetail = {
  ...NVDA_1M,
  points: [point('2025-11-12', 140.2), point('2026-06-01', 200.5), point('2026-11-12', 166.19)],
}

/** An asset without any dividend, outside the SEC/TMX universe (a crypto of the starter kit). */
export const BTC_1M: StockDetail = {
  ...NVDA_1M,
  ticker: 'BTC-USD',
  name: 'Bitcoin',
  asset_class: 'crypto',
  market: 'Crypto (24/7)',
  sector: 'Crypto asset',
  in_universe: false,
  stats: { ...NVDA_1M.stats, dividend_yield_ttm: null, dividends: [] },
}

/** A TSX Venture company outside the starter kit: no account or bias analysis for it. */
export const ONE_V_1M: StockDetail = {
  ...NVDA_1M,
  ticker: 'ONE.V',
  name: '01 Quantum Inc.',
  market: 'TSXV',
  currency: 'CAD',
  sector: 'Non disponible',
  starter_kit: false,
  last_close: 0.37,
  change_abs: -0.03,
  change_pct: -7.5,
  as_of: '2026-11-13',
  points: [point('2026-10-14', 0.45), point('2026-11-12', 0.4), point('2026-11-13', 0.37)],
  stats: { ...NVDA_1M.stats, dividend_yield_ttm: null, dividends: [] },
}

// --- GET /api/universe/search?q= ----------------------------------------------

export const SEARCH_RY: UniverseSearchResult = {
  query: 'ry',
  total: 28,
  results: [
    { ticker: 'RY', name: 'ROYAL BANK OF CANADA', exchange: 'NYSE', country: 'US' },
    { ticker: 'RY.TO', name: 'Royal Bank of Canada', exchange: 'TSX', country: 'CA' },
    { ticker: 'RYN', name: 'RAYONIER INC', exchange: 'NYSE', country: 'US' },
  ],
}

export const SEARCH_NONE: UniverseSearchResult = { query: 'zzz', total: 0, results: [] }

// --- GET /api/market/sections[/{id}] ------------------------------------------

const YAHOO_SCREENER = 'Yahoo Finance (filtre de titres)'

/** The first four sections of the live catalog. */
export const SECTION_CATALOG: MarketSectionInfo[] = [
  {
    id: 'populaires',
    title: 'Les plus populaires',
    description:
      "Les actions américaines les plus échangées de la séance (volume), capitalisation d'au moins 2 G$ US.",
    source: YAHOO_SCREENER,
  },
  {
    id: 'meilleurs-scores',
    title: 'Meilleurs scores',
    description:
      'Les titres les mieux notés par le score StockLock (0 à 100), calculé par le pipeline de score.',
    source: 'Table gold score_par_titre',
  },
  {
    id: 'hausses',
    title: 'Plus fortes hausses',
    description:
      "Les actions américaines qui montent le plus sur la séance (capitalisation d'au moins 2 G$ US).",
    source: YAHOO_SCREENER,
  },
  {
    id: 'canada-populaires',
    title: 'Populaires au Canada',
    description:
      "Les actions de la Bourse de Toronto les plus échangées de la séance, capitalisation d'au moins 1 G$.",
    source: YAHOO_SCREENER,
  },
]

type CardFields = Partial<StockCardData> & Pick<StockCardData, 'ticker' | 'name'>

const card = (fields: CardFields): StockCardData => ({
  exchange: 'Nasdaq',
  currency: 'USD',
  price: 100,
  change_abs: 1,
  change_pct: 1,
  volume: 1_000_000,
  market_cap: 5e10,
  as_of: '2026-11-13',
  sparkline: sparkline(95, 100),
  score: null,
  score_partiel: null,
  ...fields,
})

/** Cards without a score: the score pipeline has not run yet. */
export const CARD_NVDA = card({
  ticker: 'NVDA',
  name: 'NVIDIA Corporation',
  price: 162.85,
  change_abs: -3.34,
  change_pct: -2.0097,
  volume: 214_500_000,
  market_cap: 3.97e12,
  sparkline: sparkline(176, 162.85),
})

export const CARD_NU = card({
  ticker: 'NU',
  name: 'Nu Holdings Ltd.',
  exchange: 'NYSE',
  price: 13.22,
  change_abs: 1.39,
  change_pct: 11.7498,
  sparkline: sparkline(11.5, 13.22),
})

export const CARD_RY_TO = card({
  ticker: 'RY.TO',
  name: 'Royal Bank of Canada',
  exchange: 'TSX',
  currency: 'CAD',
  price: 288.37,
  change_abs: -1.02,
  change_pct: -0.3525,
  sparkline: sparkline(280, 288.37),
})

/** No sparkline (the spark request failed) and no volume. */
export const CARD_NO_SPARK = card({
  ticker: 'INTC',
  name: 'Intel Corporation',
  sparkline: [],
  volume: null,
})

export const SECTION_POPULAIRES: MarketSection = {
  ...SECTION_CATALOG[0],
  status: 'ok',
  message: null,
  as_of: '2026-11-13',
  limit: 24,
  items: [CARD_NVDA, CARD_NU, CARD_NO_SPARK],
}

export const SECTION_CANADA: MarketSection = {
  ...SECTION_CATALOG[3],
  status: 'ok',
  message: null,
  as_of: '2026-11-13',
  limit: 24,
  items: [CARD_RY_TO],
}

/** « Meilleurs scores » before the score pipeline has run (today's live answer). */
export const SECTION_BEST_EMPTY: MarketSection = {
  ...SECTION_CATALOG[1],
  status: 'empty',
  message:
    "La table des scores n'existe pas encore : le pipeline de score n'a pas encore été exécuté. " +
    'Les meilleurs scores apparaîtront ici une fois le pipeline exécuté.',
  as_of: null,
  limit: 24,
  items: [],
}

/** « Meilleurs scores » once the table exists. */
export const SECTION_BEST: MarketSection = {
  ...SECTION_BEST_EMPTY,
  status: 'ok',
  message: null,
  as_of: '2026-11-13',
  items: [
    card({ ticker: 'AAPL', name: 'Apple Inc.', price: 356.27, score: 65.4, score_partiel: false }),
    card({
      ticker: 'XIU.TO',
      name: 'iShares S&P/TSX 60 Index ETF',
      exchange: 'TSX',
      currency: 'CAD',
      price: 54.55,
      score: 61.8,
      score_partiel: true,
    }),
  ],
}

// --- GET /api/scores/{ticker} (gold table score_par_titre) --------------------

const indicator = (
  id: string,
  label: string,
  value: number | null,
  unit: ScoreIndicator['unit'],
  better: ScoreIndicator['better'],
  rank: number | null,
  note: string | null = null,
): ScoreIndicator => ({ id, label, value, unit, better, rank, note })

const missing = (id: SubScore['id'], label: string, weight: number): SubScore => ({
  id,
  label,
  weight,
  effective_weight: 0,
  score: null,
  contribution: 0,
  indicators: [],
})

/** AAPL: every sub-score present; the contributions sum to the score (65,4). */
export const SCORE_ROW_AAPL: ScoreRow = {
  symbol: 'AAPL',
  date: '2026-11-13',
  score: 65.4,
  partiel: false,
  comparison_set: 'Technologie, 48 titres',
  sub_scores: [
    {
      id: 'rentabilite',
      label: 'Rentabilité',
      weight: 0.25,
      effective_weight: 0.25,
      score: 92,
      contribution: 23,
      indicators: [
        indicator('roe', 'ROE (bénéfice net TTM / capitaux propres moyens)', 1.52, 'ratio', 'higher', 96),
        indicator('net_margin', 'Marge nette', 0.243, 'ratio', 'higher', 88),
      ],
    },
    {
      id: 'solidite',
      label: 'Solidité financière',
      weight: 0.2,
      effective_weight: 0.2,
      score: 58,
      contribution: 11.6,
      indicators: [
        indicator('debt_to_equity', 'Dette / capitaux propres', 1.87, 'multiple', 'lower', 31),
        indicator('interest_coverage', 'Couverture des intérêts', 41.2, 'multiple', 'higher', 85),
      ],
    },
    {
      id: 'croissance',
      label: 'Croissance',
      weight: 0.15,
      effective_weight: 0.15,
      score: 54,
      contribution: 8.1,
      indicators: [
        indicator('revenue_cagr_3y', 'Croissance annuelle du chiffre d’affaires (3 ans)', 0.034, 'ratio', 'higher', 40),
        indicator('eps_cagr_3y', 'Croissance annuelle du BPA (3 ans)', 0.081, 'ratio', 'higher', 68),
      ],
    },
    {
      id: 'valorisation',
      label: 'Valorisation',
      weight: 0.15,
      effective_weight: 0.15,
      score: 36,
      contribution: 5.4,
      indicators: [
        indicator('pe', 'Cours / bénéfice', 35.2, 'multiple', 'lower', 30, 'Comparé au secteur'),
        indicator('pb', 'Cours / valeur comptable', 52.1, 'multiple', 'lower', 42, 'Comparé au secteur'),
      ],
    },
    {
      id: 'momentum_risque',
      label: 'Momentum et risque',
      weight: 0.15,
      effective_weight: 0.15,
      score: 72,
      contribution: 10.8,
      indicators: [
        indicator('return_12_1', 'Rendement sur 12 mois, hors dernier mois', 0.214, 'ratio', 'higher', 77),
        indicator('volatility_1y', 'Volatilité annualisée', 0.27, 'ratio', 'lower', 62),
        indicator('max_drawdown_1y', 'Baisse maximale sur 1 an', -0.19, 'ratio', 'lower', 77),
      ],
    },
    {
      id: 'evenements',
      label: 'Événements',
      weight: 0.1,
      effective_weight: 0.1,
      score: 65,
      contribution: 6.5,
      indicators: [
        indicator('events_90d', 'Impact pondéré des événements (90 jours)', 0.3, 'number', 'higher', null, '12 événements'),
      ],
    },
  ],
  sources: [
    { id: 'sec_edgar', title: 'SEC EDGAR (companyfacts)', url: 'https://www.sec.gov/edgar', as_of: '2026-11-10' },
    { id: 'yahoo_finance', title: 'Yahoo Finance (cours quotidiens)', url: 'https://finance.yahoo.com/', as_of: '2026-11-13' },
    { id: 'gdelt', title: 'GDELT (actualités)', url: 'https://www.gdeltproject.org/', as_of: '2026-11-13' },
  ],
}

/** An ETF: no financial statements, so four sub-scores are missing and the score is « partiel ». */
export const SCORE_ROW_XIU_PARTIAL: ScoreRow = {
  symbol: 'XIU.TO',
  date: '2026-11-13',
  score: 61.8,
  partiel: true,
  comparison_set: 'FNB canadiens, 35 titres',
  sub_scores: [
    missing('rentabilite', 'Rentabilité', 0.25),
    missing('solidite', 'Solidité financière', 0.2),
    missing('croissance', 'Croissance', 0.15),
    missing('valorisation', 'Valorisation', 0.15),
    {
      id: 'momentum_risque',
      label: 'Momentum et risque',
      weight: 0.15,
      effective_weight: 0.6,
      score: 63,
      contribution: 37.8,
      indicators: [indicator('volatility_1y', 'Volatilité annualisée', 0.11, 'ratio', 'lower', 81)],
    },
    {
      id: 'evenements',
      label: 'Événements',
      weight: 0.1,
      effective_weight: 0.4,
      score: 60,
      contribution: 24,
      indicators: [],
    },
  ],
  sources: [
    { id: 'yahoo_finance', title: 'Yahoo Finance (cours quotidiens)', url: 'https://finance.yahoo.com/', as_of: '2026-11-13' },
  ],
}

export const SCORE_AAPL: StockScoreResponse = {
  status: 'available',
  message: null,
  generated_at: '2026-11-15T06:00:00+00:00',
  score: SCORE_ROW_AAPL,
}

export const SCORE_XIU_PARTIAL: StockScoreResponse = { ...SCORE_AAPL, score: SCORE_ROW_XIU_PARTIAL }

/** Before the score pipeline has run (today's live answer for every title). */
export const SCORE_ABSENT: StockScoreResponse = {
  status: 'absent',
  message: "La table des scores n'existe pas encore : le pipeline de score n'a pas encore été exécuté.",
  generated_at: null,
  score: null,
}

/** The table exists but does not cover this title. */
export const SCORE_NOT_SCORED: StockScoreResponse = {
  status: 'not_scored',
  message: "Ce titre n'a pas encore de score : il ne figure pas dans la dernière table calculée.",
  generated_at: '2026-11-15T06:00:00+00:00',
  score: null,
}
