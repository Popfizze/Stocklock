import { useMemo } from 'react'
import type { ApiError } from '@/api/client'
import { useLabPipelines } from '@/api/lab'
import { useScoreRun } from '@/api/pipeline'
import { useRun } from '@/api/runs'
import { stepOf, viewFromRegistry, viewFromScore, type RunView } from './runView'

export interface RunViewState {
  view: RunView | null
  isLoading: boolean
  error: ApiError | null
}

/**
 * A run by id. The registry knows every pipeline; a score pipeline run is then read from its
 * own record (live stages, decisions, samples), which is also where it is looked for when the
 * registry does not know the id.
 */
export function useRunView(runId: string | null): RunViewState {
  const registry = useRun(runId)
  const isScore = registry.data?.pipeline === 'score_pipeline' || registry.isError
  const score = useScoreRun(isScore ? runId : null)
  const catalog = useLabPipelines()

  return useMemo(() => {
    if (score.data) return { view: viewFromScore(score.data, registry.data ?? null), isLoading: false, error: null }
    if (registry.data) {
      // A score run whose own record is still loading: wait for it rather than flash the summary.
      if (isScore && score.isPending) return { view: null, isLoading: true, error: null }
      const step = catalog.data?.steps.find((candidate) => candidate.id === stepOf(registry.data.pipeline))
      return { view: viewFromRegistry(registry.data, step?.stages), isLoading: false, error: null }
    }
    if (registry.isError && score.isError) return { view: null, isLoading: false, error: registry.error }
    return { view: null, isLoading: runId !== null, error: null }
  }, [runId, registry.data, registry.isError, registry.error, score.data, score.isPending, score.isError, isScore, catalog.data])
}
