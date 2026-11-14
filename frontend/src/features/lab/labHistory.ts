/**
 * History of the lab runs (the synchronous pipelines), per pipeline, kept in
 * localStorage: a summary only — parameters, key result, duration,
 * governance, the decisions' answers — never the datasets.
 */

import type { LabRunResponse, LabStageStatus, LabStep } from '@/api/lab'
import type { CompareRun } from './flow/flowModel'
import {
  changedOptionLabels,
  formatDuration,
  formatValue,
  type InputDraft,
  type OptionValues,
} from './labForm'

const STORAGE_PREFIX = 'stocklock.labRuns.'
const MAX_RUNS = 20

export interface StoredLabRun {
  runId: string
  /** ISO date-time the run came back. */
  at: string
  status: LabStageStatus
  durationMs: number
  keyResult: string
  governancePassed: boolean
  changedOptions: string[]
  /** Inputs and options as shown, by label. */
  params: Record<string, string>
  /** « Étape · question » → answer. */
  decisions: Record<string, string>
}

function isStoredRun(value: unknown): value is StoredLabRun {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Record<string, unknown>
  return typeof run.runId === 'string' && typeof run.at === 'string' && typeof run.keyResult === 'string'
}

/** Newest first; empty when nothing is stored, storage is blocked or the content is not ours. */
export function readLabRuns(stepId: string): StoredLabRun[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + stepId) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isStoredRun) : []
  } catch {
    return []
  }
}

/** Never throws: with storage blocked the history lasts until the page is left. */
export function storeLabRuns(stepId: string, runs: StoredLabRun[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + stepId, JSON.stringify(runs.slice(0, MAX_RUNS)))
  } catch {
    // Storage blocked or full.
  }
}

function worstStatus(response: LabRunResponse): LabStageStatus {
  const statuses = response.stages.map((stage) => stage.status)
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('warning')) return 'warning'
  return 'ok'
}

/** The summary kept of a run that just came back. */
export function toStoredRun(
  step: LabStep,
  inputs: InputDraft,
  options: OptionValues,
  response: LabRunResponse,
): StoredLabRun {
  const params: Record<string, string> = {}
  for (const input of step.inputs) {
    const value = inputs[input.name]
    params[input.label] = typeof value === 'boolean' ? (value ? 'oui' : 'non') : (value ?? '') || '—'
  }
  for (const stage of step.stages) {
    for (const option of stage.options) {
      const value = options[`${stage.id}.${option.key}`]
      const choice = option.choices.find((candidate) => candidate.value === value)
      params[`${stage.name} · ${option.label}`] = choice?.label ?? formatValue(typeof value === 'boolean' ? String(value) : value)
    }
  }
  const decisions: Record<string, string> = {}
  for (const stage of response.stages) {
    for (const decision of stage.decisions ?? []) {
      decisions[`${stage.name} · ${decision.question}`] = formatValue(decision.answer)
    }
  }
  return {
    runId: response.run_id,
    at: new Date().toISOString(),
    status: worstStatus(response),
    durationMs: response.duration_ms,
    keyResult: `${response.key_result.label} : ${formatValue(response.key_result.value)}`,
    governancePassed: response.result.governance.passed,
    changedOptions: changedOptionLabels(step.stages, options),
    params,
    decisions,
  }
}

const DATE_TIME = new Intl.DateTimeFormat('fr-CA', { dateStyle: 'medium', timeStyle: 'short' })

export function formatRunTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date)
}

export function labCompareRun(run: StoredLabRun): CompareRun {
  return {
    id: run.runId,
    title: formatRunTime(run.at),
    params: run.params,
    results: {
      'Résultat clé': run.keyResult,
      Durée: formatDuration(run.durationMs),
      Gouvernance: run.governancePassed ? 'Passée' : 'Échouée',
    },
    decisions: run.decisions,
  }
}
