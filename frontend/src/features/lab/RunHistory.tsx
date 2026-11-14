import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface HistoryItem {
  id: string
  statusLabel: string
  statusVariant: 'secondary' | 'warning' | 'success' | 'destructive'
  /** When the run started, already formatted. */
  when: string
  summary: string
  /** A second, quieter line: changed options, trigger… */
  detail?: string
}

interface RunHistoryProps {
  items: HistoryItem[]
  /** The run on screen, when the page can show a past run. */
  shownId?: string | null
  onShow?: (id: string) => void
  /** The (at most two) runs picked for the comparison. */
  compareIds: string[]
  onToggleCompare: (id: string) => void
  /** The comparison, drawn under the list once two runs are picked. */
  children?: ReactNode
}

/** « Historique » : the pipeline's runs, newest first; two of them can be compared side by side. */
export function RunHistory({ items, shownId, onShow, compareIds, onToggleCompare, children }: RunHistoryProps) {
  return (
    <section aria-labelledby="historique-runs" className="space-y-3">
      <div className="space-y-1">
        <h2 id="historique-runs" className="text-3xl leading-tight">
          Historique
        </h2>
        <p className="text-sm text-muted-foreground">
          {items.length === 0
            ? 'Aucun run pour l’instant.'
            : 'Cochez deux runs pour les comparer côte à côte.'}
        </p>
      </div>

      {items.length > 0 && (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {items.map((item) => {
            const picked = compareIds.includes(item.id)
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={picked}
                    disabled={!picked && compareIds.length >= 2}
                    onChange={() => onToggleCompare(item.id)}
                    aria-label={`Comparer le run du ${item.when}`}
                    className="size-4 accent-primary"
                  />
                </label>
                <Badge variant={item.statusVariant}>{item.statusLabel}</Badge>
                <span className="tabular-nums">{item.when}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{item.summary}</span>
                  {item.detail && <span className="block text-xs text-muted-foreground">{item.detail}</span>}
                </span>
                {onShow && (
                  <Button
                    type="button"
                    variant={item.id === shownId ? 'secondary' : 'outline'}
                    size="xs"
                    aria-pressed={item.id === shownId}
                    aria-label={`Voir le run du ${item.when}`}
                    onClick={() => onShow(item.id)}
                  >
                    {item.id === shownId ? 'Affiché' : 'Voir'}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {children}
    </section>
  )
}
