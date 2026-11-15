/** Two runs side by side: what each was asked, what it produced, the decisions it took — and what differs. */

import type { RunStageDetail } from '@/api/runs'
import { formatValue } from '../labForm'
import type { RunView } from '../run/runView'
import { FLOW_STATUS_LABELS } from '../run/flowModel'
import { formatCount, formatDuration, STATUS_LABELS } from '../runs/runModel'

export interface CompareSide {
  id: string
  title: string
  params: Record<string, string>
  results: Record<string, string>
  /** The results that are numbers, for the 3D bars. */
  numbers: Record<string, number>
  /** « Étape · question » → answer. */
  decisions: Record<string, string>
  /** « 1. Collecte » → « Terminé · 420 ms ». */
  stages: Record<string, string>
}

export interface CompareRow {
  name: string
  left: string
  right: string
  differs: boolean
}

function text(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (typeof value === 'number') return formatValue(value)
  if (Array.isArray(value)) return value.join(', ') || '—'
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/** One run as a comparison side; `stages`: its stages in full (decisions), as far as they were loaded. */
export function compareSide(view: RunView, stages: RunStageDetail[]): CompareSide {
  const params: Record<string, string> = {}
  const results: Record<string, string> = { Statut: STATUS_LABELS[view.status], Durée: formatDuration(view.durationMs) }
  const numbers: Record<string, number> = {}
  const decisions: Record<string, string> = {}
  const number = (name: string, value: number | null | undefined) => {
    if (value === null || value === undefined) return
    numbers[name] = value
    results[name] = formatCount(value)
  }
  if (view.durationMs !== null) numbers['Durée (s)'] = view.durationMs / 1000
  // What any two runs share, whatever their pipelines: how many stages, how many titles.
  const steps = view.nodes.filter((node) => node.order !== undefined)
  number('Étapes', steps.length)
  const scored = (view.score?.summary ?? view.registry?.summary)?.titles_scored
  number('Titres', scored ?? Math.max(view.kind === 'score' ? 0 : 1, view.registry?.child_count ?? 0, view.travellers.length))
  const stageRows: Record<string, string> = {}
  for (const node of steps) {
    stageRows[`${node.order}. ${node.label}`] = [FLOW_STATUS_LABELS[node.status], node.durationMs === null ? null : formatDuration(node.durationMs)].filter(Boolean).join(' · ')
  }

  const run = view.registry
  const score = view.score
  if (run?.group) params['Groupe'] = `${run.group.label} (${run.group.tickers.length} titres)`
  for (const [name, value] of Object.entries(run?.inputs ?? {})) params[name] = text(value)
  for (const [name, value] of Object.entries(run?.options ?? {})) params[`option ${name}`] = text(value)
  if (run?.key_result && run.key_result.value !== null) {
    results[run.key_result.label] = text(run.key_result.value)
    if (typeof run.key_result.value === 'number') numbers[run.key_result.label] = run.key_result.value
  }
  if (run?.governance_passed !== null && run?.governance_passed !== undefined) {
    results['Gouvernance'] = run.governance_passed ? 'passée' : 'échouée'
  }
  // A group: one result per title.
  for (const child of run?.children ?? []) {
    const value = child.key_result?.value
    results[child.title] = value === null || value === undefined ? STATUS_LABELS[child.status] : text(value)
    if (typeof value === 'number') numbers[child.title] = value
  }

  const scoreParams = score?.params ?? run?.params
  if (scoreParams) {
    const group = score?.group ?? run?.summary?.group
    if (group) params['Groupe'] = group.label
    for (const [name, value] of Object.entries(scoreParams)) {
      if (typeof value === 'number') params[name] = formatValue(value)
    }
  }
  const summary = score?.summary ?? run?.summary
  if (summary) {
    number('Scores partiels', summary.partial)
    number('Appels Bedrock', summary.bedrock_calls)
    number('Tokens en entrée', summary.bedrock_input_tokens)
    number('Tokens en sortie', summary.bedrock_output_tokens)
    for (const title of summary.top ?? []) results[`Score ${title.symbol}`] = formatValue(title.score)
  }

  for (const stage of score?.stages ?? []) {
    stage.decisions.forEach((decision, index) => {
      decisions[`${stage.label} · ${decision.kind} ${index + 1}`] = decision.count === null ? decision.message : `${decision.message} (${formatCount(decision.count)})`
    })
  }
  for (const detail of stages) {
    if (detail.pipeline !== 'lab') continue
    for (const decision of detail.stage.decisions ?? []) {
      decisions[`${detail.stage.name} · ${decision.question}`] = text(decision.answer)
    }
  }
  return { id: view.id, title: view.title, params, results, numbers, decisions, stages: stageRows }
}

/** The union of both sides' entries, in first-seen order; a missing one reads « — ». */
export function compareRows(left: Record<string, string>, right: Record<string, string>): CompareRow[] {
  const names = [...new Set([...Object.keys(left), ...Object.keys(right)])]
  return names.map((name) => {
    const a = left[name] ?? '—'
    const b = right[name] ?? '—'
    return { name, left: a, right: b, differs: a !== b }
  })
}

/** True when both runs have the entry: across two different pipelines, only those rows compare. */
export function comparable(row: CompareRow): boolean {
  return row.left !== '—' && row.right !== '—'
}
