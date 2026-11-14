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
  if (error.status === 404) return 'Ce titre est introuvable : il ne figure ni dans l’univers SEC + TMX ni dans les données du datathon.'
  return `Le chargement des cours a échoué (erreur ${error.status}). Réessayez dans un instant.`
}

/** Errors of the dashboard's sections, the search and the score. */
export function marketErrorMessage(error: ApiError): string {
  if (error.status === 0) {
    return 'Impossible de joindre le serveur. Vérifiez votre connexion, puis réessayez.'
  }
  // 503: the data provider is down, and the server says so in French.
  if (error.status === 503 && error.message) return error.message
  return `Le chargement a échoué (erreur ${error.status}). Réessayez dans un instant.`
}

const KEEP_UPPER = new Set(['LLC', 'PLC', 'SA', 'NV', 'AG', 'LP', 'ETF', 'USA', 'US', 'II', 'III', 'IV'])

const SMALL_WORDS = new Set(['of', 'and', 'the', 'for', 'de', 'du', 'des', 'et', 'la', 'le'])

/**
 * SEC names come in upper case (« ROYAL BANK OF CANADA »): shown in title
 * case. A name that already has lower case is left as it is.
 */
export function displayName(name: string): string {
  if (name !== name.toUpperCase()) return name
  return name
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      if (index > 0 && SMALL_WORDS.has(word)) return word
      if (KEEP_UPPER.has(word.replace(/[.,]/g, '').toUpperCase())) return word.toUpperCase()
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/** A card's price: the currency can be missing (plain number then), the price too (« — »). */
export function formatCardPrice(price: number | null, currency: string | null): string {
  if (price === null) return '—'
  if (currency === null) {
    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price)
  }
  return formatPrice(price, currency)
}

const SCORE = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })
const POINTS = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const WEIGHT = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 })
const DECIMAL = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })
const RATIO = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })

/** A score or a rank out of 100: 65.4 → 65,4 · 92 → 92 */
export function formatScore(value: number): string {
  return SCORE.format(value)
}

/** A contribution in points of the final score: 11.6 → 11,6 · 23 → 23,0 */
export function formatPoints(value: number): string {
  return POINTS.format(value)
}

/** A weight: 0.25 → 25 % */
export function formatWeight(weight: number): string {
  return WEIGHT.format(weight)
}

/** A raw indicator in its unit: ratio 0.243 → 24,3 % · multiple 35.2 → 35,2× · number 0.3 → 0,3 */
export function formatIndicator(value: number | null, unit: 'ratio' | 'multiple' | 'number'): string {
  if (value === null) return '—'
  if (unit === 'ratio') return RATIO.format(value)
  if (unit === 'multiple') return `${DECIMAL.format(value)}×`
  return DECIMAL.format(value)
}

/** A share, a volatility or a return: 0.486 → 48,6 % */
export function formatPercent(ratio: number): string {
  return RATIO.format(ratio)
}

const COMPACT = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })

/** A large count, shortened: 182 400 000 → 182,4 M */
export function formatCompact(value: number): string {
  return COMPACT.format(value)
}

/** Errors of a stock page block: the server explains its 404, 422 and 503 in French. */
export function blockErrorMessage(error: ApiError): string {
  const explained = [404, 422, 503].includes(error.status) && error.message !== 'Request failed'
  return explained && error.message ? error.message : marketErrorMessage(error)
}
