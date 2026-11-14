import type {
  EsgReport,
  EsgScores,
  FitBatch,
  FitReason,
  FitResult,
  HypeSignal,
  PortfolioAnalysis,
} from '@/api/persona'
import type { MarketSection, MarketSectionInfo, StockCardData } from '@/api/stocks'

/*
 * Fixtures of the profile-adapted endpoints, one realistic case per profile:
 * Amira (risk high, AI + crypto), Mateo (ESG, no Energy), Robert (capital
 * preservation, tempted by a hyped stock).
 */

// --- Hype signal ---------------------------------------------------------------

/** A heavily mediatised stock on a run: volume, run-up and news all score. */
export const HYPE_PLTR_HIGH: HypeSignal = {
  ticker: 'PLTR',
  level: 'eleve',
  points: 5,
  components: [
    {
      id: 'volume',
      label: 'Volume échangé',
      points: 2,
      ratio: 3.4,
      message: 'Volume de la dernière séance à 3,4 × sa moyenne de 3 mois (≥ 3 : fort).',
    },
    {
      id: 'run_up',
      label: 'Hausse sur un mois',
      points: 2,
      ratio: 2.6,
      message: 'Hausse de 38,2 % sur un mois, soit 2,6 σ de sa variation habituelle sur un mois (≥ 2 : forte).',
    },
    {
      id: 'news',
      label: 'Attention médiatique',
      points: 1,
      ratio: 1.9,
      message: 'Articles GDELT des 7 derniers jours : 41,3 par jour, soit 1,9 × la moyenne des 83 jours précédents (≥ 1,5 : notable).',
    },
  ],
  reasons: [
    'Volume de la dernière séance à 3,4 × sa moyenne de 3 mois (≥ 3 : fort).',
    'Hausse de 38,2 % sur un mois, soit 2,6 σ de sa variation habituelle sur un mois (≥ 2 : forte).',
    'Articles GDELT des 7 derniers jours : 41,3 par jour, soit 1,9 × la moyenne des 83 jours précédents (≥ 1,5 : notable).',
  ],
  volume_last: 182_400_000,
  volume_avg_10d: 121_000_000,
  volume_avg_3m: 53_600_000,
  return_1m: 0.382,
  volatility_1y: 0.512,
  news_source: 'gdelt',
  as_of: '2026-11-13',
}

/** A quiet large cap; news not evaluated (as in a batch). */
export const HYPE_AAPL_LOW: HypeSignal = {
  ticker: 'AAPL',
  level: 'faible',
  points: 0,
  components: [
    {
      id: 'volume',
      label: 'Volume échangé',
      points: 0,
      ratio: 1.22,
      message: 'Volume des 10 dernières séances à 1,2 × sa moyenne de 3 mois (habituel).',
    },
    {
      id: 'run_up',
      label: 'Hausse sur un mois',
      points: 0,
      ratio: 0.9,
      message: 'Hausse de 5,4 % sur un mois, soit 0,9 σ de sa variation habituelle sur un mois (dans sa fourchette habituelle).',
    },
    {
      id: 'news',
      label: 'Attention médiatique',
      points: null,
      ratio: null,
      message: "Attention médiatique non évaluée dans un calcul groupé (ouvrir la fiche du titre).",
    },
  ],
  reasons: [],
  volume_last: 39_099_985,
  volume_avg_10d: 52_276_110,
  volume_avg_3m: 42_760_568,
  return_1m: 0.054,
  volatility_1y: 0.262,
  news_source: null,
  as_of: '2026-11-13',
}

// --- ESG -------------------------------------------------------------------------

export const ESG_SCORES_AAPL: EsgScores = {
  risk_low: 15,
  risk_high: 20,
  risk_category: 'faible',
  risk_label: 'Risque ESG faible (15 à 20)',
  controversy_level: 3,
  controversy_label: 'Controverse de niveau 3 sur 5 (significative)',
  total_esg: null,
  involvement: [],
  source: 'Yahoo Finance (filtre de titres, données ESG Sustainalytics)',
}

