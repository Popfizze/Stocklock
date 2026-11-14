import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import {
  SCORE_RUN_LIST,
  SCORE_RUN_LIST_UNCONFIGURED,
  SCORE_RUN_RUNNING,
  SCORE_RUN_SUCCEEDED,
  SCORE_RUN_TICKERS,
} from '@/test/pipeline'
import { useScoreRun, useScoreRuns, useStartScoreRun, type ScoreRun } from './pipeline'

const ORIGINAL_FETCH = globalThis.fetch

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('score pipeline API hooks', () => {
  it('lists the recent runs and says when the pipeline is not deployed', async () => {
    mockFetchByUrl([{ match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_LIST_UNCONFIGURED)] }])
    const { result } = renderHook(() => useScoreRuns(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.configured).toBe(false)
    expect(result.current.data?.stages).toHaveLength(9)
    expect(result.current.data?.group_options?.max_tickers).toBe(100)
  })

  it('fetches one run by its encoded id and stays idle without one', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/pipeline/score/runs/', responses: [json(SCORE_RUN_SUCCEEDED)] },
    ])
    const idle = renderHook(() => useScoreRun(null), { wrapper })
    expect(idle.result.current.fetchStatus).toBe('idle')
    const { result } = renderHook(() => useScoreRun(SCORE_RUN_SUCCEEDED.run_id), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(calls[0].url).toContain(`/api/pipeline/score/runs/${SCORE_RUN_SUCCEEDED.run_id}`)
    expect(result.current.data?.summary?.titles_scored).toBe(15)
  })

  it('starts a run on a group of tickers', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/pipeline/score/runs', responses: [json(SCORE_RUN_TICKERS, 202)] },
    ])
    const { result } = renderHook(() => useStartScoreRun(), { wrapper })
    let run: ScoreRun | undefined
    await act(async () => {
      run = await result.current.mutateAsync({ group: { kind: 'tickers', tickers: ['AAPL', 'RY.TO'] } })
    })
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      group: { kind: 'tickers', tickers: ['AAPL', 'RY.TO'] },
    })
    expect(run?.group?.unknown).toEqual(['ZZZZ'])
    expect(run?.summary?.table_rows).toBe(201)
  })

  it('starts a run with its parameters and surfaces a 409 as an ApiError', async () => {
    const calls = mockFetchByUrl([
      {
        match: '/api/pipeline/score/runs',
        responses: [
          json(SCORE_RUN_RUNNING, 202),
          json({ detail: 'Une exécution du pipeline de score est déjà en cours' }, 409),
          json(SCORE_RUN_LIST),
        ],
      },
    ])
    const { result } = renderHook(() => useStartScoreRun(), { wrapper })
    await act(async () => {
      await result.current.mutateAsync({ max_titles: 25 })
    })
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ max_titles: 25 })
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toMatchObject({ status: 409 })
    })
  })
})
