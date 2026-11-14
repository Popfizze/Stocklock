import { useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

/*
 * Step 2 on a stock page (POST /api/explain-move/stock): why the title moved over
 * a period, compared with its index, and which dated events plausibly explain
 * each marked move (Fed and Bank of Canada decisions, SEC filings, articles).
 */

/** The last 3, 6 or 12 months up to the kit's last price, or the year 2022. */
export type MovesPeriod = '3m' | '6m' | '1y' | '2022'

/**
 * How a move is explained: a dated issuer or central-bank event judged a
 * plausible cause (`fait`), a possible but unproven link (`hypothese`), or
 * nothing that explains it (`aucun_evenement`).
 */
export type MoveExplanation = 'fait' | 'hypothese' | 'aucun_evenement'

export interface MoveEvent {
  id: string | null
  /** Date of the source (filing, article, announcement), `YYYY-MM-DD`. */
  date: string
  /** Date of the fact it reports (Claude Haiku may move it up to a week earlier). */
  event_date: string
  /** `8-K`, `10-Q`, `dividend`, `pic GDELT`, `article`, `décision BdC`, `décision Fed`, … */
  kind: string
  label: string
  summary: string
  /** `haiku` when Claude Haiku wrote the summary, `source` when it is the page's own text. */
  summary_by: string
  category: string | null
  /** Issuer or central-bank source rather than press coverage. */
  primary: boolean
  url: string | null
  source_id: string | null
}

export interface MarkedMove {
  date: string
  /** Day returns as ratios (0.05 = 5 %). */
  asset: number
  benchmark: number
  /** Return beyond what the index predicts. */
  abnormal: number
  z: number
  explanation: MoveExplanation
  /** `plausible`, `peu plausible`, `indéterminé`, `non jugé` or `aucun événement`. */
  verdict: string
  reason: string
  /** Word-for-word quote of the chosen event, empty without one. */
  excerpt: string
  /** `haiku` or `règle`. */
  judged_by: string
  /** The event the explanation rests on; `null` for `aucun_evenement`. */
  event: MoveEvent | null
  /** Every dated event of the move's day and the 3 days before. */
  events: MoveEvent[]
}

export interface AnalysisSource {
  id: string
  title: string
  url: string | null
  as_of: string | null
}

export interface StockMovesResult {
  analysis: {
    answer: string
    sources: AnalysisSource[]
    assumptions: string[]
    limits: string[]
    governance: { passed: boolean; checks: { name: string; passed: boolean; note: string }[] }
  }
  ticker: string
  name: string | null
  period: MovesPeriod
  window: { start: string; end: string }
  /** `SPY`, `QQQ` or `XIU.TO`. */
  benchmark: string | null
  /** `market_model` (beta over the year before) or `simple_diff`. */
  method: string | null
  /** Ratios over the window. */
  returns: { asset: number | null; benchmark: number | null; expected: number | null; abnormal: number | null }
  /** Daily standard deviation of the abnormal returns (a move is beyond 2 σ). */
  sigma: number | null
  /** `élevée`, `moyenne`, `faible` or `je ne peux pas conclure`. */
  confidence: string | null
  /** Cumulative return of the title and of its index since the window's start, ratios. */
  series: { date: string; asset: number | null; benchmark: number | null }[]
  /** Largest first. */
  moves: MarkedMove[]
  policy_events: { date: string; kind: string; label: string; url: string }[]
  profile_flags: string[]
  warnings: string[]
}

export const MOVES_QUERY_KEYS = {
  all: ['stock-moves'] as const,
  detail: (ticker: string, personaId: string, period: MovesPeriod) =>
    [...MOVES_QUERY_KEYS.all, ticker, personaId, period] as const,
}

/**
 * The step 2 analysis of a title for a profile and a period. It reads web pages
 * and calls Claude, so it only runs once `enabled` (the user asked for it), is
 * not retried, and stays cached for the session.
 */
export function useStockMoves(ticker: string, personaId: string, period: MovesPeriod, enabled: boolean) {
  return useQuery<StockMovesResult, ApiError>({
    queryKey: MOVES_QUERY_KEYS.detail(ticker, personaId, period),
    queryFn: () =>
      apiClient.request('/api/explain-move/stock', {
        method: 'POST',
        body: JSON.stringify({ persona_id: personaId, ticker, period }),
      }),
    enabled,
    retry: false,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  })
}
