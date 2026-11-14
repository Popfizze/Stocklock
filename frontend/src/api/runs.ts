import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'
import type { LabBatchResponse, LabBatchTable, LabCell, LabResult, LabScalar, LabStageResult } from './lab'
import type { ScoreRunParams, ScoreRunStage, ScoreRunSummary } from './pipeline'

/*
 * The run registry: every execution of every pipeline, newest first, and everything it generated.
 *
 *   GET /api/runs?pipeline=&persona=&status=&trigger=&limit=&cursor=   runs, paginated
 *   GET /api/runs/{run_id}                                             one run (stages summarized)
 *   GET /api/runs/{run_id}/stages/{stage_id}                           one stage in full
 *   GET /api/runs/{run_id}/artifacts                                   every generated element
 *   GET /api/runs/{run_id}/artifacts/{artifact_id}?offset=&limit=      a page of one of them
 *
 * Lab runs (one title, a group, and each title of a group) are stored by the API in the data
 * bucket under `lab/`; score pipeline runs are read from their own records (`score/runs/`).
 */

// --- Shapes ----------------------------------------------------------------------

/** `lab.<step>`: a Labo run of that step; `score_pipeline`: the AWS score pipeline. */
export type RunPipeline = 'lab.score' | 'lab.explain_move' | 'lab.tax' | 'lab.bias' | 'score_pipeline'

/** `batch`: a group run (parent); `batch_item`: one title of a group; `pipeline`: a score pipeline run. */
export type RunKind = 'single' | 'batch' | 'batch_item' | 'pipeline'

/** `warning`: finished with stage warnings or some titles of a group not ok. */
export type RunStatus = 'running' | 'succeeded' | 'warning' | 'failed'

/** `labo`: from the Labo page; `api`, `schedule`, `local`: score pipeline triggers. */
export type RunTrigger = 'labo' | 'api' | 'schedule' | 'local'

export interface RunSummary {
  run_id: string
  pipeline: RunPipeline
  /** « Labo · 1. Score », « Pipeline de score » */
  pipeline_label: string
  kind: RunKind
  status: RunStatus
  trigger: RunTrigger
  /** Null for the score pipeline (independent of the profile). */
  persona_id: string | null
  /** What ran: « AAPL », « Groupe · Les plus populaires (25 titres) », « Pipeline de score du 2026-11-14 ». */
  title: string
  /** ISO 8601 UTC. */
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  key_result: { label: string; value: number | string | null } | null
  governance_passed: boolean | null
  error: string | null
  /** The group run this title belongs to (`batch_item`). */
  parent_id: string | null
  /** Titles of a group run; 0 otherwise. */
  child_count: number
}

export interface RunFilters {
  /** A pipeline, or `lab` for every Labo step. */
  pipeline?: RunPipeline | 'lab'
  persona?: string
  status?: RunStatus
  trigger?: RunTrigger
  /** 1 to 100 (default 20). */
  limit?: number
}

export interface RunPage {
  runs: RunSummary[]
  /** Pass it back as `cursor` for older runs; null on the last page. */
  next_cursor: string | null
  /** False when the API has no data bucket (local dev): nothing is stored or listed. */
  stored: boolean
}

export interface RunDatasetInfo {
  id: string
  title: string
  source_id: string | null
  /** Rows stored (complete: never cut in the registry). */
  rows: number
  columns: number
}

export interface RunStageInfo {
  id: string
  name: string
  /** `bronze`, `silver`, `gold` or `sortie`. */
  layer: string | null
  /** Lab: `ok`, `warning`, `error`, `skipped`; score pipeline: `pending`, `running`, `succeeded`, `failed`. */
  status: string
  duration_ms: number | null
  warnings: number
  decisions: number
  datasets: RunDatasetInfo[]
}

export interface RunDetail extends RunSummary {
  /** Lab: the step's inputs (for a group, without the per-title input). */
  inputs: Record<string, unknown> | null
  options: Record<string, LabScalar> | null
  /** Group run: how the titles were chosen. */
  group: LabBatchResponse['group'] | null
  stages: RunStageInfo[]
  /** Lab run of one title: the final answer, factors, sources and governance. */
  result: LabResult | null
  /** Group run: one summary per title; GET /api/runs/{run_id} of a title gives its detail. */
  children: RunSummary[]
  /** Group run: the table across titles. */
  table: LabBatchTable | null
  /** Score pipeline: run parameters and end summary. */
  params: ScoreRunParams | null
  summary: ScoreRunSummary | null
}

/**
 * One stage in full. Lab: as in POST /api/lab/run (datasets cut to fit the response, `truncated`
 * set; page through them with the artifacts endpoint). Score pipeline: its stage record.
 */
export type RunStageDetail =
  | { pipeline: 'lab'; stage: LabStageResult }
  | { pipeline: 'score_pipeline'; stage: ScoreRunStage }

/** `dataset` / `decisions`: from a Labo stage; `file`: an object the score pipeline wrote. */
export type RunArtifactKind = 'dataset' | 'decisions' | 'file'

export interface RunArtifact {
  /** Opaque; pass it to the preview endpoint as is (the hook encodes it). */
  id: string
  kind: RunArtifactKind
  stage_id: string | null
  title: string
  /** `table`: a Labo dataset or decision list; files: `csv`, `json`, `parquet`, `text` (gzip read transparently). */
  format: 'table' | 'csv' | 'json' | 'parquet' | 'text'
  /** S3 key of a file, e.g. `score/silver/univers/2026-11-14/<run_id>/univers.csv`; null for Labo artifacts. */
  path: string | null
  size_bytes: number | null
  /** Known without reading the file (Labo artifacts); null for files until previewed. */
  rows: number | null
  columns: number | null
}

