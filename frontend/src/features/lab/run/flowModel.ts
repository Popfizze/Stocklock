/**
 * A run as a flow: its stages placed in the conveyor's five columns, whatever the pipeline
 * (a Labo step, a group run, the score pipeline on AWS), plus the titles that travel through it.
 */

import type { LabStageDef } from '@/api/lab'
import type { ScoreRun, ScoreStageDef } from '@/api/pipeline'
import type { RunStageInfo, RunStatus } from '@/api/runs'

/** The conveyor's columns, left to right. */
export const FLOW_COLUMNS = ['entrees', 'bronze', 'silver', 'gold', 'sortie'] as const
export type FlowColumn = (typeof FLOW_COLUMNS)[number]

export const COLUMN_LABELS: Record<FlowColumn, string> = {
  entrees: 'Entrées',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  sortie: 'Sortie',
}

export const COLUMN_HINTS: Record<FlowColumn, string> = {
  entrees: 'Paramètres du run',
  bronze: 'Données brutes',
  silver: 'Données nettoyées',
  gold: 'Résultat calculé',
  sortie: 'Ce que le run produit',
}

export type FlowStatus = 'idle' | 'pending' | 'running' | 'ok' | 'warning' | 'error' | 'skipped'

export const FLOW_STATUS_LABELS: Record<FlowStatus, string> = {
  idle: 'Pas encore exécuté',
  pending: 'En attente',
  running: 'En cours',
  ok: 'Terminé',
  warning: 'Avertissement',
  error: 'Erreur',
  skipped: 'Ignoré',
}

/** The node ids of the two fixed ends of every flow. */
export const INPUT_NODE = '__entrees'
export const OUTPUT_NODE = '__sortie'

/** A node of the flow: a stage, or one of the two ends (« Paramètres », « Résultat »). */
export interface FlowNode {
  id: string
  column: FlowColumn
  label: string
  status: FlowStatus
  /** Execution order, 1-based; absent for the two ends. */
  order?: number
  durationMs: number | null
  /** Rows of the stage's largest dataset, when it has one. */
  rows: number | null
}

/** A title of a group, standing at the stage it has reached. */
export interface Traveller {
  label: string
  status: FlowStatus
  column: FlowColumn
  /** The title's own run, when it has one. */
  runId: string | null
}

function column(layer: string | null): FlowColumn {
  return layer === 'bronze' || layer === 'gold' || layer === 'sortie' ? layer : 'silver'
}

const STAGE_STATUS: Record<string, FlowStatus> = {
  ok: 'ok',
  succeeded: 'ok',
  warning: 'warning',
  error: 'error',
  failed: 'error',
  skipped: 'skipped',
  pending: 'pending',
  running: 'running',
}

const END_STATUS: Record<RunStatus, FlowStatus> = {
  running: 'pending',
  succeeded: 'ok',
  warning: 'warning',
  failed: 'error',
}

function withEnds(stages: FlowNode[], input: FlowStatus, output: FlowStatus): FlowNode[] {
  return [
    { id: INPUT_NODE, column: 'entrees', label: 'Paramètres', status: input, durationMs: null, rows: null },
    ...stages,
    { id: OUTPUT_NODE, column: 'sortie', label: 'Résultat', status: output, durationMs: null, rows: null },
  ]
}

/** A stored run's flow, from the registry's stage summaries. */
export function registryFlow(stages: RunStageInfo[], status: RunStatus): FlowNode[] {
  const nodes = stages.map((stage, index): FlowNode => {
    const counts = stage.datasets.map((dataset) => dataset.rows)
    return {
      id: stage.id,
      column: column(stage.layer),
      label: stage.name,
      status: stage.warnings > 0 && (stage.status === 'ok' || stage.status === 'succeeded') ? 'warning' : (STAGE_STATUS[stage.status] ?? 'idle'),
      order: index + 1,
      durationMs: stage.duration_ms,
      rows: counts.length > 0 ? Math.max(...counts) : null,
    }
  })
  return withEnds(nodes, 'ok', END_STATUS[status])
}

/**
 * A Labo step's flow from the catalog: `idle` before a run, all `running` while the request is
 * out (the server answers once, at the end), `status` once a group run has ended.
 */
export function catalogFlow(stages: LabStageDef[], state: 'idle' | 'running' | RunStatus): FlowNode[] {
  const status: FlowStatus = state === 'idle' ? 'idle' : state === 'running' ? 'running' : 'ok'
  const nodes = stages.map(
    (stage, index): FlowNode => ({
      id: stage.id,
      column: column(stage.layer),
      label: stage.name,
      status,
      order: index + 1,
      durationMs: null,
      rows: null,
    }),
  )
  return withEnds(nodes, state === 'idle' ? 'idle' : 'ok', state === 'idle' ? 'idle' : END_STATUS[state])
}

/** The score pipeline's flow: its stage definitions, with a run's live status when there is one. */
export function scoreFlow(defs: Array<Pick<ScoreStageDef, 'id' | 'layer' | 'label'>>, run: ScoreRun | undefined): FlowNode[] {
  const nodes = defs.map((def, index): FlowNode => {
    const stage = run?.stages.find((candidate) => candidate.id === def.id)
    const counts = Object.values(stage?.rows ?? {})
    return {
      id: def.id,
      column: column(def.layer),
      label: def.label,
      status: stage ? (stage.warnings.length > 0 && stage.status === 'succeeded' ? 'warning' : STAGE_STATUS[stage.status]) : 'idle',
      order: index + 1,
      durationMs: stage?.duration_s == null ? null : stage.duration_s * 1000,
      rows: counts.length > 0 ? Math.max(...counts) : null,
    }
  })
  return withEnds(nodes, run ? 'ok' : 'idle', run ? END_STATUS[run.status] : 'idle')
}

/** Where a run's titles stand: at the stage running now, else at the furthest column reached. */
export function reachedColumn(nodes: FlowNode[]): FlowColumn {
  const output = nodes.find((node) => node.id === OUTPUT_NODE)
  if (output && output.status !== 'pending' && output.status !== 'idle') return 'sortie'
  const running = nodes.find((node) => node.status === 'running')
  if (running) return running.column
  let reached: FlowColumn = 'entrees'
  for (const node of nodes) {
    if (node.order !== undefined && node.status !== 'pending' && node.status !== 'idle') {
      if (FLOW_COLUMNS.indexOf(node.column) > FLOW_COLUMNS.indexOf(reached)) reached = node.column
    }
  }
  return reached
}

/** What the flow says, in a sentence: the conveyor's accessible label. */
export function flowReading(nodes: FlowNode[], travellers: number): string {
  const stages = nodes.filter((node) => node.order !== undefined)
  const count = (status: FlowStatus) => stages.filter((node) => node.status === status).length
  return [
    `${stages.length} étapes`,
    `${count('ok') + count('warning')} terminées`,
    count('running') > 0 ? `${count('running')} en cours` : null,
    count('error') > 0 ? `${count('error')} en erreur` : null,
    travellers > 0 ? `${travellers} titre${travellers > 1 ? 's' : ''} du groupe` : null,
  ]
    .filter(Boolean)
    .join(', ')
}
