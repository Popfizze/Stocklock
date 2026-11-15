/** Two runs side by side: what each was asked, what it produced, the decisions it took — and what differs. */

import type { RunStageDetail } from '@/api/runs'
import type { SceneTile } from '@/components/three'
import { formatValue } from '../labForm'
import type { RunView } from '../run/runView'
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
    number('Titres notés', summary.titles_scored)
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
  return { id: view.id, title: view.title, params, results, numbers, decisions }
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

/** Measures drawn at most. */
const MAX_PAIRS = 14

/**
 * The numbers both runs have, as pairs of columns: run A in ink, run B in grey, each pair scaled
 * to its larger value — so a pair of equal heights reads « same », whatever the unit.
 */
export function compareScene(left: CompareSide, right: CompareSide): { tiles: SceneTile[]; shared: string[] } {
  const shared = Object.keys(left.numbers)
    .filter((name) => name in right.numbers)
    .slice(0, MAX_PAIRS)
  const tiles: SceneTile[] = []
  shared.forEach((name, index) => {
    const a = left.numbers[name]
    const b = right.numbers[name]
    const top = Math.max(Math.abs(a), Math.abs(b), 1e-9)
    const label = `${name} · A : ${formatValue(a)} · B : ${formatValue(b)}`
    const x = index * 1.6
    tiles.push({ x, z: 0, w: 1.3, d: 2.3, y: -0.14, h: 0.12, tone: a === b ? 8 : 7, tag: name.length > 18 ? `${name.slice(0, 17)}…` : name, tagAt: 'base' })
    tiles.push({ x, z: 0.5, w: 0.8, d: 0.8, h: 0.2 + (Math.abs(a) / top) * 2.6, tone: 2, label })
    tiles.push({ x, z: -0.5, w: 0.8, d: 0.8, h: 0.2 + (Math.abs(b) / top) * 2.6, tone: 5, label })
  })
  return { tiles, shared }
}
