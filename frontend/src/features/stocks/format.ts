/** Display formatting of the Tableau de bord and the stock pages (fr-CA: no-break space, decimal comma). */

import type { ApiError } from '@/api/client'

const LOCALE = 'fr-CA'

const LONG_DATE = new Intl.DateTimeFormat(LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  // API dates are calendar days (`YYYY-MM-DD`, parsed as UTC midnight).
  timeZone: 'UTC',
})

const INTEGER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })

/** 166,19 $ US · 289,39 $ */
export function formatPrice(value: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, { style: 'currency', currency }).format(value)
}

/** Dividends can be fractions of a cent: 0,004 $ US · 0,25 $ US */
export function formatDividend(value: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value)
}

/** +1,25 $ · -7,54 $ US */
export function formatSignedPrice(value: number, currency: string): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    signDisplay: 'exceptZero',
  }).format(value)
}

/** A change in percent: -4.3401 → -4,34 % */
export function formatSignedPercent(percent: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(percent / 100)
}

/** A ratio: 0.003129 → 0,31 % */
export function formatRatio(ratio: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ratio)
}

/** 742 789 000 */
export function formatInteger(value: number): string {
  return INTEGER.format(value)
}

/** 2026-11-12 → 12 novembre 2026 */
export function formatLongDate(isoDate: string): string {
  return LONG_DATE.format(new Date(isoDate))
}

export type Trend = 'up' | 'down' | 'flat'

export function trendOf(delta: number): Trend {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

/** Text color of a change: green up, red down (semantic tokens). */
export const TREND_TEXT: Record<Trend, string> = {
  up: 'text-success',
  down: 'text-destructive',
  flat: 'text-muted-foreground',
}

/** Chart color of a trend, as a CSS variable Recharts can paint with. */
export const TREND_COLOR: Record<Trend, string> = {
  up: 'var(--success)',
  down: 'var(--destructive)',
  flat: 'var(--muted-foreground)',
}

export function stockErrorMessage(error: ApiError): string {
  if (error.status === 0) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
  }
  if (error.status === 404) return 'Ce titre ne fait pas partie des données du datathon.'
  return `Le chargement des cours a échoué (erreur ${error.status}). Réessayez dans un instant.`
}