export const ESG_AAPL: EsgReport = {
  ticker: 'AAPL',
  esg: ESG_SCORES_AAPL,
  message: null,
  events: [
    {
      title: 'Apple faces EU antitrust fine over App Store rules',
      date: '2026-11-10',
      url: 'https://finance.yahoo.com/news/apple-eu-fine',
      publisher: 'Reuters',
      keyword: 'antitrust',
    },
  ],
  sources: [
    { id: 'yahoo_screener_esg', title: 'Yahoo Finance (filtre de titres, données ESG Sustainalytics)', url: 'https://finance.yahoo.com/research-hub/screener/' },
    { id: 'yahoo_news', title: 'Yahoo Finance (actualités récentes)', url: 'https://finance.yahoo.com/' },
  ],
}

/** An ETF: no ESG data at Yahoo. */
export const ESG_NONE: EsgReport = {
  ticker: 'XIU.TO',
  esg: null,
  message:
    "Aucune donnée ESG chez Yahoo Finance pour XIU.TO : c'est fréquent pour les FNB, les cryptoactifs et les petites capitalisations.",
  events: [],
  sources: [],
}

// --- Fit verdict -------------------------------------------------------------------

const reason = (
  rule: FitReason['rule'],
  severity: FitReason['severity'],
  message: string,
  value: number | null = null,
  limit: number | null = null,
): FitReason => ({ rule, severity, message, value, limit })

export const FIT_NVDA_ROBERT: FitResult = {
  ticker: 'NVDA',
  name: 'NVIDIA Corporation',
  persona_id: 'robert',
  verdict: 'hors_profil',
  summary: 'Hors profil pour Robert : volatilité trop élevée.',
  reasons: [
    reason('volatility', 'bloquant', 'Volatilité sur 1 an de 48,6 % au-dessus du maximum de 25 % du profil de Robert.', 0.486, 0.25),
    reason('esg_controversy', 'info', 'Controverse de niveau 2 sur 5 (modérée).', 2, null),
    reason('position', 'info', 'Position maximale pour Robert : 10 % du portefeuille.', null, 0.1),
  ],
  asset_class: 'equity',
  sector: 'Technology',
  volatility_1y: 0.486,
  return_1m: -0.083,
  max_volatility: 0.25,
  max_position: 0.1,
  hype: null,
  esg: { ...ESG_SCORES_AAPL, risk_low: 10, risk_high: 15, risk_label: 'Risque ESG faible (10 à 15)', controversy_level: 2, controversy_label: 'Controverse de niveau 2 sur 5 (modérée)' },
}

export const FIT_NVDA_AMIRA: FitResult = {
  ...FIT_NVDA_ROBERT,
  persona_id: 'amira',
  verdict: 'compatible',
  summary: 'Compatible avec le profil d’Amira.',
  reasons: [
    reason('volatility', 'ok', 'Volatilité sur 1 an de 48,6 %, sous le maximum de 80 % du profil d’Amira.', 0.486, 0.8),
    reason('esg_controversy', 'info', 'Controverse de niveau 2 sur 5 (modérée).', 2, null),
    reason('position', 'info', 'Position maximale pour Amira : 25 % du portefeuille.', null, 0.25),
  ],
  max_volatility: 0.8,
  max_position: 0.25,
}

