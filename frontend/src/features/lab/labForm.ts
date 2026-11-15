/**
 * Pure helpers shared by the Labo's pages: option values from the catalog, value
 * formatting and error messages.
 */

import type { ApiError } from '@/api/client'
import type { LabScalar, LabStageDef } from '@/api/lab'
import { API_BASE_URL } from '@/lib/env'

/** Chosen option values, keyed `"<stage_id>.<key>"` as the run request wants them. */
export type OptionValues = Record<string, LabScalar>

export function optionId(stageId: string, key: string): string {
  return `${stageId}.${key}`
}

/** A choice value as a Select item value: `1` and `"1"` stay distinct. */
export function choiceKey(value: LabScalar | undefined): string {
  return JSON.stringify(value ?? null)
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

/** A plain decimal number with more digits after the point than anyone reads. */
const LONG_DECIMAL = /^-?\d+\.\d{5,}$/

export function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString('fr-CA', { maximumFractionDigits: 4 })
  // Files read as text (CSV) give numbers as strings: « 115.29000091552734 » reads as 115,29.
  if (LONG_DECIMAL.test(value)) return Number(value).toLocaleString('fr-CA', { maximumFractionDigits: 4 })
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
