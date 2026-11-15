/** The two 3D scenes of « Comparer » : the conveyors face to face, then the measures and parameters in pairs. */

import type { SceneTile, TileTone } from '@/components/three'
import { formatValue } from '../labForm'
import { COLUMN_LABELS, FLOW_COLUMNS, FLOW_STATUS_LABELS, INPUT_NODE, OUTPUT_NODE, type FlowNode, type FlowStatus } from '../run/flowModel'
import type { RunView } from '../run/runView'
import { formatCount, formatDuration } from '../runs/runModel'
import { compareRows, type CompareSide } from './compareModel'

const COLUMN_GAP = 4
/** Run A stands in front, run B behind. */
const ROW_Z = 1.25
const STAGE = 0.8
const FLAT = 0.3
const RAISED = 1.7
const STATUS_TONES: Record<FlowStatus, TileTone> = { idle: 6, pending: 6, running: 4, ok: 1, warning: 'warn', error: 'alert', skipped: 5 }

/** Two runs of the same pipeline can be compared stage by stage. */
export function samePipeline(a: RunView, b: RunView): boolean {
  return a.pipelineId === b.pipelineId
}

const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/** What differs between the same stage of two runs, in a few words; null when nothing does. */
export function stageDifference(a: FlowNode | undefined, b: FlowNode | undefined): string | null {
  if (!a) return 'absente de A'
  if (!b) return 'absente de B'
  if (a.status !== b.status) return `${FLOW_STATUS_LABELS[a.status]} → ${FLOW_STATUS_LABELS[b.status]}`
  if (a.rows !== null && b.rows !== null && a.rows !== b.rows) return `${formatCount(a.rows)} → ${formatCount(b.rows)} lignes`
  if (a.durationMs !== null && b.durationMs !== null) {
    const [low, high] = [Math.min(a.durationMs, b.durationMs), Math.max(a.durationMs, b.durationMs)]
    // A stage that took at least half as long again, and visibly so.
    if (high - low >= 500 && high >= low * 1.5) return `${formatDuration(a.durationMs)} → ${formatDuration(b.durationMs)}`
  }
  return null
}

export interface ConveyorComparison {
  tiles: SceneTile[]
  /** The stages that differ, named: the scene's text. */
  differing: string[]
  same: boolean
}

/**
 * The two runs as conveyors facing each other, A in front and B behind, column by column. Same pipeline:
 * a stage that differs rises and lights up, with what changed written on it, and the others lie flat.
 * Different pipelines: each conveyor keeps its own stages, in its run's shade, and nothing is paired.
 */
export function conveyorComparison(a: RunView, b: RunView, sides: readonly [CompareSide, CompareSide]): ConveyorComparison {
  const same = samePipeline(a, b)
  const tiles: SceneTile[] = []
  const differing: string[] = []
  const changedParams = compareRows(sides[0].params, sides[1].params).filter((row) => row.differs).length
  const changedResults = compareRows(sides[0].results, sides[1].results).filter((row) => row.differs && row.name !== 'Durée').length

  const difference = (left: FlowNode | undefined, right: FlowNode | undefined): string | null => {
    const node = left ?? right
    if (node?.id === INPUT_NODE) return changedParams > 0 ? `${changedParams} changé${changedParams > 1 ? 's' : ''}` : null
    if (node?.id === OUTPUT_NODE) return changedResults > 0 ? `${changedResults} écart${changedResults > 1 ? 's' : ''}` : null
    return stageDifference(left, right)
  }

  // Each run's name, at the head of its conveyor.
  tiles.push({ x: -COLUMN_GAP * 0.75, z: ROW_Z, w: 1, d: 1, h: 0.7, tone: 2, tag: `A · ${short(a.title, 16)}`, tagShort: 'A', tagFirst: true })
  tiles.push({ x: -COLUMN_GAP * 0.75, z: -ROW_Z, w: 1, d: 1, h: 0.7, tone: 5, tag: `B · ${short(b.title, 16)}`, tagShort: 'B', tagFirst: true })

  FLOW_COLUMNS.forEach((column, index) => {
    const x = index * COLUMN_GAP
    const left = a.nodes.filter((node) => node.column === column)
    const right = b.nodes.filter((node) => node.column === column)
    const counts = same || column === 'entrees' || column === 'sortie' ? '' : `\nA ${left.length} · B ${right.length}`
    tiles.push({ x, z: 0, w: COLUMN_GAP - 0.5, d: ROW_Z * 2 + 1.5, y: -0.16, h: 0.14, tone: 8, tag: `${COLUMN_LABELS[column]}${counts}`, tagShort: COLUMN_LABELS[column], tagAt: 'base' })
    // Same pipeline: a stage keeps the same place on both conveyors, so the eye pairs them.
    const ids = same ? [...new Set([...left, ...right].map((node) => node.id))] : null
    const draw = (nodes: FlowNode[], others: FlowNode[], z: number, side: 'A' | 'B') => {
      const slots = ids ?? nodes.map((node) => node.id)
      slots.forEach((id, slot) => {
        const node = nodes.find((candidate) => candidate.id === id)
        if (!node) return
        const other = others.find((candidate) => candidate.id === id)
        const note = same ? difference(side === 'A' ? node : other, side === 'A' ? other : node) : null
        const sx = x + (slot - (slots.length - 1) / 2) * (STAGE + 0.08)
        const label = `${side} · ${node.order ? `${node.order}. ` : ''}${node.label} · ${FLOW_STATUS_LABELS[node.status]}${node.durationMs === null ? '' : ` · ${formatDuration(node.durationMs)}`}`
        if (note) {
          // Named once per stage: on A's tile, or on B's when A has no such stage.
          if (side === 'A' || !other) differing.push(`${node.label} (${note})`)
          tiles.push({ x: sx, z, w: STAGE + 0.24, d: STAGE + 0.24, y: -0.02, h: 0.06, tone: 'warn' })
          tiles.push({ x: sx, z, w: STAGE, d: STAGE, y: 0.04, h: RAISED, tone: STATUS_TONES[node.status], label: `${label} · ${note}`, tag: side === 'A' || !other ? `${short(node.label, 14)}\n${note}` : undefined, tagFirst: true })
        } else {
          const tone: TileTone = same ? (node.status === 'error' ? 'alert' : 7) : node.status === 'error' ? 'alert' : side === 'A' ? 2 : 5
          tiles.push({ x: sx, z, w: STAGE, d: STAGE, y: 0.04, h: same ? FLAT : 0.3 + Math.min(3, Math.log10(1 + (node.durationMs ?? 0) / 100)) * 0.35, tone, label })
        }
      })
    }
    draw(left, right, ROW_Z, 'A')
    draw(right, left, -ROW_Z, 'B')
  })
  return { tiles, differing, same }
}

