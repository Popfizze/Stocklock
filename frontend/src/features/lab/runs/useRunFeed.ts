import { useMemo } from 'react'
import type { ApiError } from '@/api/client'
import { useScoreRuns } from '@/api/pipeline'
import { useRuns, type RunFilters, type RunSummary } from '@/api/runs'
import { matchesFilters, summaryFromScoreRun } from './runModel'

export interface RunFeed {
  runs: RunSummary[]
  isLoading: boolean
  error: ApiError | null
  /** `registry`: every pipeline's runs; `score`: only the score pipeline's own records (registry not available). */
  source: 'registry' | 'score'
  hasMore: boolean
  loadMore: () => void
  isLoadingMore: boolean
}

/**
 * Every run, newest first, from the run registry. Where the registry is not available (an API
 * older than the registry, or one without a data bucket), the score pipeline's own records are
 * listed instead, so the console is never empty for a reason the visitor cannot act on.
 */
export function useRunFeed(filters: RunFilters): RunFeed {
  const registry = useRuns(filters)
  const stored = registry.data?.pages[0]?.stored !== false
  const useFallback = registry.isError || !stored
  const score = useScoreRuns()

  return useMemo(() => {
    if (!useFallback) {
      return {
        runs: registry.data?.pages.flatMap((page) => page.runs) ?? [],
        isLoading: registry.isPending,
        error: null,
        source: 'registry',
        hasMore: registry.hasNextPage,
        loadMore: () => void registry.fetchNextPage(),
        isLoadingMore: registry.isFetchingNextPage,
      }
    }
    const runs = (score.data?.runs ?? []).map(summaryFromScoreRun).filter((run) => matchesFilters(run, filters))
    return {
      runs,
      isLoading: score.isPending,
      // Without the registry, an unreachable server is the error worth showing.
      error: score.isError ? score.error : null,
      source: 'score',
      hasMore: false,
      loadMore: () => {},
      isLoadingMore: false,
    }
  }, [useFallback, registry, score, filters])
}
