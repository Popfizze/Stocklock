/**
 * « Mon portefeuille » : the holdings of each investor profile, kept in
 * localStorage (there is no login). A profile that never edited its
 * portfolio starts from its example.
 */

import type { PortfolioHolding } from '@/api/persona'
import { EXAMPLE_PORTFOLIOS } from '@/lib/example-portfolios'

const STORAGE_PREFIX = 'stocklock.portfolio.'

/** Most holdings the analysis accepts. */
export const MAX_HOLDINGS = 40

function isHolding(value: unknown): value is PortfolioHolding {
  if (typeof value !== 'object' || value === null) return false
  const holding = value as Record<string, unknown>
  return typeof holding.ticker === 'string' && typeof holding.weight === 'number'
}

export function examplePortfolio(personaId: string): PortfolioHolding[] {
  return (EXAMPLE_PORTFOLIOS[personaId] ?? []).map((holding) => ({ ...holding }))
}

/** The stored holdings, else the profile's example (nothing stored, storage blocked, or not ours). */
export function readPortfolio(personaId: string): PortfolioHolding[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + personaId)
    if (raw === null) return examplePortfolio(personaId)
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isHolding).slice(0, MAX_HOLDINGS) : examplePortfolio(personaId)
  } catch {
    return examplePortfolio(personaId)
  }
}

/** Never throws: with storage blocked the edits last until the page is left. */
export function storePortfolio(personaId: string, holdings: PortfolioHolding[]): void {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + personaId, JSON.stringify(holdings))
  } catch {
    // Storage blocked or full.
  }
}

/** Forgets the edits: the profile is back on its example. */
export function clearPortfolio(personaId: string): void {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + personaId)
  } catch {
    // Storage blocked.
  }
}

/** Sum of the weights as typed (the analysis normalises them). */
export function totalWeight(holdings: PortfolioHolding[]): number {
  return holdings.reduce((sum, holding) => sum + (Number.isFinite(holding.weight) ? holding.weight : 0), 0)
}

const PERCENT = new Intl.NumberFormat('fr-CA', { style: 'percent', maximumFractionDigits: 1 })

/** A fraction as a percentage: 0.112 → 11,2 % · 0.1 → 10 % */
export function formatShare(value: number | null): string {
  return value === null ? '—' : PERCENT.format(value)
}
