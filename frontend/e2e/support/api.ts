/**
 * The whole StockLock API, answered inside the browser from the unit tests' fixtures
 * (`src/test/`): the suite runs offline, fast, and always sees the same data.
 *
 * `mockApi(page)` intercepts every request to the API base URL the dev server was started with.
 * What the fixtures do not hold as such (any ticker's page, a portfolio analysis that follows the
 * holdings and the score weights sent) is derived from them here, deterministically.
 */

import type { Page, Request, Route } from '@playwright/test'
import { ASSETS, PROJECTION, RULES, stockProjection } from '../../src/test/accounts'
import { LAB_BATCH_RUN, LAB_CATALOG, LAB_GROUPS, LAB_RUN } from '../../src/test/lab'
import { NVDA_MOVES } from '../../src/test/moves'
import {
  ESG_AAPL,
  ESG_NONE,
  FIT_BTC_ROBERT,
  FIT_NVDA_AMIRA,
  FIT_NVDA_ROBERT,
  FIT_PLTR_ROBERT,
  FIT_RY_ROBERT,
  FIT_XOM_MATEO,
  HYPE_AAPL_LOW,
  HYPE_PLTR_HIGH,
  PORTFOLIO_ROBERT,
  SECTION_CRYPTOS,
  SECTIONS_AMIRA,
  SECTIONS_MATEO,
  SECTIONS_ROBERT,
} from '../../src/test/persona'
import { PERSONAS } from '../../src/test/personas'
import { SCORE_RUN_LIST, SCORE_RUN_LIST_UNCONFIGURED, SCORE_RUN_RUNNING, SCORE_RUN_SUCCEEDED, SCORE_RUN_TICKERS } from '../../src/test/pipeline'
import {
  RUN_ARTIFACT_PREVIEW,
  RUN_ARTIFACTS,
  RUN_BATCH,
  RUN_DETAIL_BATCH,
  RUN_DETAIL_LAB,
  RUN_LAB,
  RUN_PAGE,
  RUN_SCORE_PIPELINE,
  RUN_STAGE_LAB,
} from '../../src/test/runs'
import {
  BTC_1M,
  CARD_NO_SPARK,
  CARD_NU,
  CARD_NVDA,
  CARD_RY_TO,
  KPIS_SCORED,
  NVDA_1M,
  NVDA_1Y,
  SCORE_AAPL,
  SCORE_NOT_SCORED,
  SECTION_BEST,
  SECTION_CANADA,
  SECTION_CATALOG,
  SECTION_POPULAIRES,
  STOCKS,
} from '../../src/test/stocks'

/** The API base URL the E2E dev server is started with (see playwright.config.ts). */
export const API_ORIGIN = 'http://api.stocklock.test'

type Json = Record<string, unknown>
type Handler = (request: Request, url: URL) => { status?: number; body: unknown } | undefined

export interface MockApiOptions {
  /** Answers tried before the built-in ones: return `undefined` to let a request through to them. */
  override?: Handler
  /** The score pipeline is not deployed where the API runs (503 on start, no button). */
  scoreUnconfigured?: boolean
  /** A score run is already going: starting another one answers 409. */
  scoreRunning?: boolean
}

const SUBS = ['rentabilite', 'solidite', 'croissance', 'valorisation', 'momentum_risque', 'evenements'] as const
const DEFAULT_WEIGHTS: Record<string, number> = { rentabilite: 25, solidite: 20, croissance: 15, valorisation: 15, momentum_risque: 15, evenements: 10 }

/** Each known title's six sub-scores (0-100): what the user's weights are applied to. */
const SUB_SCORES: Record<string, number[]> = {
  AAPL: [82, 58, 49, 31, 76, 55],
  NVDA: [98, 92, 87, 49, 37, 31],
  PLTR: [61, 88, 95, 6, 52, 70],
  'RY.TO': [66, 48, 52, 71, 68, 60],
  WM: [72, 55, 40, 44, 80, 50],
  UNP: [64, 52, 96, 58, 70, 45],
}
const RANKED = Object.keys(SUB_SCORES)

const NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.',
  NVDA: 'NVIDIA Corporation',
  PLTR: 'Palantir Technologies Inc.',
  'RY.TO': 'Royal Bank of Canada',
  RY: 'ROYAL BANK OF CANADA',
  RYN: 'RAYONIER INC',
  WM: 'Waste Management, Inc.',
  UNP: 'Union Pacific Corporation',
  XOM: 'Exxon Mobil Corporation',
  SHOP: 'Shopify Inc.',
  'SHOP.TO': 'Shopify Inc.',
  BITF: 'Bitfarms Ltd.',
  'BTC-USD': 'Bitcoin USD',
  'BCH-USD': 'Bitcoin Cash USD',
  'ETH-USD': 'Ethereum USD',
}
const CRYPTO = new Set(['BTC-USD', 'BCH-USD', 'ETH-USD'])

function normalise(weights: Record<string, number> | undefined): Record<string, number> {
  const full = { ...DEFAULT_WEIGHTS, ...(weights ?? {}) }
  const total = SUBS.reduce((sum, id) => sum + Math.max(0, full[id]), 0) || 1
  return Object.fromEntries(SUBS.map((id) => [id, (Math.max(0, full[id]) / total) * 100]))
}

function scoreOf(ticker: string, weights: Record<string, number>): number {
  const subs = SUB_SCORES[ticker]
  return Math.round(SUBS.reduce((sum, id, index) => sum + subs[index] * weights[id], 0)) / 100
}

function rankOf(ticker: string, weights: Record<string, number>): number {
  const mine = scoreOf(ticker, weights)
  return 1 + RANKED.filter((other) => scoreOf(other, weights) > mine).length
}

/** Default vs custom score and rank of a ranked title; null for the others (ETFs, crypto…). */
function comparison(ticker: string, weights: Record<string, number>) {
  if (!SUB_SCORES[ticker]) return null
  const base = scoreOf(ticker, DEFAULT_WEIGHTS)
  const custom = scoreOf(ticker, weights)
  const baseRank = rankOf(ticker, DEFAULT_WEIGHTS)
  const customRank = rankOf(ticker, weights)
  return {
    default_score: base,
    custom_score: custom,
    delta: Math.round((custom - base) * 100) / 100,
    default_rank: baseRank,
    custom_rank: customRank,
    rank_change: baseRank - customRank,
    partiel: false,
  }
}

function applied(weights: Record<string, number>, excluded: string[] = []) {
  const custom = SUBS.some((id) => Math.abs(weights[id] - DEFAULT_WEIGHTS[id]) > 1e-6) || excluded.length > 0
  return { weights, default_weights: DEFAULT_WEIGHTS, excluded_indicators: excluded, custom }
}

// --- profile -------------------------------------------------------------------------------------

const MAX_POSITION: Record<string, number> = { amira: 0.25, mateo: 0.15, robert: 0.1 }
const PERSONA_NAME: Record<string, string> = { amira: 'd’Amira', mateo: 'de Mateo', robert: 'de Robert' }

/** The title's fit for a profile: the fixture when there is one, else a calm « compatible ». */
function fitOf(ticker: string, persona: string): Json {
  const known: Record<string, Json> = {
    'robert:NVDA': FIT_NVDA_ROBERT,
    'robert:PLTR': FIT_PLTR_ROBERT,
    'robert:RY.TO': FIT_RY_ROBERT,
    'robert:BTC-USD': FIT_BTC_ROBERT,
    'amira:NVDA': FIT_NVDA_AMIRA,
    'mateo:XOM': FIT_XOM_MATEO,
  } as unknown as Record<string, Json>
  const exact = known[`${persona}:${ticker}`]
  if (exact) return exact
  if (persona === 'mateo' && ticker === 'ENB.TO') return { ...FIT_XOM_MATEO, ticker, name: 'Enbridge Inc.' }
  return {
    ...FIT_NVDA_AMIRA,
    ticker,
    name: NAMES[ticker] ?? ticker,
    persona_id: persona,
    summary: `Compatible avec le profil ${PERSONA_NAME[persona] ?? persona}.`,
    max_position: MAX_POSITION[persona] ?? 0.2,
    hype: ticker === 'PLTR' ? HYPE_PLTR_HIGH : null,
  }
}

const SECTIONS: Record<string, unknown[]> = { amira: SECTIONS_AMIRA, mateo: SECTIONS_MATEO, robert: SECTIONS_ROBERT }