export interface MeasureComparison {
  tiles: SceneTile[]
  /** The measures both runs have. */
  shared: string[]
  /** The parameters drawn, changed ones first. */
  params: string[]
}

const MAX_PAIRS = 8
const MAX_PARAMS = 6
const PARAM_GAP = 2.4

function delta(a: number, b: number): string {
  const gap = b - a
  if (gap === 0) return '='
  return `${gap > 0 ? '+' : '−'}${formatValue(Math.abs(Math.round(gap * 100) / 100))}`
}

/**
 * The numbers both runs have, as paired towers (A in ink, B in grey, each pair scaled to its larger value) with
 * the gap written on top, then the parameters as small tiles: one that changed is split in two uneven halves
 * and carries « before → after », one that did not lies flat.
 */
export function measureComparison(left: CompareSide, right: CompareSide): MeasureComparison {
  const shared = Object.keys(left.numbers)
    .filter((name) => name in right.numbers)
    .slice(0, MAX_PAIRS)
  const tiles: SceneTile[] = []
  shared.forEach((name, index) => {
    const a = left.numbers[name]
    const b = right.numbers[name]
    const top = Math.max(Math.abs(a), Math.abs(b), 1e-9)
    const equal = a === b
    const label = `${name} · A : ${formatValue(a)} · B : ${formatValue(b)}`
    const x = index * 2.2
    const heights = [0.25 + (Math.abs(a) / top) * 2.8, 0.25 + (Math.abs(b) / top) * 2.8]
    tiles.push({ x, z: 0, w: 2, d: 1.4, y: -0.14, h: 0.12, tone: 8, tag: name, tagAt: 'base' })
    tiles.push({ x: x - 0.45, z: 0, w: 0.8, d: 0.8, h: heights[0], tone: equal ? 6 : 2, label })
    tiles.push({ x: x + 0.45, z: 0, w: 0.8, d: 0.8, h: heights[1], tone: equal ? 6 : 5, label })
    // The gap sits on the taller tower of the pair.
    tiles.push({
      x: x + (heights[0] >= heights[1] ? -0.45 : 0.45),
      z: 0,
      w: 0.5,
      d: 0.5,
      y: Math.max(...heights),
      h: 0.02,
      tone: equal ? 6 : 2,
      label,
      tag: equal ? `${formatValue(a)} =` : `${formatValue(a)} → ${formatValue(b)}\n${delta(a, b)}`,
      tagShort: equal ? '=' : delta(a, b),
      tagFirst: !equal,
    })
  })

  const rows = compareRows(left.params, right.params)
  const ordered = [...rows.filter((row) => row.differs), ...rows.filter((row) => !row.differs)].slice(0, MAX_PARAMS)
  const start = shared.length * 2.2 + 1.2
  ordered.forEach((row, index) => {
    const x = start + index * PARAM_GAP
    const label = `${row.name} · A : ${row.left} · B : ${row.right}`
    const name = short(row.name.replace(/^option /, ''), 14)
    if (row.differs) {
      tiles.push({ x: x - 0.35, z: 0, w: 0.7, d: 1.2, h: 0.9, tone: 2, label })
      tiles.push({ x: x + 0.35, z: 0, w: 0.7, d: 1.2, h: 1.5, tone: 'warn', label, tag: `${name}\n${short(row.left, 8)} → ${short(row.right, 8)}`, tagShort: short(name, 8), tagFirst: true })
    } else {
      tiles.push({ x, z: 0, w: 1.4, d: 1.2, h: 0.18, tone: 7, label })
    }
  })
  if (ordered.length > 0) {
    tiles.push({ x: start + ((ordered.length - 1) * PARAM_GAP) / 2, z: 0, w: ordered.length * PARAM_GAP, d: 1.8, y: -0.14, h: 0.12, tone: 8, tag: 'Paramètres', tagAt: 'base' })
  }
  return { tiles, shared, params: ordered.map((row) => row.name) }
}
