/** Pure helpers of « Éléments générés »: an artifact's shape glyph and the mini histogram of a key column. */

import type { LabCell } from '@/api/lab'
import type { RunArtifact, RunArtifactKind } from '@/api/runs'

const LOCALE = 'fr-CA'
const NUMBER = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 })

export const KIND_LABELS: Record<RunArtifactKind, string> = {
  dataset: 'Jeu de données',
  decisions: 'Décisions',
  file: 'Fichier',
}

/** Rows fetched per page of the grid. */
export const PAGE_SIZE = 100

export function formatBytes(bytes: number | null): string | null {
  if (bytes === null) return null
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${NUMBER.format(bytes / 1024)} Ko`
  return `${NUMBER.format(bytes / (1024 * 1024))} Mo`
}

/** « 25 604 lignes × 9 colonnes », with what is known. */
export function shapeText(rows: number | null, columns: number | null): string {
  const rowText = rows === null ? 'lignes : à lire' : `${rows.toLocaleString(LOCALE)} ligne${rows > 1 ? 's' : ''}`
  return columns === null ? rowText : `${rowText} × ${columns} colonne${columns > 1 ? 's' : ''}`
}

/**
 * The artifact's silhouette as a small grid of tiles: one tile column per data column (12 at
 * most), and two tile rows per order of magnitude of rows (a 3-row table is squat, a 25 000-row one tall).
 */
export function shapeGlyph(rows: number | null, columns: number | null): { columns: number; rows: number } {
  return {
    columns: Math.min(12, Math.max(1, columns ?? 1)),
    rows: rows === null || rows <= 0 ? 1 : Math.min(10, Math.max(1, Math.round(Math.log10(rows + 1) * 2))),
  }
}

export interface ColumnSummary {
  column: string
  /** `numeric`: a histogram of the values; `category`: how often the most frequent values appear. */
  kind: 'numeric' | 'category'
  /** Bar heights, 0-1. */
  bars: number[]
  /** « close : de 101,5 à 240,2 (100 lignes lues) ». */
  caption: string
}

const BINS = 12
/** Columns that identify rows rather than measure something: skipped when another one exists. */
const ID_LIKE = /^(id|index|cik|annee|année|year|fy|rang|rank)$/i

/** The mini histogram of a key column: the first numeric one that varies, else the most telling text one. */
export function columnSummary(columns: string[], rows: LabCell[][]): ColumnSummary | null {
  if (rows.length < 3) return null
  let fallback: ColumnSummary | null = null
  for (let index = 0; index < columns.length; index++) {
    const values = rows.map((row) => row[index]).filter((cell): cell is number => typeof cell === 'number' && Number.isFinite(cell))
    if (values.length < Math.max(3, rows.length / 2)) continue
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (min === max) continue
    const counts = new Array<number>(BINS).fill(0)
    for (const value of values) counts[Math.min(BINS - 1, Math.floor(((value - min) / (max - min)) * BINS))]++
    const top = Math.max(...counts)
    const summary: ColumnSummary = {
      column: columns[index],
      kind: 'numeric',
      bars: counts.map((count) => count / top),
      caption: `${columns[index]} : de ${NUMBER.format(min)} à ${NUMBER.format(max)} (${values.length} lignes lues)`,
    }
    if (!ID_LIKE.test(columns[index])) return summary
    fallback ??= summary
  }
  if (fallback) return fallback
  for (let index = 0; index < columns.length; index++) {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const cell = row[index]
      if (typeof cell === 'string' && cell !== '') counts.set(cell, (counts.get(cell) ?? 0) + 1)
    }
    // A column of categories: a few values that repeat.
    if (counts.size < 2 || counts.size > rows.length / 2) continue
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, BINS)
    return {
      column: columns[index],
      kind: 'category',
      bars: ranked.map(([, count]) => count / ranked[0][1]),
      caption: `${columns[index]} : ${ranked
        .slice(0, 3)
        .map(([value, count]) => `${value} (${count})`)
        .join(', ')}${counts.size > 3 ? '…' : ''}`,
    }
  }
  return null
}

/** Artifacts by stage, in the order the server lists them; `null`: the run's own artifacts. */
export function artifactStages(artifacts: RunArtifact[]): Array<string | null> {
  return [...new Set(artifacts.map((artifact) => artifact.stage_id))]
}