function section(id: string, limit: number): Json | undefined {
  const fixed: Record<string, Json> = {
    populaires: SECTION_POPULAIRES,
    'meilleurs-scores': SECTION_BEST,
    'canada-populaires': SECTION_CANADA,
    cryptos: SECTION_CRYPTOS,
  } as unknown as Record<string, Json>
  if (fixed[id]) return { ...fixed[id], limit }
  const info = [...SECTIONS_AMIRA, ...SECTIONS_MATEO, ...SECTIONS_ROBERT, ...SECTION_CATALOG].find((candidate) => candidate.id === id)
  if (!info) return undefined
  const items: Record<string, unknown[]> = {
    'ia-semis': [CARD_NVDA, { ...CARD_NU, ticker: 'PLTR', name: 'Palantir Technologies Inc.' }, CARD_NO_SPARK],
    'esg-faible-risque': [...SECTION_BEST.items, { ...CARD_NU, ticker: 'XOM', name: 'Exxon Mobil Corporation', change_pct: 0.4 }],
    dividendes: [CARD_RY_TO, ...SECTION_BEST.items],
    'faible-volatilite': [CARD_RY_TO, { ...CARD_NVDA, ticker: 'PLTR', name: 'Palantir Technologies Inc.' }],
    hausses: [CARD_NU],
  }
  return { ...info, status: 'ok', message: null, as_of: '2026-11-13', limit, items: items[id] ?? [CARD_NVDA] }
}

// --- portfolio -----------------------------------------------------------------------------------

