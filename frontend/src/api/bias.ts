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

export function useStockBias() {
  return useMutation<BiasResult, ApiError, { persona_id: string; ticker: string; message: string; intent: BiasIntent }>({
    mutationFn: (input) => apiClient.request('/api/bias/stock', {
      method: 'POST', body: JSON.stringify(input),
    }),
  })
}