export const FIT_XOM_MATEO: FitResult = {
  ticker: 'XOM',
  name: 'Exxon Mobil Corporation',
  persona_id: 'mateo',
  verdict: 'hors_profil',
  summary: 'Hors profil pour Mateo : secteur « Energy » exclu.',
  reasons: [
    reason('sector', 'bloquant', 'Secteur « Energy » exclu par le filtre ESG simplifié de Mateo.'),
    reason('esg_risk', 'attention', 'Risque ESG élevé (30 à 35) : au-dessus de 30, à vérifier pour un profil ESG.', 30, 30),
    reason('volatility', 'ok', 'Volatilité sur 1 an de 22,1 %, sous le maximum de 35 % du profil de Mateo.', 0.221, 0.35),
    reason('esg_controversy', 'ok', 'Controverse de niveau 2 sur 5 (modérée) : sous le seuil de 4.', 2, 4),
    reason('position', 'info', 'Position maximale pour Mateo : 15 % du portefeuille.', null, 0.15),
  ],
  asset_class: 'equity',
  sector: 'Energy',
  volatility_1y: 0.221,
  return_1m: 0.021,
  max_volatility: 0.35,
  max_position: 0.15,
  hype: null,
  esg: {
    ...ESG_SCORES_AAPL,
    risk_low: 30,
    risk_high: 35,
    risk_category: 'eleve',
    risk_label: 'Risque ESG élevé (30 à 35)',
    controversy_level: 2,
    controversy_label: 'Controverse de niveau 2 sur 5 (modérée)',
  },
}

/** Robert's hyped stock: out of profile, and the hype is spelled out. */
export const FIT_PLTR_ROBERT: FitResult = {
  ticker: 'PLTR',
  name: 'Palantir Technologies Inc.',
  persona_id: 'robert',
  verdict: 'hors_profil',
  summary: 'Hors profil pour Robert : volatilité trop élevée ; battage médiatique élevé.',
  reasons: [
    reason('volatility', 'bloquant', 'Volatilité annualisée de 51,2 % supérieure au seuil de 25 % retenu pour le profil Robert (risque faible à modéré).', 0.512, 0.25),
    reason('hype', 'attention', "Battage élevé (5 points sur 6) : volume échangé, hausse sur un mois, attention médiatique anormaux. Une décision sous l'effet de l'emballement est risquée. Avec un horizon de 3 à 5 ans, une correction laisserait peu de temps pour se refaire.", 5, 3),
    reason('position', 'info', 'Position maximale pour Robert : 10 % du portefeuille.', null, 0.1),
  ],
  asset_class: 'equity',
  sector: 'Technology',
  volatility_1y: 0.512,
  return_1m: 0.382,
  max_volatility: 0.25,
  max_position: 0.1,
  hype: HYPE_PLTR_HIGH,
  esg: null,
}

export const FIT_BTC_ROBERT: FitResult = {
  ticker: 'BTC-USD',
  name: 'Bitcoin USD',
  persona_id: 'robert',
  verdict: 'hors_profil',
  summary: 'Hors profil pour Robert : volatilité trop élevée ; cryptoactif exclu.',
  reasons: [
    reason('volatility', 'bloquant', 'Volatilité annualisée de 41,7 % supérieure au seuil de 25 % retenu pour le profil Robert (risque faible à modéré).', 0.417, 0.25),
    reason('crypto', 'bloquant', 'Cryptoactif hors du profil de Robert (risque faible à modéré).'),
    reason('position', 'info', 'Position maximale pour Robert : 10 % du portefeuille.', null, 0.1),
  ],
  asset_class: 'crypto',
  sector: null,
  volatility_1y: 0.417,
  return_1m: -0.12,
  max_volatility: 0.25,
  max_position: 0.1,
  hype: null,
  esg: null,
}

export const FIT_RY_ROBERT: FitResult = {
  ticker: 'RY.TO',
  name: 'Royal Bank of Canada',
  persona_id: 'robert',
  verdict: 'compatible',
  summary: 'Compatible avec le profil de Robert.',
  reasons: [
    reason('volatility', 'ok', 'Volatilité sur 1 an de 16,8 %, sous le maximum de 25 % du profil de Robert.', 0.168, 0.25),
    reason('esg_controversy', 'info', 'Controverse de niveau 2 sur 5 (modérée).', 2, null),
    reason('position', 'info', 'Position maximale pour Robert : 10 % du portefeuille.', null, 0.1),
  ],
  asset_class: 'equity',
  sector: 'Financial Services',
  volatility_1y: 0.168,
  return_1m: 0.031,
  max_volatility: 0.25,
  max_position: 0.1,
  hype: null,
  esg: null,
}

