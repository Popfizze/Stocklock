import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import {
  PORTFOLIO_ROBERT_CUSTOM,
  REWEIGHT_ROBERT,
  SIMULATION_AAPL_ROBERT,
  WEIGHTS_ROBERT,
} from '@/test/scoring'
import { EXAMPLE_PORTFOLIOS } from '@/lib/example-portfolios'
import { usePortfolioAnalysis } from './persona'
import {
  DEFAULT_SCORE_WEIGHTS,
  isDefaultScoring,
  normaliseWeights,
  scoringBody,
  useReweight,
  useScoreSimulation,
} from './scoring'

const ORIGINAL_FETCH = globalThis.fetch

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('custom score helpers', () => {
  it('normalises weights to 100 and recognises the default method', () => {
    const weights = normaliseWeights({ rentabilite: 50, solidite: 50, croissance: 0, valorisation: 0,
      momentum_risque: 0, evenements: 0 })
    expect(weights.rentabilite).toBe(50)
    expect(normaliseWeights({ evenements: 20 }).evenements).toBeCloseTo((20 / 110) * 100)
    expect(isDefaultScoring(undefined)).toBe(true)
    expect(isDefaultScoring({ weights: { rentabilite: 50, solidite: 40, croissance: 30, valorisation: 30,
      momentum_risque: 30, evenements: 20 } })).toBe(true)
    expect(isDefaultScoring(WEIGHTS_ROBERT)).toBe(false)
    expect(scoringBody({ weights: DEFAULT_SCORE_WEIGHTS })).toEqual({})
  })
})

describe('custom score hooks', () => {
  it('posts the normalised choice and keeps the stable body as the key', async () => {
    const calls = mockFetchByUrl([{ match: '/api/scores/reweight', responses: [json(REWEIGHT_ROBERT)] }])
    const { result } = renderHook(() => useReweight({ ...WEIGHTS_ROBERT, tickers: ['AAPL', 'ZZZZ'] }), { wrapper })
    await waitFor(() => expect(result.current.data?.items[0].rank_change).toBe(2))
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.weights.solidite).toBe(35)
    expect(body.factors).toEqual({ excluded_indicators: ['momentum_12_1'] })
    expect(body.tickers).toEqual(['AAPL', 'ZZZZ'])
    const idle = renderHook(() => useReweight(null), { wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  it('simulates one title along each slider', async () => {
    const calls = mockFetchByUrl([{ match: '/api/scores/simulate', responses: [json(SIMULATION_AAPL_ROBERT)] }])
    const { result } = renderHook(() => useScoreSimulation('AAPL', WEIGHTS_ROBERT), { wrapper })
    await waitFor(() => expect(result.current.data?.curves).toHaveLength(6))
    expect(JSON.parse(String(calls[0].init.body)).ticker).toBe('AAPL')
    expect(renderHook(() => useScoreSimulation(null), { wrapper }).result.current.fetchStatus).toBe('idle')
  })

  it('sends the custom weights with the portfolio, and nothing extra for the default method', async () => {
    const calls = mockFetchByUrl([{ match: '/api/portfolio/analyze', responses: [json(PORTFOLIO_ROBERT_CUSTOM)] }])
    const custom = renderHook(() => usePortfolioAnalysis('robert', EXAMPLE_PORTFOLIOS.robert, WEIGHTS_ROBERT), {
      wrapper,
    })
    await waitFor(() => expect(custom.result.current.data?.scoring.custom).toBe(true))
    expect(JSON.parse(String(calls[0].init.body)).weights.momentum_risque).toBe(20)
    const plain = renderHook(() => usePortfolioAnalysis('robert', EXAMPLE_PORTFOLIOS.robert), { wrapper })
    await waitFor(() => expect(plain.result.current.isSuccess).toBe(true))
    expect(JSON.parse(String(calls[1].init.body)).weights).toBeUndefined()
  })
})
