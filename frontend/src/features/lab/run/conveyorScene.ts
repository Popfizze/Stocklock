import type { SceneFlow, SceneTile, TileTone } from '@/components/three'
import { FLOW_COLUMNS, FLOW_STATUS_LABELS, type FlowNode, type FlowStatus, type Traveller } from './flowModel'

const COLUMN_GAP = 3.2
const ROW_GAP = 1.3
/** Titles of a group stand in rows of this many, in front of their column. */
const TRAVELLERS_PER_ROW = 6
const TRAVELLER = 0.3
/** A done stage turns dark; a waiting one stays faint; trouble takes its colour. */
const STATUS_TONES: Record<FlowStatus, TileTone> = {
  idle: 6,
  pending: 6,
  running: 5,
  ok: 3,
  warning: 'warn',
  error: 'alert',
  skipped: 7,
}
export const TRAVELLER_PREFIX = 'titre:'

/** A stage's block is a stack: one tile per order of magnitude of rows it handled (at least one). */
function stackHeight(rows: number | null): number {
  return rows === null || rows <= 0 ? 1 : Math.min(5, 1 + Math.floor(Math.log10(rows)))
}

/** The conveyor's tiles: a slab per layer, a stack per stage, a small tile per title of the group. */
export function conveyorScene(
  nodes: FlowNode[],
  travellers: Traveller[],
  selected: string | null,
): { tiles: SceneTile[]; flows: SceneFlow[] } {
  const tiles: SceneTile[] = []
  const centres: Array<{ x: number; busy: boolean }> = []
  FLOW_COLUMNS.forEach((column, columnIndex) => {
    const own = nodes.filter((node) => node.column === column)
    const here = travellers.map((traveller, index) => ({ traveller, index })).filter(({ traveller }) => traveller.column === column)
    const x = columnIndex * COLUMN_GAP
    const depth = Math.max(1, own.length) * ROW_GAP + 0.5
    tiles.push({ x, z: 0, w: 2.2, d: depth, y: -0.16, h: 0.14, tone: 8 })
    own.forEach((node, row) => {
      const z = (row - (own.length - 1) / 2) * ROW_GAP
      const label = `${node.order ? `${node.order}. ` : ''}${node.label} · ${FLOW_STATUS_LABELS[node.status]}`
      // The chosen stage stands on an ink plate.
      if (node.id === selected) tiles.push({ x, z, w: 1.9, d: 1.15, y: -0.02, h: 0.05, tone: 1 })
      for (let level = 0; level < stackHeight(node.rows); level++) {
        tiles.push({ id: node.id, x, z, y: 0.04 + level * 0.5, h: 0.46, w: 1.5, tone: STATUS_TONES[node.status], label })
      }
    })
    here.forEach(({ traveller, index }, position) => {
      tiles.push({
        id: `${TRAVELLER_PREFIX}${index}`,
        x: x + ((position % TRAVELLERS_PER_ROW) - (TRAVELLERS_PER_ROW - 1) / 2) * (TRAVELLER + 0.08),
        z: depth / 2 + 0.45 + Math.floor(position / TRAVELLERS_PER_ROW) * (TRAVELLER + 0.08),
        w: TRAVELLER,
        d: TRAVELLER,
        h: TRAVELLER,
        tone: traveller.status === 'ok' ? 2 : STATUS_TONES[traveller.status],
        label: `${traveller.label} · ${FLOW_STATUS_LABELS[traveller.status]}`,
      })
    })
    if (own.length > 0) centres.push({ x, busy: own.some((node) => node.status === 'running' || node.status === 'ok' || node.status === 'warning') })
  })
  // While the run is going, data tiles travel from each layer that has started to the next one:
  // one per title of the group (a few when the run is not a group).
  const flows: SceneFlow[] = []
  if (nodes.some((node) => node.status === 'running')) {
    const count = Math.min(10, Math.max(3, travellers.length))
    for (let index = 0; index < centres.length - 1; index++) {
      if (centres[index].busy) {
        flows.push({ from: [centres[index].x + 0.6, 0], to: [centres[index + 1].x - 0.6, 0], count, tone: 3 })
      }
    }
  }
  return { tiles, flows }
}