/** POST /api/fit for Robert's dashboard cards (news not evaluated in a batch). */
export const FIT_BATCH_ROBERT: FitBatch = {
  persona_id: 'robert',
  items: [FIT_NVDA_ROBERT, FIT_RY_ROBERT, FIT_BTC_ROBERT],
  missing: ['ZZZZ'],
}

// --- Profile sections of the dashboard (GET /api/market/sections?persona=) --------

const YAHOO_SCREENER = 'Yahoo Finance (filtre de titres)'
const general = (id: string, title: string, description: string): MarketSectionInfo => ({
  id,
  title,
  description,
  source: YAHOO_SCREENER,
  persona_reason: null,
})
const GENERAL_SECTIONS: MarketSectionInfo[] = [
  general('populaires', 'Les plus populaires', 'Les actions américaines les plus échangées de la séance.'),
  general('hausses', 'Plus fortes hausses', 'Les actions américaines qui montent le plus sur la séance.'),
]

export const SECTIONS_AMIRA: MarketSectionInfo[] = [
  {
    id: 'ia-semis',
    title: 'IA et semi-conducteurs',
    description:
      "Semi-conducteurs, équipements et logiciels d'infrastructure cotés aux États-Unis, capitalisation d'au moins 10 G$ US.",
    source: YAHOO_SCREENER,
    persona_reason: 'Préférence « IA » du profil d’Amira.',
  },
  {
    id: 'cryptos',
    title: 'Cryptomonnaies',
    description: 'Les cryptomonnaies les plus capitalisées, hors cryptomonnaies stables (arrimées au dollar).',
    source: 'Yahoo Finance (filtre des cryptomonnaies)',
    persona_reason: 'Le profil d’Amira accepte les cryptoactifs.',
  },
  ...GENERAL_SECTIONS,
]

export const SECTIONS_MATEO: MarketSectionInfo[] = [
  {
    id: 'esg-faible-risque',
    title: 'Faible risque ESG',
    description:
      "Grandes entreprises américaines et canadiennes au risque ESG faible (moins de 20) sans controverse élevée (niveau 2 sur 5 au plus), capitalisation d'au moins 10 G$.",
    source: YAHOO_SCREENER,
    persona_reason: 'Préférence « ESG » de Mateo ; secteur(s) exclu(s) : Energy.',
  },
  ...GENERAL_SECTIONS,
]

export const SECTIONS_ROBERT: MarketSectionInfo[] = [
  {
    id: 'dividendes',
    title: 'Dividendes réguliers',
    description:
      "Grandes entreprises américaines et canadiennes au rendement du dividende de 2,5 % à 8 %, en hausse depuis au moins 5 ans, capitalisation d'au moins 10 G$.",
    source: YAHOO_SCREENER,
    persona_reason: 'Objectif « revenu de retraite » de Robert.',
  },
  {
    id: 'faible-volatilite',
    title: 'Faible volatilité',
    description:
      "Grandes entreprises américaines et canadiennes au bêta inférieur à 0,8 (moins sensibles au marché), capitalisation d'au moins 20 G$.",
    source: YAHOO_SCREENER,
    persona_reason: 'Objectif « préservation du capital » de Robert (risque faible à modéré).',
  },
  ...GENERAL_SECTIONS,
]

const cryptoCard = (ticker: string, name: string, price: number, change: number): StockCardData => ({
  ticker,
  name,
  exchange: 'Crypto',
  currency: 'USD',
  price,
  change_abs: (price * change) / 100,
  change_pct: change,
  volume: 40_941_035_520,
  market_cap: 1_282_996_436_992,
  as_of: '2026-11-14',
  sparkline: [71000, 68000, 66000, price],
  score: null,
  score_partiel: null,
})

export const SECTION_CRYPTOS: MarketSection = {
  ...(SECTIONS_AMIRA[1] as Omit<MarketSectionInfo, 'persona_reason'>),
  status: 'ok',
  message: null,
  as_of: '2026-11-14',
  limit: 24,
  items: [cryptoCard('BTC-USD', 'Bitcoin USD', 63895.06, -1.2), cryptoCard('ETH-USD', 'Ethereum USD', 1760.44, -2.4)],
}