export interface RunArtifactList {
  run_id: string
  artifacts: RunArtifact[]
}

/** A page of an artifact as a table. JSON that is not a list of records comes as `clé` / `valeur` rows. */
export interface RunArtifactPreview {
  artifact: RunArtifact
  columns: string[]
  rows: LabCell[][]
  offset: number
  limit: number
  /** Rows in the whole artifact; null when unknown. */
  total_rows: number | null
  has_more: boolean
  /** Why the preview is partial or impossible (size, format), in French. */
  note: string | null
}

// --- Hooks -------------------------------------------------------------------------

export const RUNS_QUERY_KEYS = {
  all: ['runs'] as const,
  lists: () => [...RUNS_QUERY_KEYS.all, 'list'] as const,
  list: (filters: RunFilters) => [...RUNS_QUERY_KEYS.lists(), filters] as const,
  details: () => [...RUNS_QUERY_KEYS.all, 'detail'] as const,
  detail: (runId: string) => [...RUNS_QUERY_KEYS.details(), runId] as const,
  stage: (runId: string, stageId: string) => [...RUNS_QUERY_KEYS.detail(runId), 'stage', stageId] as const,
  artifacts: (runId: string) => [...RUNS_QUERY_KEYS.detail(runId), 'artifacts'] as const,
  artifact: (runId: string, artifactId: string, offset: number, limit: number) =>
    [...RUNS_QUERY_KEYS.artifacts(runId), artifactId, offset, limit] as const,
}

/** Poll period while a listed or shown run is still running. */
export const RUNS_POLL_MS = 5000

/** Query string of GET /api/runs (filters that are set, then the cursor). */
export function runsQuery(filters: RunFilters, cursor: string | null): string {
  const params = new URLSearchParams()
  for (const key of ['pipeline', 'persona', 'status', 'trigger'] as const) {
    const value = filters[key]
    if (value) params.set(key, value)
  }
  if (filters.limit) params.set('limit', String(filters.limit))
  if (cursor) params.set('cursor', cursor)
  return params.toString()
}

/** Runs newest first, page by page (`fetchNextPage` while `hasNextPage`); polled while one is running. */
export function useRuns(filters: RunFilters = {}) {
  return useInfiniteQuery<
    RunPage,
    ApiError,
    InfiniteData<RunPage, string | null>,
    ReturnType<typeof RUNS_QUERY_KEYS.list>,
    string | null
  >({
    queryKey: RUNS_QUERY_KEYS.list(filters),
    queryFn: ({ pageParam }) => apiClient.request<RunPage>(`/api/runs?${runsQuery(filters, pageParam)}`),
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    refetchInterval: (query) =>
      query.state.data?.pages.some((page) => page.runs.some((run) => run.status === 'running'))
        ? RUNS_POLL_MS
        : false,
  })
}

/** One run with its stages summarized; polled while running. Idle without a run id. */
export function useRun(runId: string | null) {
  return useQuery<RunDetail, ApiError>({
    queryKey: RUNS_QUERY_KEYS.detail(runId ?? ''),
    queryFn: () => apiClient.request<RunDetail>(`/api/runs/${encodeURIComponent(runId ?? '')}`),
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data?.status === 'running' ? RUNS_POLL_MS : false),
  })
}

/** One stage in full (decisions, datasets, metrics, …), fetched when opened. */
export function useRunStage(runId: string | null, stageId: string | null) {
  return useQuery<RunStageDetail, ApiError>({
    queryKey: RUNS_QUERY_KEYS.stage(runId ?? '', stageId ?? ''),
    queryFn: () =>
      apiClient.request<RunStageDetail>(
        `/api/runs/${encodeURIComponent(runId ?? '')}/stages/${encodeURIComponent(stageId ?? '')}`,
      ),
    enabled: Boolean(runId && stageId),
  })
}

/** Everything a run generated (Labo datasets and decisions, score pipeline files). */
export function useRunArtifacts(runId: string | null) {
  return useQuery<RunArtifactList, ApiError>({
    queryKey: RUNS_QUERY_KEYS.artifacts(runId ?? ''),
    queryFn: () =>
      apiClient.request<RunArtifactList>(`/api/runs/${encodeURIComponent(runId ?? '')}/artifacts`),
    enabled: Boolean(runId),
  })
}

/** A page of one artifact (`limit` 1-500 rows, default 100). Idle until an artifact is chosen. */
export function useArtifactPreview(runId: string | null, artifactId: string | null, offset = 0, limit = 100) {
  return useQuery<RunArtifactPreview, ApiError>({
    queryKey: RUNS_QUERY_KEYS.artifact(runId ?? '', artifactId ?? '', offset, limit),
    queryFn: () =>
      apiClient.request<RunArtifactPreview>(
        `/api/runs/${encodeURIComponent(runId ?? '')}/artifacts/${encodeURIComponent(artifactId ?? '')}` +
          `?offset=${offset}&limit=${limit}`,
      ),
    enabled: Boolean(runId && artifactId),
    staleTime: Infinity, // a stored run does not change
  })
}
