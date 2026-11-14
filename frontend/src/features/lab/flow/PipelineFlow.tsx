import { ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration } from '../labForm'
import {
  COLUMN_HINTS,
  COLUMN_LABELS,
  FLOW_COLUMNS,
  FLOW_STATUS_LABELS,
  type FlowNode,
  type FlowStatus,
} from './flowModel'

const DOT: Record<FlowStatus, string> = {
  idle: 'border border-border bg-transparent',
  pending: 'bg-border',
  running: 'bg-warning',
  ok: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-destructive',
  skipped: 'bg-muted-foreground/40',
}

const COUNT = new Intl.NumberFormat('fr-CA')

interface PipelineFlowProps {
  nodes: FlowNode[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Names the diagram for assistive technology: « Diagramme du pipeline … ». */
  label: string
}

/**
 * The pipeline as a diagram: five columns, Entrées → Bronze → Silver → Gold →
 * Sortie, each stage a node in its layer, numbered in execution order, with
 * its live status, duration and row count. A node opens its detail.
 */
export function PipelineFlow({ nodes, selectedId, onSelect, label }: PipelineFlowProps) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol aria-label={label} className="flex min-w-max items-stretch lg:min-w-0">
        {FLOW_COLUMNS.map((column, index) => {
          const own = nodes.filter((node) => node.column === column)
          return (
            <li key={column} className="flex min-w-44 flex-1 items-stretch lg:min-w-0">
              {index > 0 && (
                <span aria-hidden="true" className="flex w-7 shrink-0 items-start justify-center pt-0.5 text-muted-foreground">
                  <ChevronRight className="size-4" />
                </span>
              )}
              <section aria-label={COLUMN_LABELS[column]} className="min-w-0 flex-1 space-y-2">
                <div>
                  <h3 className="text-sm font-semibold">{COLUMN_LABELS[column]}</h3>
                  <p className="text-xs text-muted-foreground">{COLUMN_HINTS[column]}</p>
                </div>
                <ul className="space-y-2 border-t border-border pt-3">
                  {own.map((node) => (
                    <li key={node.id}>
                      <FlowNodeButton node={node} selected={node.id === selectedId} onSelect={onSelect} />
                    </li>
                  ))}
                  {own.length === 0 && (
                    <li className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
                      Aucune étape
                    </li>
                  )}
                </ul>
              </section>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

interface FlowNodeButtonProps {
  node: FlowNode
  selected: boolean
  onSelect: (id: string) => void
}

function FlowNodeButton({ node, selected, onSelect }: FlowNodeButtonProps) {
  const figures = [
    node.durationMs === null ? null : formatDuration(node.durationMs),
    node.rows === null ? null : `${COUNT.format(node.rows)} ligne${node.rows > 1 ? 's' : ''}`,
  ].filter((part): part is string => part !== null)

  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        selected && 'border-foreground',
      )}
    >
      <span className="block text-sm font-medium">
        {node.order !== undefined && <span className="text-muted-foreground tabular-nums">{node.order}. </span>}
        {node.label}
      </span>
      <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {node.status === 'running' ? (
          <Loader2 aria-hidden="true" className="size-3 animate-spin motion-reduce:animate-none" />
        ) : (
          <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', DOT[node.status])} />
        )}
        <span>{FLOW_STATUS_LABELS[node.status]}</span>
      </span>
      {figures.length > 0 && (
        <span className="mt-0.5 block text-xs text-muted-foreground tabular-nums">{figures.join(' · ')}</span>
      )}
    </button>
  )
}
