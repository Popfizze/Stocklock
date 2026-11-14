/**
 * Pure helpers of the Labo page: form state from the catalog, request body,
 * run records and display formatting.
 */

import type { ApiError } from '@/api/client'
import type {
  LabInput,
  LabInputValue,
  LabOption,
  LabScalar,
  LabStageDef,
} from '@/api/lab'
import { API_BASE_URL } from '@/lib/env'

/** What the input fields hold: text for every type but `boolean`. */
export type InputDraft = Record<string, string | boolean>

/** Chosen option values, keyed `"<stage_id>.<key>"` as the run request wants them. */
export type OptionValues = Record<string, LabScalar>

export function optionId(stageId: string, key: string): string {
  return `${stageId}.${key}`
}

/** A choice value as a Select item value: `1` and `"1"` stay distinct. */
export function choiceKey(value: LabScalar | undefined): string {
  return JSON.stringify(value ?? null)
}

export function initialInputDraft(inputs: LabInput[]): InputDraft {
  return Object.fromEntries(inputs.map((input) => [input.name, draftValue(input)]))
}

function draftValue(input: LabInput): string | boolean {
  const value = input.default
  if (input.type === 'boolean') return value === true
  if (Array.isArray(value)) return value.join(', ')
  return value === null || value === undefined ? '' : String(value)
}

/** The field values as the API wants them: numbers, booleans, ticker lists. */
export function toRequestInputs(
  inputs: LabInput[],
  draft: InputDraft,
): Record<string, LabInputValue> {
  return Object.fromEntries(
    inputs.map((input) => [input.name, requestValue(input, draft[input.name])]),
  )
}

function requestValue(input: LabInput, value: string | boolean | undefined): LabInputValue {
  if (input.type === 'boolean') return value === true
  const text = typeof value === 'string' ? value : ''
  if (input.type === 'number') return text.trim() === '' ? null : Number(text)
  if (input.type === 'tickers') {
    return text
      .split(/[\s,;]+/)
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean)
  }
  return text
}

/** Every option starts at its lab default, else its default. */
export function initialOptionValues(stages: LabStageDef[]): OptionValues {
  const values: OptionValues = {}
  for (const stage of stages) {
    for (const option of stage.options) {
      values[optionId(stage.id, option.key)] = option.lab_default ?? option.default
    }
  }
  return values
}

function choiceLabel(option: LabOption, value: LabScalar | undefined): string {
  const choice = option.choices.find((candidate) => choiceKey(candidate.value) === choiceKey(value))
  return choice?.label ?? String(value)
}

/** « Stage · Option : Choix » for every option whose value is not its `default`. */
export function changedOptionLabels(stages: LabStageDef[], values: OptionValues): string[] {
  const changed: string[] = []
  for (const stage of stages) {
    for (const option of stage.options) {
      const value = values[optionId(stage.id, option.key)]
      if (choiceKey(value) !== choiceKey(option.default)) {
        changed.push(`${stage.name} · ${option.label} : ${choiceLabel(option, value)}`)
      }
    }
  }
  return changed
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toLocaleString('fr-CA', { maximumFractionDigits: 1 })} s`
}

export function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString('fr-CA', { maximumFractionDigits: 4 })
  return value
}

const UNREACHABLE = `Impossible de joindre le serveur (${API_BASE_URL}). Vérifiez que le backend est démarré`

export function catalogErrorMessage(error: ApiError): string {
  if (error.status === 0) return `${UNREACHABLE}, puis rechargez la page.`
  return `Le serveur n'a pas pu fournir les pipelines (erreur ${error.status}). Rechargez la page pour réessayer.`
}

export function runErrorMessage(error: ApiError): string {
  if (error.status === 0) return `${UNREACHABLE}.`
  if (error.status === 422) return `Entrée invalide : ${validationDetail(error.details)}`
  const detail = error.message === 'Request failed' ? '' : ` : ${error.message}`
  return `L'exécution a échoué (erreur ${error.status})${detail}`
}

/** FastAPI's `detail`: a sentence, or a list of `{loc, msg}` validation errors. */
function validationDetail(details: unknown): string {
  if (details && typeof details === 'object' && 'detail' in details) {
    const detail = (details as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) return detail.map(validationItem).join(' ; ')
  }
  return 'requête refusée par le serveur.'
}

function validationItem(item: unknown): string {
  if (item && typeof item === 'object') {
    const { loc, msg } = item as { loc?: unknown; msg?: unknown }
    const where = Array.isArray(loc) ? loc.filter((part) => part !== 'body').join('.') : ''
    if (typeof msg === 'string') return where ? `${where} : ${msg}` : msg
  }
  return String(item)
}
