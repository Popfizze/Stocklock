import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'
import { RUNS_QUERY_KEYS } from './runs'

// --- Catalog: GET /api/lab/pipelines ---------------------------------------

export type LabInputType = 'text' | 'textarea' | 'date' | 'number' | 'tickers' | 'boolean'

/** A single option or choice value. */
export type LabScalar = string | number | boolean | null

/** An input value: a scalar, or a list of tickers. */
export type LabInputValue = LabScalar | string[]

export interface LabInput {
  name: string
  label: string
  type: LabInputType
  default: LabInputValue
  help?: string
}

export interface LabChoice {
  value: LabScalar
  label: string
}

export interface LabOption {
  key: string
  label: string
  description?: string
  choices: LabChoice[]
  default: LabScalar
  lab_default?: LabScalar
}

/** Where a stage sits in the Labo's diagram (Entrées → Bronze → Silver → Gold → Sortie). */
export type LabLayer = 'bronze' | 'silver' | 'gold' | 'sortie'

export interface LabStageDef {
  id: string
  name: string
  description: string
  /** `bronze`: raw data fetched; `silver`: cleaned, derived; `gold`: the computed result; `sortie`: narration, governance. */
  layer: LabLayer
  options: LabOption[]
}

export interface LabStep {
  id: string
  label: string
  inputs: LabInput[]
  stages: LabStageDef[]
  /** True when the step runs per title, so on a group with POST /api/lab/run-batch (not `tax`). */
  group_runnable: boolean
  /** The input the server sets for each title of a group (`ticker`); null when not group-runnable. */
  group_input: string | null
}

export interface LabCatalog {
  steps: LabStep[]
}

// --- Run: POST /api/lab/run -------------------------------------------------

export interface LabRunRequest {
  step: string
  persona_id: string
  inputs: Record<string, LabInputValue>
  /** Keyed `"<stage_id>.<key>"`. */
  options: Record<string, LabScalar>
}

export interface LabSource {
  id: string
  title: string
  url?: string
  as_of?: string
}

export type LabStageStatus = 'ok' | 'warning' | 'error' | 'skipped'

export type LabCell = string | number | null

export interface LabPreview {
  columns: string[]
  rows: LabCell[][]
}

/**
 * A complete table a stage fetched or produced: every column, and every row
 * unless the response had to be cut to stay under the Lambda size limit
 * (then `truncated` is true and `rows.length < total_rows`; columns are never cut).
 * Booleans arrive as "oui"/"non", dates as "YYYY-MM-DD", lists and objects as JSON text.
 */
export interface LabDataset {
  /** Unique within its stage, e.g. `prices_AAPL`, `edgar_facts`. */
  id: string
  title: string
  /** Resolves in the stage's `sources`, else in `result.sources`; null for tables StockLock computed. */
  source_id: string | null
  columns: string[]
  rows: LabCell[][]
  /** Rows the dataset really has, before any cut. */
  total_rows: number
  truncated: boolean
}

/** A branch the stage took, recorded where it happened: question → answer, and why. */
export interface LabDecision {
  question: string
  answer: LabCell
  reason: string
  /** The option, threshold or formula applied, e.g. `option source = starter`. */
  rule?: string
  /** The values that decided, by name. */
  inputs?: Record<string, LabCell>
}

export interface LabStageResult {
  id: string
  name: string
  status: LabStageStatus
  duration_ms: number
  options_used: Record<string, LabScalar>
  metrics: Record<string, number | string>
  preview: LabPreview | null
  warnings: string[]
  sources: LabSource[]
  /** Optional on the client: absent from responses of a backend older than this contract. */
  decisions?: LabDecision[]
  datasets?: LabDataset[]
}

export interface LabFactor {
  name: string
  value: number | string
  unit?: string
  effect?: string
  source_id?: string
}

export interface LabGovernanceCheck {
  name: string
  passed: boolean
  note: string
}

export interface LabResult {
  answer: string
  factors: LabFactor[]
  sources: LabSource[]
  assumptions: string[]
  limits: string[]
  trace: string[]
  governance: {
    passed: boolean
    checks: LabGovernanceCheck[]
  }
}

export interface LabRunResponse {
  /** Also the run's id in the registry: GET /api/runs/{run_id}. */
  run_id: string
  step: string
  duration_ms: number
  options_used: Record<string, LabScalar>
  key_result: { label: string; value: number | string | null }
  stages: LabStageResult[]
  result: LabResult
}

// --- Group runs: GET /api/lab/groups, POST /api/lab/run-batch ----------------

export type LabGroupKind = 'tickers' | 'portfolio' | 'section' | 'sector'

/**
 * Which titles to run. `tickers` / `portfolio` (the profile's holdings, sent by the client):
 * an explicit list of at most `max_titles` symbols. `section` / `sector`: a reference resolved
 * server-side, cut to its first `limit` titles (and the response says so).
 */
export interface LabGroup {
  kind: LabGroupKind
  tickers?: string[]
  /** `section`: a dashboard section id; `sector`: a sector name; both listed by GET /api/lab/groups. */
  ref?: string
  /** 1 to `max_titles` (default `max_titles`). */
  limit?: number
}

