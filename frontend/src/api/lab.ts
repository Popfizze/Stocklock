import { useMutation, useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

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

export interface LabStageDef {
  id: string
  name: string
  description: string
  options: LabOption[]
}

export interface LabStep {
  id: string
  label: string
  inputs: LabInput[]
  stages: LabStageDef[]
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
  run_id: string
  step: string
  duration_ms: number
  options_used: Record<string, LabScalar>
  key_result: { label: string; value: number | string | null }
  stages: LabStageResult[]
  result: LabResult
}

// --- Hooks ------------------------------------------------------------------

export const LAB_QUERY_KEYS = {
  all: ['lab'] as const,
  pipelines: () => [...LAB_QUERY_KEYS.all, 'pipelines'] as const,
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
  return useMutation<LabRunResponse, ApiError, LabRunRequest>({
    mutationFn: (body) =>
      apiClient.request<LabRunResponse>('/api/lab/run', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
}
