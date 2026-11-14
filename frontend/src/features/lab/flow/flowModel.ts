import type { LabStageDef, LabStageResult } from '@/api/lab'
import type { ScoreRun, ScoreStageDef } from '@/api/pipeline'

/** The diagram's columns, left to right. */
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
  ok: 'OK',
  warning: 'Avertissement',
  error: 'Erreur',
  skipped: 'Ignoré',
}

/** The node ids of the two fixed ends of every flow. */
export const INPUT_NODE = '__entrees'
export const OUTPUT_NODE = '__sortie'

/** A node of the diagram: a stage, or one of the two ends (« Paramètres », « Résultat »). */
export interface FlowNode {
  id: string
  column: FlowColumn
  label: string
  status: FlowStatus
  /** Execution order, 1-based; absent for the two ends. */
  order?: number
  durationMs: number | null
  /** Rows of the stage's main dataset, when it has one. */
  rows: number | null
}

function column(layer: string): FlowColumn {
  return layer === 'bronze' || layer === 'gold' || layer === 'sortie' ? layer : 'silver'
}

function ends(inputStatus: FlowStatus, outputStatus: FlowStatus): [FlowNode, FlowNode] {
  return [
    { id: INPUT_NODE, column: 'entrees', label: 'Paramètres', status: inputStatus, durationMs: null, rows: null },
    { id: OUTPUT_NODE, column: 'sortie', label: 'Résultat', status: outputStatus, durationMs: null, rows: null },
  ]
}

/** The largest dataset of a lab stage, as its row count. */
function labRows(result: LabStageResult | undefined): number | null {
  const counts = (result?.datasets ?? []).map((dataset) => dataset.total_rows)
  return counts.length > 0 ? Math.max(...counts) : null
}

/**
 * A lab step's flow. Before any run every stage is `idle`; while the request
 * is out they are all `running` (the server answers once, at the end).
 */
export function labFlow(
  stages: LabStageDef[],
  results: Map<string, LabStageResult> | undefined,
  running: boolean,
): FlowNode[] {
  const base: FlowStatus = running ? 'running' : 'idle'
  const nodes = stages.map((stage, index): FlowNode => {
    const result = running ? undefined : results?.get(stage.id)
    return {
      id: stage.id,
      column: column(stage.layer),
      label: stage.name,
      status: result ? result.status : base,
      order: index + 1,
      durationMs: result ? result.duration_ms : null,
      rows: labRows(result),
    }
  })
  const done = !running && results !== undefined
  const failed = nodes.some((node) => node.status === 'error')
  const [input, output] = ends(done || running ? 'ok' : 'idle', done ? (failed ? 'error' : 'ok') : running ? 'pending' : 'idle')
  return [input, ...nodes, output]
}

const SCORE_STATUS: Record<string, FlowStatus> = {
  pending: 'pending',
  running: 'running',
  succeeded: 'ok',
  failed: 'error',
}

/** The score pipeline's flow: its stage definitions, with a run's live status when there is one. */
export function scoreFlow(defs: ScoreStageDef[], run: ScoreRun | undefined): FlowNode[] {
  const nodes = defs.map((def, index): FlowNode => {
    const stage = run?.stages.find((candidate) => candidate.id === def.id)
    const counts = Object.values(stage?.rows ?? {})
    return {
      id: def.id,
      column: column(def.layer),
      label: def.label,
      status: stage ? (stage.warnings.length > 0 && stage.status === 'succeeded' ? 'warning' : SCORE_STATUS[stage.status]) : 'idle',
      order: index + 1,
      durationMs: stage?.duration_s == null ? null : stage.duration_s * 1000,
      rows: counts.length > 0 ? Math.max(...counts) : null,
    }
  })
  const outputStatus: FlowStatus =
    run === undefined ? 'idle' : run.status === 'succeeded' ? 'ok' : run.status === 'failed' ? 'error' : 'pending'
  const [input, output] = ends(run ? 'ok' : 'idle', outputStatus)
  return [input, ...nodes, output]
}

/** What two runs are compared on; each table lists a name and a value per run. */
export interface CompareRun {
  id: string
  title: string
  params: Record<string, string>
  results: Record<string, string>
  /** « Étape · question » → answer. */
  decisions: Record<string, string>
}

export interface CompareRow {
  name: string
  left: string
  right: string
  differs: boolean
}

/** The union of both runs' entries, in first-seen order; a missing one reads « — ». */
export function compareRows(left: Record<string, string>, right: Record<string, string>): CompareRow[] {
  const names = [...new Set([...Object.keys(left), ...Object.keys(right)])]
  return names.map((name) => {
    const a = left[name] ?? '—'
    const b = right[name] ?? '—'
    return { name, left: a, right: b, differs: a !== b }
  })
}
