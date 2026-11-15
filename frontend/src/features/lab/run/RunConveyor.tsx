import { useMemo } from 'react'
import { Tile3D } from '@/components/three'
import { conveyorScene, TRAVELLER_PREFIX } from './conveyorScene'
import { flowReading, type FlowNode, type Traveller } from './flowModel'

interface RunConveyorProps {
  nodes: FlowNode[]
  travellers?: Traveller[]
  selected?: string | null
  onSelect?: (nodeId: string) => void
  /** A title of the group was clicked. */
  onTraveller?: (traveller: Traveller) => void
  /** Before the launch: the tag of what waits at the entrance (« 8 titres en attente »). The stages are then named on the scene. */
  preview?: string | null
  /** Names the pipeline: « du pipeline de score ». */
  name: string
  className?: string
}

/** « 1. Collecte, 2. Notation » */
function stageNames(nodes: FlowNode[]): string {
  return nodes
    .filter((node) => node.order !== undefined)
    .map((node) => `${node.order}. ${node.label}`)
    .join(', ')
}

// 3D — the run as a conveyor: Entrées → Bronze → Silver → Gold → Sortie, each stage a stack of tiles (taller when it
// handled more rows) that turns ink when done and red on error; a group's titles are small tiles standing at the
// stage they reached, and data tiles flow between the layers while the run is going.
export function RunConveyor({ nodes, travellers = [], selected = null, onSelect, onTraveller, preview = null, name, className }: RunConveyorProps) {
  const { tiles, flows } = useMemo(
    () => conveyorScene(nodes, travellers, selected, preview ? { waiting: preview } : null),
    [nodes, travellers, selected, preview],
  )

  return (
    <Tile3D
      tiles={tiles}
      flows={flows}
      view="front"
      onSelect={(tile) => {
        if (!tile.id) return
        if (tile.id.startsWith(TRAVELLER_PREFIX)) {
          const traveller = travellers[Number(tile.id.slice(TRAVELLER_PREFIX.length))]
          if (traveller) onTraveller?.(traveller)
        } else {
          onSelect?.(tile.id)
        }
      }}
      label={
        preview
          ? `Convoyeur 3D ${name}, ce qui va s’exécuter : ${preview} aux entrées, puis ${stageNames(nodes)}.`
          : `Convoyeur 3D ${name}, des entrées à la sortie : ${flowReading(nodes, travellers.length)}. Le même état est détaillé étape par étape juste dessous.`
      }
      className={className ?? 'h-52 sm:h-64'}
    />
  )
}
