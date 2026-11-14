import { cn } from '@/lib/utils'
import { formatCount, formatDuration } from '../runs/runModel'
import { COLUMN_HINTS, COLUMN_LABELS, FLOW_COLUMNS, FLOW_STATUS_LABELS, type FlowNode, type FlowStatus } from './flowModel'

const STATUS_SWATCHES: Record<FlowStatus, string> = {
  idle: 'bg-tile-6',
  pending: 'bg-tile-6',
  running: 'bg-tile-5 motion-safe:animate-pulse',
  ok: 'bg-tile-3',
  warning: 'bg-warning',
  error: 'bg-destructive',
  skipped: 'bg-tile-7',
}

interface FlowBoardProps {
  nodes: FlowNode[]
  selected: string | null
  onSelect: (nodeId: string) => void
}

/** The conveyor's text equivalent: the five columns, each stage a button that opens its detail. */
export function FlowBoard({ nodes, selected, onSelect }: FlowBoardProps) {
  return (
    <ol aria-label="Étapes du run" className="grid gap-x-3 gap-y-5 sm:grid-cols-5">
      {FLOW_COLUMNS.map((column) => (
        <li key={column} className="min-w-0 space-y-2">
          <p className="eyebrow text-foreground">{COLUMN_LABELS[column]}</p>
          <p className="text-xs text-muted-foreground">{COLUMN_HINTS[column]}</p>
          <ul className="space-y-1.5">
            {nodes
              .filter((node) => node.column === column)
              .map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    aria-pressed={node.id === selected}
                    onClick={() => onSelect(node.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-xl border border-border px-3 py-2 text-left text-sm outline-none transition-colors hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
                      node.id === selected && 'border-foreground bg-secondary',
                    )}
                  >
                    <span aria-hidden="true" className={cn('mt-1 size-3 shrink-0', STATUS_SWATCHES[node.status])} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {node.order ? `${node.order}. ` : ''}
                        {node.label}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {[
                          FLOW_STATUS_LABELS[node.status],
                          node.durationMs === null ? null : formatDuration(node.durationMs),
                          node.rows === null ? null : `${formatCount(node.rows)} lignes`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </li>
      ))}
    </ol>
  )
}