export interface LabGroupCatalog {
  /** Largest group one synchronous run accepts (25). */
  max_titles: number
  sections: { id: string; title: string }[]
  /** Yahoo Finance's sectors: `name` (send it as `ref`, the label works too), French `label`;
   * `count` is null (resolved live, largest market capitalisations first). */
  sectors: { name: string; label: string; count: number | null }[]
  /** How sectors are resolved (Yahoo screeners, US and TSX, titles of the SEC + TMX universe). */
  sectors_source: string
}

export interface LabBatchRequest {
  step: string
  persona_id: string
  group: LabGroup
  /** The step's inputs without its `group_input`, which the server sets for each title. */
  inputs: Record<string, LabInputValue>
  /** Keyed `"<stage_id>.<key>"`, applied to every title. */
  options: Record<string, LabScalar>
}

/** `timeout`: not finished (or not started) inside the run's time budget. */
export type LabBatchItemStatus = 'ok' | 'warning' | 'error' | 'timeout'

/** A deciding branch of one title's run, with the stage it happened in. */
export interface LabBatchDecision extends LabDecision {
  stage: string
  stage_name: string
}

export interface LabBatchItem {
  ticker: string
  name: string | null
  status: LabBatchItemStatus
  duration_ms: number | null
  key_result: { label: string; value: number | string | null } | null
  governance_passed: boolean | null
  /** The step's main decisions for this title (sources, fallbacks, verdict). */
  decisions: LabBatchDecision[]
  /** Number of stage warnings. */
  warnings: number
  /** Why the title failed or did not finish (French); null otherwise. */
  error: string | null
  /** The title's stored run (stages, datasets, decisions): GET /api/runs/{run_id} (useRun). */
  run_id: string | null
  /** To run this title again alone: POST it to /api/lab/run (useRunLab). */
  run_request: LabRunRequest
}

/** `percent` values are fractions (0.12 = 12 %). */
export type LabBatchColumnKind = 'text' | 'number' | 'percent'

export interface LabBatchColumn {
  key: string
  label: string
  kind: LabBatchColumnKind
}

/** One row per title, keyed by column key; `ticker` and `status` are always there. */
export interface LabBatchTable {
  columns: LabBatchColumn[]
  rows: Record<string, LabCell>[]
  default_sort: { key: string; direction: 'asc' | 'desc' }
}

export interface LabBatchResponse {
  /** Also the group run's id in the registry: GET /api/runs/{batch_id}. */
  batch_id: string
  step: string
  persona_id: string
  duration_ms: number
  options_used: Record<string, LabScalar>
  group: {
    kind: LabGroupKind
    ref: string | null
    label: string
    source: string
    tickers: string[]
    /** Titles the reference had before the cut to `limit`. */
    total: number
    truncated: boolean
  }
  /** The up-front estimate that let the run start, against the time limit. */
  budget: { limit_s: number; estimated_s: number; workers: number; gdelt_calls: number }
  summary: { requested: number; ok: number; warning: number; error: number; timeout: number }
  items: LabBatchItem[]
  table: LabBatchTable
}

// --- Hooks ------------------------------------------------------------------

export const LAB_QUERY_KEYS = {
  all: ['lab'] as const,
  pipelines: () => [...LAB_QUERY_KEYS.all, 'pipelines'] as const,
  groups: () => [...LAB_QUERY_KEYS.all, 'groups'] as const,
}

/** Sections and sectors a group run can target. Sectors follow the score pipeline: refetched after 10 min. */
export function useLabGroups() {
  return useQuery<LabGroupCatalog, ApiError>({
    queryKey: LAB_QUERY_KEYS.groups(),
    queryFn: () => apiClient.request<LabGroupCatalog>('/api/lab/groups'),
    staleTime: 10 * 60 * 1000,
  })
}

/**
 * Runs one step on every title of a group (synchronous, up to a few minutes). A 422 explains a
 * group that is too large for the time limit, with the size that would fit.
 */
export function useRunLabBatch() {
  const queryClient = useQueryClient()
  return useMutation<LabBatchResponse, ApiError, LabBatchRequest>({
    mutationFn: (body) =>
      apiClient.request<LabBatchResponse>('/api/lab/run-batch', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    // the group run and its titles are now in the registry (GET /api/runs)
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEYS.lists() }),
  })
}

/** The steps, their inputs and their pipeline stages. Fixed server-side, so fetched once. */
export function useLabPipelines() {
  return useQuery<LabCatalog, ApiError>({
    queryKey: LAB_QUERY_KEYS.pipelines(),
    queryFn: () => apiClient.request<LabCatalog>('/api/lab/pipelines'),
    staleTime: Infinity,
  })
}

/** Runs one step's pipeline. Each caller keeps its own last result. */
export function useRunLab() {
  const queryClient = useQueryClient()
  return useMutation<LabRunResponse, ApiError, LabRunRequest>({
    mutationFn: (body) =>
      apiClient.request<LabRunResponse>('/api/lab/run', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    // the run is now in the registry (GET /api/runs/{run_id})
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEYS.lists() }),
  })
}
