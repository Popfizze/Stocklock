import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatDuration } from '../labForm'
import { COLUMN_LABELS, FLOW_STATUS_LABELS, type FlowNode, type FlowStatus } from './flowModel'

const VARIANTS: Record<FlowStatus, 'secondary' | 'warning' | 'success' | 'destructive'> = {
  idle: 'secondary',
  pending: 'secondary',
  running: 'warning',
  ok: 'success',
  warning: 'warning',
  error: 'destructive',
  skipped: 'secondary',
}

interface StagePanelProps {
  /** The node picked in the diagram; none yet shows the hint. */
  node: FlowNode | undefined
  description?: string
  children?: ReactNode
}

/** The detail of the node picked in the diagram, drawn under it. */
export function StagePanel({ node, description, children }: StagePanelProps) {
  if (!node) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Cliquez une étape du diagramme pour voir son détail : statut, durée, décisions, données,
        sources.
      </p>
    )
  }
  return (
    <section aria-label={`Détail : ${node.label}`} className="space-y-4 rounded-xl border border-border p-4 sm:p-5">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-lg font-semibold tracking-tight">
            {node.order !== undefined && `${node.order}. `}
            {node.label}
          </h3>
          <Badge variant={VARIANTS[node.status]}>{FLOW_STATUS_LABELS[node.status]}</Badge>
          <span className="text-xs text-muted-foreground">
            {COLUMN_LABELS[node.column]}
            {node.durationMs !== null && ` · Durée : ${formatDuration(node.durationMs)}`}
          </span>
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  )
}
