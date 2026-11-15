import { useMutation } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

export interface BiasResult {
  analysis: {
    answer: string
    sources: { id: string; title: string; url: string | null; as_of: string | null }[]
    assumptions: string[]
    limits: string[]
    governance: { passed: boolean; checks: { name: string; passed: boolean; note: string }[] }
  }
  signals: { category: string; excerpt: string; method: string }[]
  profile_flags: string[]
  history: { start: string; end: string; return_20d: number; volume_ratio: number | null;
    year_start: string; year_end: string; from_year_high: number | null; source?: 'starter' | 'yfinance' } | null
  hype: boolean | null
  simulation: { ticker: string; start: string; end: string; sell_date: string | null;
    initial: number; hold_final: number; panic_final: number;
    points: { date: string; hold: number; panic: number }[] } | null
  warnings: string[]
}

export type BiasIntent = 'buy' | 'sell' | 'undecided'

export type BiasRunStageStatus = 'pending' | 'active' | 'done' | 'error'

export interface BiasRunProgress {
  run_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  stages: { id: string; name: string; status: BiasRunStageStatus }[]
  result?: BiasResult
  error?: string
}

type BiasInput = { persona_id: string; ticker: string; message: string; intent: BiasIntent }

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

function isBiasResult(value: BiasRunProgress | BiasResult): value is BiasResult {
  return 'analysis' in value
}

async function runStockBias(input: BiasInput, onProgress?: (progress: BiasRunProgress) => void): Promise<BiasResult> {
  // The temporary fallback keeps older API deployments and isolated UI tests working during rollout.
  const started = await apiClient.request<BiasRunProgress | BiasResult>('/api/bias/stock/runs', {
    method: 'POST', body: JSON.stringify(input),
  })
  if (isBiasResult(started)) return started
  onProgress?.(started)

  while (true) {
    await wait(300)
    const progress = await apiClient.request<BiasRunProgress>(`/api/bias/stock/runs/${started.run_id}`)
    onProgress?.(progress)
    if (progress.status === 'completed' && progress.result) return progress.result
    if (progress.status === 'failed') {
      throw { message: progress.error ?? 'Impossible de terminer l’analyse.', status: 503 } satisfies ApiError
    }
  }
}

export function useStockBias(onProgress?: (progress: BiasRunProgress) => void) {
  return useMutation<BiasResult, ApiError, { persona_id: string; ticker: string; message: string; intent: BiasIntent }>({
    mutationFn: (input) => runStockBias(input, onProgress),
  })
}
