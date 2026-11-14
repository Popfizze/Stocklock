import { Tile3D, type SceneFlow, type SceneTile, type TileTone } from '@/components/three'
import { FLOW_COLUMNS, FLOW_STATUS_LABELS, type FlowNode, type FlowStatus } from './flowModel'

const COLUMN_GAP = 3.2
const ROW_GAP = 1.3
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

/** A stage's block is a stack: one tile per order of magnitude of rows it handled (at least one). */
function stackHeight(rows: number | null): number {
  return rows === null || rows <= 0 ? 1 : Math.min(5, 1 + Math.floor(Math.log10(rows)))
}

function sceneOf(nodes: FlowNode[]): { tiles: SceneTile[]; flows: SceneFlow[] } {
  const tiles: SceneTile[] = []
  const centres: Array<{ x: number; z: number; busy: boolean }> = []
  FLOW_COLUMNS.forEach((column, columnIndex) => {
    const own = nodes.filter((node) => node.column === column)
    const x = columnIndex * COLUMN_GAP
    // Each layer stands on its own slab of the conveyor.
    tiles.push({ x, z: 0, w: 2.2, d: Math.max(1, own.length) * ROW_GAP + 0.5, y: -0.16, h: 0.14, tone: 8 })
    own.forEach((node, row) => {
      const z = (row - (own.length - 1) / 2) * ROW_GAP
      const label = `${node.order ? `${node.order}. ` : ''}${node.label} · ${FLOW_STATUS_LABELS[node.status]}`
      for (let level = 0; level < stackHeight(node.rows); level++) {
        tiles.push({ id: node.id, x, z, y: level * 0.5, h: 0.46, w: 1.5, tone: STATUS_TONES[node.status], label })
      }
    })
    if (own.length > 0) {
      centres.push({ x, z: 0, busy: own.some((node) => node.status === 'running' || node.status === 'ok') })
    }
  })
  // While the run is going, data tiles travel from each layer that has started to the next one.
  const running = nodes.some((node) => node.status === 'running')
  const flows: SceneFlow[] = []
  if (running) {
    for (let index = 0; index < centres.length - 1; index++) {
      if (centres[index].busy) {
        flows.push({ from: [centres[index].x + 0.6, 0], to: [centres[index + 1].x - 0.6, 0], count: 3, tone: 3 })
      }
    }
  }
  return { tiles, flows }
}

interface PipelineSceneProps {
  nodes: FlowNode[]
  onSelect: (id: string) => void
  /** Names the pipeline: « du pipeline de score ». */
  name: string
}

// 3D — the run as a conveyor: Entrées → Bronze → Silver → Gold → Sortie, each stage a stack of tiles (taller
// when it handled more rows) that turns ink when done and red on error, with data tiles flowing while it runs.
export function PipelineScene({ nodes, onSelect, name }: PipelineSceneProps) {
  const { tiles, flows } = sceneOf(nodes)
  const stages = nodes.filter((node) => node.order !== undefined)
  const count = (status: FlowStatus) => stages.filter((node) => node.status === status).length
  const reading = [
    `${stages.length} étapes`,
    `${count('ok') + count('warning')} terminées`,
    count('running') > 0 ? `${count('running')} en cours` : null,
    count('error') > 0 ? `${count('error')} en erreur` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Tile3D
      tiles={tiles}
      flows={flows}
      view="front"
      onSelect={(tile) => tile.id && onSelect(tile.id)}
      label={`Convoyeur 3D ${name}, des entrées à la sortie : ${reading}. Le même état est détaillé étape par étape dans le diagramme ci-dessous.`}
      className="h-48 sm:h-56"
    />
  )
}
