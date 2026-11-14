import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

/*
 * The score pipeline on AWS (Labo button « Lancer le pipeline de score »):
 * a Step Functions run, Bronze → Silver → Gold, that rebuilds the gold
 * table `score_par_titre` read by the stock pages and the dashboard.
 *
 *   POST /api/pipeline/score/runs            start a run (202); 409 while one runs; 503 when not deployed;
 *                                            422 for a bad group (unknown section or sector, malformed
 *                                            tickers, more than 100, or no requested ticker in the universe)
 *   GET  /api/pipeline/score/runs            the 20 most recent runs (without stage detail), group options
 *   GET  /api/pipeline/score/runs/{run_id}   one run with its stages, decisions and samples
 */

// --- Shapes ----------------------------------------------------------------------

/** Body of POST /api/pipeline/score/runs; every field is optional (defaults below). */
export interface ScoreRunParams {
  /** Titles scored, the most valuable first (5 to 600, default 200). */
  max_titles: number
  /** Share of Canadian (TSX) stocks among the stocks (default 0.3). */
  ca_share: number
  /** Share of ETFs among the titles (default 0.1). */
  etf_share: number
  /** Most news articles kept per title (default 6). */
  news_per_title: number
  /** Most articles sent to Claude Haiku on Bedrock in a run (default 1200). */
  max_llm_articles: number
}

/**
 * Which titles a run scores (`group` of the POST body; `auto` when absent):
 * - `auto`: the most valuable titles, US / TSX / ETF (the fields above are its settings);
 * - `tickers`: up to 100 Yahoo symbols (`AAPL`, `RY.TO`, `BRK-B`; `BRK.B` and a bare TSX root are matched);
 * - `section`: a dashboard section resolved live on the server (`limit` titles, 30 by default);
 * - `sector`: a Yahoo sector of the live universe, largest capitalisations first (50 by default).
 */
export type ScoreRunGroup =
  | { kind: 'auto'; max_titles?: number; ca_share?: number; etf_share?: number }
  | { kind: 'tickers'; tickers: string[] }
  | { kind: 'section'; id: string; limit?: number }
  | { kind: 'sector'; name: string; max_titles?: number; ca_share?: number }

export type ScoreRunGroupKind = ScoreRunGroup['kind']

/** Body of POST /api/pipeline/score/runs: the first contract's fields plus an optional group. */
export interface ScoreRunRequest extends Partial<ScoreRunParams> {
  group?: ScoreRunGroup
}

/** A title of the group that was not scored, and why (« aucune séance depuis 10 jours ou volume nul »). */
export interface ScoreRunExclusion {
  symbol: string
  reason: string
}

/**
 * How the group was resolved. Before the « Univers » stage only `kind`, `label`, `requested` and the
 * tickers already known to be unknown (`unknown`, `aliases`) are set; `resolved` is then null.
 */
export interface ScoreRunGroupResolution {
  kind: ScoreRunGroupKind
  /** « 5 titres choisis », « Section « Les plus populaires » (30 titres au plus) », « Secteur Énergie (…) » */
  label: string
  /** The tickers as asked (`tickers` groups only). */
  requested: string[] | null
  /** The symbols actually scored, in the group's order. */
  resolved: string[] | null
  /** Asked but absent from the SEC/TMX universe: reported, never silently dropped. */
  unknown: string[]
  /** How an asked symbol was read: `{ "BRK.B": "BRK-B" }`. */
  aliases: Record<string, string>
  excluded: ScoreRunExclusion[]
  /** How ranks were computed (a small group is ranked with the latest gold table's other titles). */
  comparison: string | null
}

export interface ScoreGroupOptions {
  /** Dashboard sections a group can take (`meilleurs-scores` reads the latest gold table). */
  sections: Array<{ id: string; title: string }>
  /** Yahoo sector names (sent as `name`) and their French labels. */
  sectors: Array<{ name: string; label: string }>
  max_tickers: number
}

export type ScoreRunStatus = 'running' | 'succeeded' | 'failed'
export type ScoreStageStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type ScoreLayer = 'bronze' | 'silver' | 'gold'

/** `bronze_titres`, `silver_univers`, `bronze_releves`, `bronze_cours`, `bronze_articles`,
 * `silver_releves`, `silver_cours`, `silver_evenements`, `gold` — in this order. */
export type ScoreStageId =
  | 'bronze_titres'
  | 'silver_univers'
  | 'bronze_releves'
  | 'bronze_cours'
  | 'bronze_articles'
  | 'silver_releves'
  | 'silver_cours'
  | 'silver_evenements'
  | 'gold'

/** A choice the stage made, in French. `count` is the number of rows or titles concerned. */
export interface ScoreDecision {
  kind: 'source' | 'fallback' | 'filter' | 'missing' | 'parameter' | 'info'
  message: string
  count: number | null
}

export type ScoreSampleCell = string | number | boolean | null

/** The first rows (8 at most) of a dataset the stage wrote. */
export interface ScoreDatasetSample {
  /** `titres_bruts`, `univers`, `releves_normalises`, `score_par_titre`, … */
  dataset: string
  columns: string[]
  rows: ScoreSampleCell[][]
  /** Rows in the whole dataset. */
  total_rows: number
}

export interface ScoreStageSource {
  id: string
  title: string
  url: string
}

