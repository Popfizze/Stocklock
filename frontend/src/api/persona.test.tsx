import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import {
  ESG_AAPL,
  FIT_BATCH_ROBERT,
  FIT_PLTR_ROBERT,
  HYPE_PLTR_HIGH,
  PORTFOLIO_ROBERT,
  SECTIONS_AMIRA,
} from '@/test/persona'
import { EXAMPLE_PORTFOLIOS } from '@/lib/example-portfolios'
import {
  batchTickers,
  fitByTicker,
  useEsg,
  useFit,
  useFitBatch,
  useHype,
  usePortfolioAnalysis,
} from './persona'
import { useMarketSections } from './stocks'

const ORIGINAL_FETCH = globalThis.fetch

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('profile API hooks', () => {
  it('reads the fit of one title for the active profile, idle without a profile', async () => {
    const calls = mockFetchByUrl([{ match: '/api/fit/PLTR', responses: [json(FIT_PLTR_ROBERT)] }])
    const idle = renderHook(() => useFit('PLTR', null), { wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')

    const { result } = renderHook(() => useFit('PLTR', 'robert'), { wrapper })
    await waitFor(() => expect(result.current.data?.verdict).toBe('hors_profil'))
    expect(calls[0].url).toMatch(/\/api\/fit\/PLTR\?persona=robert$/)
    expect(result.current.data?.hype?.level).toBe('eleve')
  })

  it('posts unique upper-case symbols for the cards and indexes the answer by symbol', async () => {
    const calls = mockFetchByUrl([{ match: /\/api\/fit$/, responses: [json(FIT_BATCH_ROBERT)] }])
    const { result } = renderHook(() => useFitBatch('robert', ['nvda', 'RY.TO', 'NVDA', ' ']), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ persona_id: 'robert', tickers: ['NVDA', 'RY.TO'] })
    expect(fitByTicker(result.current.data)['RY.TO'].verdict).toBe('compatible')
    expect(batchTickers(Array.from({ length: 150 }, (_, i) => `T${i}`))).toHaveLength(100)
  })

  it('reads hype and ESG by encoded symbol', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/hype/', responses: [json(HYPE_PLTR_HIGH)] },
      { match: '/api/esg/', responses: [json(ESG_AAPL)] },
    ])
    const hype = renderHook(() => useHype('BRK-B'), { wrapper })
    await waitFor(() => expect(hype.result.current.data?.points).toBe(5))
    const esg = renderHook(() => useEsg('RY.TO'), { wrapper })
    await waitFor(() => expect(esg.result.current.data?.esg?.risk_category).toBe('faible'))
    expect(calls.map((c) => c.url.replace(/^.*\/api/, '/api'))).toEqual(['/api/hype/BRK-B', '/api/esg/RY.TO'])
  })

  it('analyses the example portfolio of a profile', async () => {
    const calls = mockFetchByUrl([{ match: '/api/portfolio/analyze', responses: [json(PORTFOLIO_ROBERT)] }])
    const { result } = renderHook(() => usePortfolioAnalysis('robert', EXAMPLE_PORTFOLIOS.robert), {
      wrapper,
    })
    await waitFor(() => expect(result.current.data?.diversification.positions_over_max).toEqual(['PLTR']))
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.persona_id).toBe('robert')
    expect(body.holdings).toHaveLength(EXAMPLE_PORTFOLIOS.robert.length)
    const empty = renderHook(() => usePortfolioAnalysis('robert', []), { wrapper })
    expect(empty.result.current.fetchStatus).toBe('idle')
  })

  it('asks for the profile sections first when a profile is active', async () => {
    const calls = mockFetchByUrl([{ match: '/api/market/sections?persona=amira', responses: [json(SECTIONS_AMIRA)] }])
    const { result } = renderHook(() => useMarketSections('amira'), { wrapper })
    await waitFor(() => expect(result.current.data?.[0].id).toBe('ia-semis'))
    expect(result.current.data?.[0].persona_reason).toMatch(/Amira/)
    expect(calls).toHaveLength(1)
  })
})
