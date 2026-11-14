/**
 * One run as the Labo shows it, whatever its pipeline and wherever it was read from: the run
 * registry (every pipeline) or the score pipeline's own record (live, with full stages).
 */

import type { LabStageDef } from '@/api/lab'
import type { ScoreRun } from '@/api/pipeline'
import type { RunDetail, RunStatus, RunSummary, RunTrigger } from '@/api/runs'
import { summaryFromScoreRun } from '../runs/runModel'
import {
  catalogFlow,
  reachedColumn,
  registryFlow,
  scoreFlow,
  type FlowNode,
  type FlowStatus,
  type Traveller,
} from './flowModel'

export interface RunView {
  id: string
  /** `lab`: one title; `batch`: a group; `score`: the AWS score pipeline. */
  kind: 'lab' | 'batch' | 'score'
  /** What to hand the launcher to run it again: `score_pipeline` or a Labo step id. */
  pipelineId: string
  pipelineLabel: string
  title: string
  status: RunStatus
  trigger: RunTrigger
  personaId: string | null
  startedAt: string | null
  durationMs: number | null
  error: string | null
  parentId: string | null
  nodes: FlowNode[]
  /** Group runs: the titles, standing at the stage they reached. */
  travellers: Traveller[]
  /** The registry's record, when the run was read from it. */
  registry: RunDetail | null
  /** The score pipeline's record, when there is one. */
  score: ScoreRun | null
}

const CHILD_STATUS: Record<RunStatus, FlowStatus> = {
  running: 'running',
  succeeded: 'ok',
  warning: 'warning',
  failed: 'error',
}

/** Travellers shown at most: a 200-title run stays readable. */
const MAX_TRAVELLERS = 48

function childLabel(child: RunSummary): string {
  const value = child.key_result?.value
  return value === null || value === undefined ? child.title : `${child.title} · ${child.key_result?.label} ${value}`
}

/** `lab.explain_move` → `explain_move`. */
export function stepOf(pipeline: string): string {
  return pipeline.startsWith('lab.') ? pipeline.slice(4) : pipeline
}

/** A run of the registry. `stageDefs`: the step's catalog stages, to draw a group's flow. */
export function viewFromRegistry(run: RunDetail, stageDefs: LabStageDef[] = []): RunView {
  const isBatch = run.kind === 'batch'
  const nodes = run.stages.length > 0 || !isBatch ? registryFlow(run.stages, run.status) : catalogFlow(stageDefs, run.status)
  const column = reachedColumn(nodes)
  return {
    id: run.run_id,
    kind: run.pipeline === 'score_pipeline' ? 'score' : isBatch ? 'batch' : 'lab',
    pipelineId: stepOf(run.pipeline),
    pipelineLabel: run.pipeline_label,
    title: run.title,
    status: run.status,
    trigger: run.trigger,
    personaId: run.persona_id,
    startedAt: run.started_at,
    durationMs: run.duration_ms,
    error: run.error,
    parentId: run.parent_id,
    nodes,
    travellers: run.children.slice(0, MAX_TRAVELLERS).map((child) => ({
      label: childLabel(child),
      status: CHILD_STATUS[child.status],
      column,
      runId: child.run_id,
    })),
    registry: run,
    score: null,
  }
}

/** A score pipeline run from its own record; `registry` is kept when the run was also read there. */
export function viewFromScore(run: ScoreRun, registry: RunDetail | null = null): RunView {
  const summary = summaryFromScoreRun(run)
  const nodes = scoreFlow(run.stages, run)
  const column = reachedColumn(nodes)
  const titles = run.group?.resolved ?? run.group?.requested ?? []
  return {
    id: run.run_id,
    kind: 'score',
    pipelineId: 'score_pipeline',
    pipelineLabel: summary.pipeline_label,
    title: registry?.title ?? summary.title,
    status: run.status === 'succeeded' && run.stages.some((stage) => stage.warnings.length > 0) ? 'warning' : run.status,
    trigger: run.trigger,
    personaId: null,
    startedAt: run.started_at,
    durationMs: summary.duration_ms,
    error: summary.error,
    parentId: null,
    nodes,
    travellers: titles.slice(0, MAX_TRAVELLERS).map((symbol) => ({
      label: symbol,
      status: run.status === 'running' ? 'running' : run.status === 'failed' ? 'error' : 'ok',
      column,
      runId: null,
    })),
    registry,
    score: run,
  }
}