export interface ScoreRunStage {
  id: ScoreStageId
  layer: ScoreLayer
  /** « Liste des titres », « Univers », « Relevés financiers », … */
  label: string
  status: ScoreStageStatus
  started_at: string | null
  finished_at: string | null
  duration_s: number | null
  /** Row counts by dataset or source, e.g. `{ "univers": 200, "univers_action": 180 }`. */
  rows: Record<string, number>
  decisions: ScoreDecision[]
  samples: ScoreDatasetSample[]
  warnings: string[]
  /** S3 keys written (`score/silver/univers/2026-11-14/<run_id>/univers.csv`). */
  outputs: string[]
  /** e.g. `bedrock_calls`, `input_tokens`, `titles_scored`, `gdelt_calls`. */
  metrics: Record<string, number | string | null | Array<Record<string, number | string | boolean>>>
  sources: ScoreStageSource[]
  error: string | null
}

export interface ScoreRunSummary {
  titles_selected: number | null
  titles_scored: number | null
  partial: number | null
  /** `score/gold/score_par_titre/latest.json` */
  table_key: string | null
  bedrock_calls: number | null
  bedrock_input_tokens: number | null
  bedrock_output_tokens: number | null
  /** The five best scores of the run. */
  top: Array<{ symbol: string; score: number; partiel: boolean }> | null
  /** Rows of the merged gold table after the run (this run's rows + the other titles' latest rows). */
  table_rows?: number | null
  comparison?: string | null
  group?: ScoreRunGroupResolution | null
}

export interface ScoreRunError {
  error: string
  message: string
}

/** A run as listed (GET /runs): no stage detail. */
export interface ScoreRunInfo {
  run_id: string
  status: ScoreRunStatus
  trigger: 'api' | 'schedule' | 'local'
  /** Date of the data (`YYYY-MM-DD`, Toronto); null until the run's first stage. */
  date: string | null
  /** The run's parameters; for a non-auto group, `max_titles` is the requested size and the shares are 0
   * when they do not apply. The server also echoes `params.group`. */
  params: ScoreRunParams
  /** Which titles the run covers and how they were resolved. */
  group?: ScoreRunGroupResolution
  started_at: string | null
  finished_at: string | null
  duration_s: number | null
  /** Id of the stage running now, when known (detail only). */
  current_stage: ScoreStageId | null
  /** Set once the run has ended. */
  summary: ScoreRunSummary | null
  error: ScoreRunError | null
}

/** A run with its stages (GET /runs/{run_id}, POST /runs). */
export interface ScoreRun extends ScoreRunInfo {
  stages: ScoreRunStage[]
}

export interface ScoreStageDef {
  id: ScoreStageId
  layer: ScoreLayer
  label: string
  datasets: string[]
  description: string
}

export interface ScoreRunList {
  /** False when the pipeline is not deployed where the API runs (local dev): no runs, no button. */
  configured: boolean
  stages: ScoreStageDef[]
  /** What a group can be made of (sections, sectors, ticker cap). */
  group_options?: ScoreGroupOptions
  runs: ScoreRunInfo[]
}

// --- Hooks -------------------------------------------------------------------------

export const SCORE_PIPELINE_QUERY_KEYS = {
  all: ['score-pipeline'] as const,
  runs: () => [...SCORE_PIPELINE_QUERY_KEYS.all, 'runs'] as const,
  run: (runId: string) => [...SCORE_PIPELINE_QUERY_KEYS.all, 'run', runId] as const,
}

/** Poll period while a run is going (a run lasts several minutes). */
export const SCORE_RUN_POLL_MS = 5000

/** Recent runs; polled while one of them is running. */
export function useScoreRuns() {
  return useQuery<ScoreRunList, ApiError>({
    queryKey: SCORE_PIPELINE_QUERY_KEYS.runs(),
    queryFn: () => apiClient.request<ScoreRunList>('/api/pipeline/score/runs'),
    refetchInterval: (query) =>
      query.state.data?.runs.some((run) => run.status === 'running') ? SCORE_RUN_POLL_MS : false,
  })
}

/** One run with its stages; polled until it has succeeded or failed. Idle without a run id. */
export function useScoreRun(runId: string | null) {
  return useQuery<ScoreRun, ApiError>({
    queryKey: SCORE_PIPELINE_QUERY_KEYS.run(runId ?? ''),
    queryFn: () =>
      apiClient.request<ScoreRun>(`/api/pipeline/score/runs/${encodeURIComponent(runId ?? '')}`),
    enabled: Boolean(runId),
    refetchInterval: (query) =>
      query.state.data === undefined || query.state.data.status === 'running'
        ? SCORE_RUN_POLL_MS
        : false,
  })
}

/**
 * Starts a run; the run comes back at once (`running`, stages `pending`). 409: one is running.
 * Without `group` the run makes its own selection (`auto`), e.g. `{ group: { kind: 'tickers',
 * tickers: ['AAPL', 'RY.TO'] } }` scores two titles and merges them into the gold table.
 */
export function useStartScoreRun() {
  const queryClient = useQueryClient()
  return useMutation<ScoreRun, ApiError, ScoreRunRequest | void>({
    mutationFn: (params) =>
      apiClient.request<ScoreRun>('/api/pipeline/score/runs', {
        method: 'POST',
        body: JSON.stringify(params ?? {}),
      }),
    onSuccess: (run) => {
      queryClient.setQueryData(SCORE_PIPELINE_QUERY_KEYS.run(run.run_id), run)
      void queryClient.invalidateQueries({ queryKey: SCORE_PIPELINE_QUERY_KEYS.runs() })
    },
  })
}
