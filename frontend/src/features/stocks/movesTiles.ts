import type { StockMovesResult } from '@/api/moves'
import type { SceneTile } from '@/components/three'
import { formatLongDate } from './format'
import { EXPLANATIONS, signedRatio } from './movesMeta'

/** Most sessions drawn: a year of daily closes is thinned to about one tile every seven sessions. */
const MAX_COLUMNS = 36
/** Height of the period's largest cumulative return, in tile units. */
const HEIGHT = 7
const FLOOR = 0.1
/** A marked move's spike: a base, plus its abnormal return, capped. */
const SPIKE_BASE = 1.6
const SPIKE_PER_RATIO = 45
const SPIKE_MAX = 7
const SPIKE_ROW = -1.5
const INDEX_ROW = 1.15
const CURSOR_ROW = 2.3

const SHORT_DAY = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'short' })

export type RibbonColumn = StockMovesResult['series'][number]

/** The sessions drawn: evenly thinned, always with the first, the last and every marked move's day. */
export function ribbonColumns(result: StockMovesResult): RibbonColumn[] {
  const { series, moves } = result
  if (series.length <= MAX_COLUMNS) return series
  const marked = new Set(moves.map((move) => move.date))
  const step = (series.length - 1) / (MAX_COLUMNS - 1)
  const kept = new Set(Array.from({ length: MAX_COLUMNS }, (_, index) => Math.round(index * step)))
  return series.filter((point, index) => kept.has(index) || marked.has(point.date))
}

/** The column a date falls on: its own, or the first session after it (the last one past the end). */
export function columnOf(columns: RibbonColumn[], date: string): number {
  const index = columns.findIndex((column) => column.date >= date)
  return index === -1 ? columns.length - 1 : index
}

const raised = (value: number | null, scale: number): number => {
  if (value === null) return FLOOR
  const height = value * scale
  return Math.abs(height) < FLOOR ? (value < 0 ? -FLOOR : FLOOR) : height
}

/**
 * The period as a ribbon: one tile per session for the title (its cumulative
 * return, hanging when negative), a thinner row behind for its index, and in
 * front a spike for each marked move — green up, red down — capped with a tile
 * when a dated event goes with it. The pinned session, if any, gets a pole
 * behind the ribbon.
 */
export function ribbonTiles(result: StockMovesResult, columns: RibbonColumn[], pinned: string | null = null): SceneTile[] {
  const benchmark = result.benchmark ?? 'indice'
  const peak = Math.max(0.01, ...columns.flatMap((column) => [Math.abs(column.asset ?? 0), Math.abs(column.benchmark ?? 0)]))
  const scale = HEIGHT / peak
  const tiles: SceneTile[] = []

  columns.forEach((column, x) => {
    const label = `${formatLongDate(column.date)} · ${result.ticker} ${column.asset === null ? 'n. d.' : signedRatio(column.asset)} depuis le début · ${benchmark} ${column.benchmark === null ? 'n. d.' : signedRatio(column.benchmark)}`
    tiles.push({ id: column.date, x, z: 0, h: raised(column.asset, scale), tone: 2, label })
    tiles.push({ id: column.date, x, z: INDEX_ROW, d: 0.6, h: raised(column.benchmark, scale), tone: 6, label })
  })

  for (const move of result.moves) {
    const x = columnOf(columns, move.date)
    const up = move.abnormal >= 0
    const height = Math.min(SPIKE_MAX, SPIKE_BASE + Math.abs(move.abnormal) * SPIKE_PER_RATIO) * (up ? 1 : -1)
    const explanation = EXPLANATIONS[move.explanation].label
    const label = `${formatLongDate(move.date)} · mouvement marquant : titre ${signedRatio(move.asset)}, écart ${signedRatio(move.abnormal)} · ${explanation}${move.event ? ` : ${move.event.summary}` : ''}`
    tiles.push({
      id: move.date,
      x,
      z: SPIKE_ROW,
      w: 0.8,
      d: 0.8,
      h: height,
      tone: up ? 'up' : 'down',
      label,
      // Each marked move carries its day and its gap to the index.
      tag: `${SHORT_DAY.format(new Date(`${move.date}T12:00:00`))}\n${signedRatio(move.abnormal)}`,
      tagAt: up ? 'top' : 'base',
    })
    if (move.event) {
      tiles.push({
        id: move.date,
        x,
        z: SPIKE_ROW,
        w: 0.45,
        d: 0.45,
        y: up ? height : 0,
        h: 0.7,
        tone: move.explanation === 'fait' ? 1 : 4,
        label,
      })
    }
  }
  if (pinned !== null) {
    tiles.push({
      id: pinned,
      x: columnOf(columns, pinned),
      z: CURSOR_ROW,
      w: 0.3,
      d: 0.3,
      h: HEIGHT,
      tone: 'warn',
      label: `Séance épinglée : ${formatLongDate(pinned)}`,
    })
  }
  return tiles
}
