import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import {
  ONE_V_1M,
  SCORE_ABSENT,
  SCORE_AAPL,
  SEARCH_RY,
  SECTION_BEST_EMPTY,
  SECTION_CATALOG,
  SECTION_POPULAIRES,
} from '@/test/stocks'
import {
  useMarketSection,
  useMarketSections,
  useStock,
  useStockScore,
  useUniverseSearch,
} from './stocks'

const ORIGINAL_FETCH = globalThis.fetch

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('stock API hooks', () => {
  it('searches the universe only once there is a query, encoded', async () => {
    const calls = mockFetchByUrl([{ match: '/api/universe/search', responses: [json(SEARCH_RY)] }])
    const idle = renderHook(() => useUniverseSearch('   '), { wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')

    const { result } = renderHook(() => useUniverseSearch(' brk.b & co '), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toMatch(/\/api\/universe\/search\?q=brk\.b%20%26%20co&limit=12$/)
  })

  it('loads the section catalog, then each section with its limit', async () => {
    const calls = mockFetchByUrl([
      { match: /\/api\/market\/sections$/, responses: [json(SECTION_CATALOG)] },
      { match: '/api/market/sections/populaires', responses: [json(SECTION_POPULAIRES)] },
      { match: '/api/market/sections/meilleurs-scores', responses: [json(SECTION_BEST_EMPTY)] },
    ])
    const catalog = renderHook(() => useMarketSections(), { wrapper })
    await waitFor(() => expect(catalog.result.current.data?.map((s) => s.id)).toContain('populaires'))

    const popular = renderHook(() => useMarketSection('populaires', 48), { wrapper })
    await waitFor(() => expect(popular.result.current.data?.items).toHaveLength(3))
    expect(calls.some((call) => call.url.endsWith('/api/market/sections/populaires?limit=48'))).toBe(true)

    const best = renderHook(() => useMarketSection('meilleurs-scores'), { wrapper })
    await waitFor(() => expect(best.result.current.data?.status).toBe('empty'))
    expect(best.result.current.data?.message).toMatch(/pipeline/)
    expect(calls.some((call) => call.url.endsWith('/api/market/sections/meilleurs-scores?limit=24'))).toBe(
      true,
    )
  })

  it('reads a stock page and its score by encoded symbol', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/stocks/ONE.V?range=3M', responses: [json(ONE_V_1M)] },
      { match: '/api/scores/AAPL', responses: [json(SCORE_AAPL)] },
      { match: '/api/scores/ONE.V', responses: [json(SCORE_ABSENT)] },
    ])
    const stock = renderHook(() => useStock('ONE.V', '3M'), { wrapper })
    await waitFor(() => expect(stock.result.current.data?.starter_kit).toBe(false))

    const scored = renderHook(() => useStockScore('AAPL'), { wrapper })
    await waitFor(() => expect(scored.result.current.data?.status).toBe('available'))
    const row = scored.result.current.data?.score
    const total = row?.sub_scores.reduce((sum, sub) => sum + sub.contribution, 0) ?? 0
    expect(total).toBeCloseTo(row?.score ?? -1, 6)

    const absent = renderHook(() => useStockScore('ONE.V'), { wrapper })
    await waitFor(() => expect(absent.result.current.data?.status).toBe('absent'))
    expect(absent.result.current.data?.score).toBeNull()
    expect(calls.map((call) => call.url.replace(/^.*\/api/, '/api'))).toEqual([
      '/api/stocks/ONE.V?range=3M',
      '/api/scores/AAPL',
      '/api/scores/ONE.V',
    ])
  })
})
