/** « Relancer » : what a past run hands the launcher so it opens on the same group and the same settings. */

import type { LabInput, LabInputValue, LabScalar } from '@/api/lab'
import type { ScoreRunGroup, ScoreRunParams } from '@/api/pipeline'
import type { RunView } from '../run/runView'
import { SCORE_DEFAULTS, type GroupDraft } from './launchModel'

const isoDay = (day: Date) =>
  `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`

/** `start` / `end` date inputs set to the twelve months ending today; nothing when the step has no such pair. */
export function lastTwelveMonths(fields: LabInput[], today: Date): Record<string, LabInputValue> {
  const dated = (name: string) => fields.some((field) => field.name === name && field.type === 'date')
  if (!dated('start') || !dated('end')) return {}
  const start = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  return { start: isoDay(start), end: isoDay(today) }
}

export interface Relaunch {
  /** The run it comes from. */
  runId: string
  title: string
  /** The run's group, as the group picker holds it; null when the run had none (a scenario). */
  draft: GroupDraft | null
  /** Score pipeline: the run's settings. */
  scoreParams: ScoreRunParams | null
  /** Labo: the run's inputs and options. */
  inputs: Record<string, LabInputValue> | null
  options: Record<string, LabScalar> | null
}

function isInputValue(value: unknown): value is LabInputValue {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function scoreDraft(group: ScoreRunGroup | undefined, requested: string[] | null | undefined, size: number): GroupDraft {
  if (group?.kind === 'tickers' || (!group && requested && requested.length > 0)) {
    return { kind: 'custom', ref: null, size, tickers: group?.kind === 'tickers' ? group.tickers : (requested ?? []) }
  }
  if (group?.kind === 'section') return { kind: 'section', ref: group.id, size: group.limit ?? size, tickers: [] }
  if (group?.kind === 'sector') return { kind: 'sector', ref: group.name, size: group.max_titles ?? size, tickers: [] }
  return { kind: 'auto', ref: null, size: group?.kind === 'auto' ? (group.max_titles ?? size) : size, tickers: [] }
}

/** The launcher's starting point for a run: its group and settings, as far as its record keeps them. */
export function relaunchOf(view: RunView): Relaunch {
  const base = { runId: view.id, title: view.title }
  if (view.kind === 'score') {
    const params = view.score?.params ?? view.registry?.params ?? null
    const settings: ScoreRunParams = { ...SCORE_DEFAULTS }
    if (params) {
      for (const key of Object.keys(SCORE_DEFAULTS) as Array<keyof ScoreRunParams>) {
        if (typeof params[key] === 'number') settings[key] = params[key]
      }
    }
    return {
      ...base,
      draft: scoreDraft(params?.group, view.score?.group?.requested, settings.max_titles),
      scoreParams: settings,
      inputs: null,
      options: null,
    }
  }
  const run = view.registry
  const inputs = Object.fromEntries(Object.entries(run?.inputs ?? {}).filter((entry): entry is [string, LabInputValue] => isInputValue(entry[1])))
  let draft: GroupDraft | null = null
  if (run?.group) {
    const { kind, ref, tickers } = run.group
    draft =
      (kind === 'section' || kind === 'sector') && ref
        ? { kind, ref, size: tickers.length, tickers: [] }
        : { kind: 'custom', ref: null, size: tickers.length, tickers }
  } else if (view.kind === 'lab' && typeof run?.inputs?.ticker === 'string') {
    // One title: the same title, as a set of one.
    draft = { kind: 'custom', ref: null, size: 1, tickers: [run.inputs.ticker] }
  }
  return { ...base, draft, scoreParams: null, inputs, options: run?.options ?? null }
}