// --- Portfolio analysis -------------------------------------------------------------

/** Robert's example portfolio: the hyped stock is over his 10 % maximum and out of profile. */
export const PORTFOLIO_ROBERT: PortfolioAnalysis = {
  persona_id: 'robert',
  total_input_weight: 100,
  holdings: [
    {
      ticker: 'PLTR',
      name: 'Palantir Technologies Inc.',
      weight: 0.12,
      asset_class: 'equity',
      sector: 'Technology',
      country: 'US',
      volatility_1y: 0.512,
      over_max_position: true,
      fit: FIT_PLTR_ROBERT,
      score: null,
    },
    {
      ticker: 'RY.TO',
      name: 'Royal Bank of Canada',
      weight: 0.1,
      asset_class: 'equity',
      sector: 'Financial Services',
      country: 'CA',
      volatility_1y: 0.168,
      over_max_position: false,
      fit: FIT_RY_ROBERT,
      score: {
        default_score: 61.4,
        custom_score: 61.4,
        delta: 0,
        default_rank: 58,
        custom_rank: 58,
        rank_change: 0,
        partiel: false,
      },
    },
  ],
  missing: [],
  diversification: {
    by_sector: [
      { key: 'Financial Services', label: 'Services financiers', weight: 0.18 },
      { key: 'Technology', label: 'Technologie', weight: 0.12 },
      { key: 'none', label: 'Non classé (FNB, cryptoactifs)', weight: 0.2 },
    ],
    by_asset_class: [
      { key: 'equity', label: 'Actions', weight: 0.8 },
      { key: 'etf', label: 'FNB', weight: 0.2 },
    ],
    by_country: [
      { key: 'CA', label: 'Canada', weight: 0.64 },
      { key: 'US', label: 'États-Unis', weight: 0.36 },
    ],
    largest: [
      { ticker: 'PLTR', weight: 0.12, over_max: true },
      { ticker: 'XBB.TO', weight: 0.1, over_max: false },
      { ticker: 'RY.TO', weight: 0.1, over_max: false },
    ],
    max_position: 0.1,
    positions_over_max: ['PLTR'],
    weighted_volatility: 0.168,
    portfolio_volatility: 0.112,
    max_volatility: 0.25,
    hhi: 0.0944,
    effective_positions: 10.6,
    concentration: 'faible',
  },
  findings: [
    { severity: 'bloquant', message: 'PLTR pèse 12,0 % du portefeuille, au-dessus du maximum de 10 % par titre du profil de Robert.' },
    { severity: 'bloquant', message: '1 titre(s) hors profil : PLTR.' },
    { severity: 'ok', message: 'Volatilité du portefeuille de 11,2 % (corrélations sur 1 an), sous le maximum de 25 % du profil.' },
    { severity: 'ok', message: 'Concentration faible : équivalent de 10,78 positions égales.' },
  ],
  suggestions: {
    source: 'sections',
    message:
      "La table des scores n'existe pas encore : suggestions tirées des sections du profil, sans score.",
    items: [
      {
        ticker: 'WM',
        name: 'Waste Management, Inc.',
        sector: 'Industrials',
        asset_class: 'equity',
        score: null,
        ranking: null,
        verdict: 'compatible',
        reasons: [
          'Compatible avec le profil de Robert (volatilité sur 1 an de 17,4 %).',
          'Secteur « Industrials » absent du portefeuille : améliore la diversification.',
        ],
      },
    ],
  },
  scoring: {
    weights: { rentabilite: 25, solidite: 20, croissance: 15, valorisation: 15, momentum_risque: 15, evenements: 10 },
    default_weights: {
      rentabilite: 25,
      solidite: 20,
      croissance: 15,
      valorisation: 15,
      momentum_risque: 15,
      evenements: 10,
    },
    excluded_indicators: [],
    custom: false,
  },
}