function analyse(body: Json): Json {
  const persona = String(body.persona_id)
  const holdings = (body.holdings as Array<{ ticker: string; weight: number }>).filter((holding) => holding.weight > 0)
  const total = holdings.reduce((sum, holding) => sum + holding.weight, 0) || 1
  const weights = normalise(body.weights as Record<string, number> | undefined)
  const excluded = ((body.factors as Json | undefined)?.excluded_indicators as string[] | undefined) ?? []
  const max = MAX_POSITION[persona] ?? 0.2
  const template = PORTFOLIO_ROBERT.holdings[1]
  const analysed = holdings.map((holding) => {
    const share = holding.weight / total
    const fit = fitOf(holding.ticker, persona)
    return {
      ...template,
      ticker: holding.ticker,
      name: NAMES[holding.ticker] ?? holding.ticker,
      weight: share,
      asset_class: CRYPTO.has(holding.ticker) ? 'crypto' : 'equity',
      sector: holding.ticker === 'PLTR' || holding.ticker === 'NVDA' ? 'Technology' : template.sector,
      over_max_position: share > max + 0.0005,
      fit,
      score: comparison(holding.ticker, weights),
    }
  })
  const over = analysed.filter((holding) => holding.over_max_position).map((holding) => holding.ticker)
  const held = new Set(holdings.map((holding) => holding.ticker))
  const suggestions = ['WM', 'UNP']
    .filter((ticker) => !held.has(ticker))
    .map((ticker) => {
      const ranking = comparison(ticker, weights)
      return {
        ticker,
        name: NAMES[ticker],
        sector: 'Industrials',
        asset_class: 'equity',
        score: ranking?.custom_score ?? null,
        ranking,
        verdict: 'compatible',
        reasons: [
          `Score StockLock de ${Math.round(ranking?.custom_score ?? 0)} sur 100.`,
          'Secteur « Industrie » absent du portefeuille : améliore la diversification.',
        ],
      }
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  return {
    ...PORTFOLIO_ROBERT,
    persona_id: persona,
    total_input_weight: total,
    holdings: analysed,
    diversification: {
      ...PORTFOLIO_ROBERT.diversification,
      max_position: max,
      positions_over_max: over,
      largest: [...analysed].sort((a, b) => b.weight - a.weight).slice(0, 3).map((holding) => ({ ticker: holding.ticker, weight: holding.weight, over_max: holding.over_max_position })),
    },
    findings: [
      ...over.map((ticker) => ({ severity: 'bloquant', message: `${ticker} dépasse la position maximale du profil.` })),
      { severity: 'ok', message: 'Volatilité du portefeuille de 11,2 %, sous le maximum du profil.' },
    ],
    suggestions: { source: 'score_table', message: null, items: suggestions },
    scoring: applied(weights, excluded),
  }
}

function reweight(body: Json): Json {
  const weights = normalise(body.weights as Record<string, number> | undefined)
  const tickers = ((body.tickers as string[] | undefined) ?? RANKED).filter((ticker) => SUB_SCORES[ticker])
  return {
    status: 'available',
    message: null,
    generated_at: '2026-11-15T06:00:00+00:00',
    applied: applied(weights),
    total: RANKED.length,
    items: tickers.map((ticker) => ({
      ...comparison(ticker, weights),
      symbol: ticker,
      date: '2026-11-13',
      comparison_set: 'Technology, 33 titres',
      sub_scores: SUBS.map((id, index) => ({
        id,
        label: id,
        score: SUB_SCORES[ticker][index],
        default_weight: DEFAULT_WEIGHTS[id],
        weight: weights[id],
        effective_weight: weights[id] / 100,
        contribution: (SUB_SCORES[ticker][index] * weights[id]) / 100,
        default_contribution: (SUB_SCORES[ticker][index] * DEFAULT_WEIGHTS[id]) / 100,
      })),
    })),
    missing: ((body.tickers as string[] | undefined) ?? []).filter((ticker) => !SUB_SCORES[ticker]),
  }
}

function simulate(body: Json): Json {
  const ticker = String(body.ticker)
  const weights = normalise(body.weights as Record<string, number> | undefined)
  if (!SUB_SCORES[ticker]) {
    return { status: 'available', message: `${ticker} ne figure pas dans la table des scores.`, symbol: ticker, applied: null, comparison: null, total: RANKED.length, curves: [] }
  }
  return {
    status: 'available',
    message: null,
    symbol: ticker,
    applied: applied(weights),
    comparison: comparison(ticker, weights),
    total: RANKED.length,
    curves: SUBS.map((id, index) => ({
      id,
      label: id,
      weight: weights[id],
      sub_score: SUB_SCORES[ticker][index],
      points: Array.from({ length: 21 }, (_, step) => {
        const moved = normalise({ ...weights, [id]: step * 5 })
        return { weight: step * 5, score: scoreOf(ticker, moved), rank: rankOf(ticker, moved) }
      }),
    })),
  }
}

// --- search and stock pages ----------------------------------------------------------------------

function search(query: string): Json {
  const q = query.trim().toLowerCase()
  const match = (ticker: string) => ticker.toLowerCase().includes(q) || (NAMES[ticker] ?? '').toLowerCase().includes(q)
  const listed = ['RY', 'RY.TO', 'RYN', 'NVDA', 'PLTR', 'AAPL', 'WM', 'UNP', 'XOM', 'SHOP', 'BITF'].filter(match)
  const crypto = [...CRYPTO].filter(match)
  return {
    query: q,
    total: listed.length,
    results: listed.map((ticker) => ({ ticker, name: NAMES[ticker], exchange: ticker.endsWith('.TO') ? 'TSX' : 'NYSE', country: ticker.endsWith('.TO') ? 'CA' : 'US' })),
    crypto: crypto.map((ticker) => ({ ticker, name: NAMES[ticker], exchange: 'Crypto', country: null, asset_class: 'crypto' })),
  }
}

const UNKNOWN_TICKER = /^(ZZZZ|INCONNU)/

function stock(ticker: string, range: string): { status?: number; body: unknown } {
  if (UNKNOWN_TICKER.test(ticker)) return { status: 404, body: { detail: `Titre inconnu : ${ticker}.` } }
  if (ticker === 'BTC-USD') return { body: BTC_1M }
  const base = range === '1Y' ? NVDA_1Y : NVDA_1M
  return { body: { ...base, ticker, name: NAMES[ticker] ?? ticker } }
}

const BIAS_RESULT = {
  analysis: {
    answer: 'Votre message évoque une **peur de manquer la hausse**. Point de vigilance : le profil de démonstration retient ses propres contraintes, à comparer avec l’intention exprimée. Ces éléments sont pédagogiques et ne constituent pas une recommandation d’achat, de vente ou de délai d’action.',
    sources: [{ id: 's1', title: 'Yahoo Finance, cours quotidiens', url: 'https://finance.yahoo.com/', as_of: '2026-11-13' }],
    assumptions: [],
    limits: ['Simulation éducative, pas un conseil financier personnalisé.'],
    governance: { passed: true, checks: [] },
  },
  signals: [{ category: 'fomo', excerpt: 'tout le monde en parle', method: 'lexique' }],
  profile_flags: ['Volatilité au-dessus du maximum du profil.'],
  history: null,
  hype: true,
  simulation: null,
  warnings: [],
}

// --- runs ----------------------------------------------------------------------------------------

function listRuns(url: URL): Json {
  if (url.searchParams.get('cursor')) return { runs: [], next_cursor: null, stored: true }
  const wanted = (key: string) => url.searchParams.get(key)
  const since = wanted('since')
  const runs = RUN_PAGE.runs.filter((run) => {
    const pipeline = wanted('pipeline')
    if (pipeline && !(run.pipeline === pipeline || (pipeline === 'lab' && run.pipeline.startsWith('lab.')))) return false
    if (wanted('persona') && run.persona_id !== wanted('persona')) return false
    if (wanted('status') && run.status !== wanted('status')) return false
    if (wanted('trigger') && run.trigger !== wanted('trigger')) return false
    // The fixtures' runs are dated 2026-11-14: a period that starts later holds none of them.
    return !since || new Date(run.started_at).getTime() >= new Date(since).getTime()
  })
  return { runs, next_cursor: null, stored: true }
}

const SCORE_RUNS: Record<string, unknown> = {
  [SCORE_RUN_SUCCEEDED.run_id]: SCORE_RUN_SUCCEEDED,
  [SCORE_RUN_TICKERS.run_id]: SCORE_RUN_TICKERS,
  [RUN_SCORE_PIPELINE.run_id]: { ...SCORE_RUN_RUNNING, run_id: RUN_SCORE_PIPELINE.run_id },
}

const NOT_FOUND = { status: 404, body: { detail: 'Introuvable.' } }

function answer(request: Request, url: URL, options: MockApiOptions, state: { started: Json[] }): { status?: number; body: unknown } {
  const path = url.pathname
  const method = request.method()
  const body = (): Json => (request.postDataJSON() ?? {}) as Json
  const tail = (prefix: string) => decodeURIComponent(path.slice(prefix.length))

  if (path === '/api/personas') return { body: PERSONAS }
  if (path === '/api/stocks') return { body: STOCKS }

  // Dashboard
  if (path === '/api/market/kpis') return { body: KPIS_SCORED }
  if (path === '/api/market/sections') return { body: SECTIONS[url.searchParams.get('persona') ?? ''] ?? SECTION_CATALOG }
  if (path.startsWith('/api/market/sections/')) {
    const found = section(tail('/api/market/sections/'), Number(url.searchParams.get('limit') ?? 24))
    return found ? { body: found } : NOT_FOUND
  }
  if (path === '/api/universe/search') return { body: search(url.searchParams.get('q') ?? '') }
  if (path === '/api/fit' && method === 'POST') {
    const { persona_id, tickers } = body() as { persona_id: string; tickers: string[] }
    return { body: { persona_id, items: tickers.map((ticker) => fitOf(ticker, persona_id)), missing: [] } }
  }
  if (path.startsWith('/api/fit/')) return { body: fitOf(tail('/api/fit/'), url.searchParams.get('persona') ?? 'amira') }
  if (path === '/api/hype' && method === 'POST') {
    const tickers = (body().tickers as string[]) ?? []
    return { body: { items: tickers.map((ticker) => (ticker === 'PLTR' ? HYPE_PLTR_HIGH : { ...HYPE_AAPL_LOW, ticker })), missing: [] } }
  }
  if (path.startsWith('/api/hype/')) {
    const ticker = tail('/api/hype/')
    return { body: ticker === 'PLTR' ? HYPE_PLTR_HIGH : { ...HYPE_AAPL_LOW, ticker } }
  }
  if (path.startsWith('/api/esg/')) {
    const ticker = tail('/api/esg/')
    return { body: CRYPTO.has(ticker) ? { ...ESG_NONE, ticker } : { ...ESG_AAPL, ticker } }
  }

  // Stock page
  if (path.startsWith('/api/stocks/')) return stock(tail('/api/stocks/'), url.searchParams.get('range') ?? '1M')
  if (path === '/api/scores/reweight') return { body: reweight(body()) }
  if (path === '/api/scores/simulate') return { body: simulate(body()) }
  if (path.startsWith('/api/scores/')) {
    const ticker = tail('/api/scores/')
    if (!SUB_SCORES[ticker]) return { body: SCORE_NOT_SCORED }
    return { body: { ...SCORE_AAPL, score: { ...SCORE_AAPL.score, symbol: ticker } } }
  }
  if (path === '/api/explain-move/stock') return { body: { ...NVDA_MOVES, ticker: String(body().ticker ?? 'NVDA') } }
  if (path === '/api/bias/stock') return { body: BIAS_RESULT }

  // Accounts
  if (path === '/api/accounts/rules') return { body: RULES }
  if (path === '/api/accounts/assets') return { body: ASSETS }
  if (path === '/api/accounts/projection') {
    const ticker = body().ticker as string | undefined
    return { body: ticker ? stockProjection(ticker, NAMES[ticker] ?? ticker) : PROJECTION }
  }

  // Portfolio
  if (path === '/api/portfolio/analyze') return { body: analyse(body()) }

  // Labo
  if (path === '/api/lab/pipelines') return { body: LAB_CATALOG }
  if (path === '/api/lab/groups') return { body: LAB_GROUPS }
  if (path === '/api/lab/run') return { body: { ...LAB_RUN, run_id: RUN_LAB.run_id } }
  if (path === '/api/lab/run-batch') {
    state.started.push(body())
    return { body: { ...LAB_BATCH_RUN, batch_id: RUN_BATCH.run_id } }
  }
  if (path === '/api/pipeline/score/runs') {
    if (method === 'POST') {
      state.started.push(body())
      if (options.scoreUnconfigured) return { status: 503, body: { detail: 'Pipeline de score non déployé.' } }
      if (options.scoreRunning) return { status: 409, body: { detail: 'Un run est déjà en cours.' } }
      return { status: 202, body: SCORE_RUN_TICKERS }
    }
    if (options.scoreUnconfigured) return { body: SCORE_RUN_LIST_UNCONFIGURED }
    return { body: SCORE_RUN_LIST }
  }
  if (path.startsWith('/api/pipeline/score/runs/')) {
    const run = SCORE_RUNS[tail('/api/pipeline/score/runs/')]
    return run ? { body: run } : NOT_FOUND
  }
  if (path === '/api/runs') return { body: listRuns(url) }
  const run = /^\/api\/runs\/([^/]+)(\/.*)?$/.exec(path)
  if (run) {
    const [, id, rest = ''] = run
    const details: Record<string, unknown> = { [RUN_LAB.run_id]: RUN_DETAIL_LAB, [RUN_BATCH.run_id]: RUN_DETAIL_BATCH }
    if (rest === '') return details[id] ? { body: details[id] } : NOT_FOUND
    if (!details[id] && !SCORE_RUNS[id]) return NOT_FOUND
    if (rest.startsWith('/stages/')) return { body: RUN_STAGE_LAB }
    if (rest === '/artifacts') return { body: { ...RUN_ARTIFACTS, run_id: id } }
    if (rest.startsWith('/artifacts/')) {
      const artifact = RUN_ARTIFACTS.artifacts.find((candidate) => candidate.id === decodeURIComponent(rest.slice('/artifacts/'.length)))
      return { body: { ...RUN_ARTIFACT_PREVIEW, artifact: artifact ?? RUN_ARTIFACT_PREVIEW.artifact } }
    }
  }
  return { status: 404, body: { detail: `E2E : aucune réponse prévue pour ${method} ${path}.` } }
}

export interface MockApi {
  /** Every request the page made to the API, in order. */
  calls: Array<{ method: string; path: string; body: Json | null }>
  /** Bodies of the runs started (score pipeline and Labo groups). */
  started: Json[]
}

/** Answers every API request of `page` from the fixtures. Call it before the first navigation. */
export async function mockApi(page: Page, options: MockApiOptions = {}): Promise<MockApi> {
  const api: MockApi = { calls: [], started: [] }
  await page.route(`${API_ORIGIN}/**`, async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors })
    let body: Json | null
    try {
      body = request.postDataJSON() as Json | null
    } catch {
      body = null
    }
    api.calls.push({ method: request.method(), path: url.pathname + url.search, body })
    const result = options.override?.(request, url) ?? answer(request, url, options, api)
    await route.fulfill({
      status: result.status ?? 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify(result.body),
    })
  })
  return api
}

/** An API that cannot be reached at all (the server is down). */
export async function unreachableApi(page: Page): Promise<void> {
  await page.route(`${API_ORIGIN}/**`, (route) => route.abort('connectionrefused'))
}
