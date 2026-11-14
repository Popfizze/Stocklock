/** Display formatting of the Comptes tab (fr-CA). */

import type { ApiError } from '@/api/client'
import { API_BASE_URL } from '@/lib/env'

const MONEY = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
})

const COMPACT_MONEY = new Intl.NumberFormat('fr-CA', {
  style: 'currency',
  currency: 'CAD',
  notation: 'compact',
  maximumFractionDigits: 0,
})

/** 126 570 $ */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return MONEY.format(value)
}

/** 127 k$ — for chart axes. */
export function formatCompactMoney(value: number): string {
  return COMPACT_MONEY.format(value)
}

/** 0.3612 → 36,1 % */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('fr-CA', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

/** The source's name only: « ARC, plafonds… » → « ARC », « Convention fiscale… (texte…) : art. X » → « Convention fiscale… ». */
export function shortSourceTitle(title: string): string {
  return title.split(/[,:(]/)[0].trim()
}

export function projectionErrorMessage(error: ApiError): string {
  if (error.status === 0) {
    return `Impossible de joindre le serveur (${API_BASE_URL}). Vérifiez que le backend est démarré.`
  }
  if (error.status === 422 && error.message !== 'Request failed' && typeof error.details === 'object') {
    const detail = (error.details as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    return 'Une des valeurs saisies est hors limites.'
  }
  return `Le calcul a échoué (erreur ${error.status}). Réessayez dans un instant.`
}
