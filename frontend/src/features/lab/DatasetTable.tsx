import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import type { LabCell, LabDataset, LabSource } from '@/api/lab'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatValue } from './labForm'

/** Rows drawn at once: a dataset can hold tens of thousands. */
export const DATASET_PAGE_SIZE = 100

const COUNT = new Intl.NumberFormat('fr-CA')

function plural(count: number, word: string): string {
  return `${COUNT.format(count)} ${word}${count > 1 ? 's' : ''}`
}

interface DatasetTableProps {
  dataset: LabDataset
  /** The sources `dataset.source_id` can resolve in: the stage's, then the run's. */
  sources: LabSource[]
}

/**
 * One dataset a stage fetched or produced, whole: every column, and every row
 * the server sent, page by page, in a scrollable table with a sticky header.
 * Collapsed until opened; nothing of the table is rendered before.
 */
export function DatasetTable({ dataset, sources }: DatasetTableProps) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(0)
  const source =
    dataset.source_id === null
      ? undefined
      : sources.find((candidate) => candidate.id === dataset.source_id)

  const received = dataset.rows.length
  const pageCount = Math.max(1, Math.ceil(received / DATASET_PAGE_SIZE))
  const first = page * DATASET_PAGE_SIZE
  const rows = dataset.rows.slice(first, first + DATASET_PAGE_SIZE)

  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group/dataset overflow-hidden rounded-xl border border-border"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/dataset:rotate-90"
        />
        <span className="font-medium">{dataset.title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {plural(dataset.total_rows, 'ligne')} × {plural(dataset.columns.length, 'colonne')}
        </span>
        {dataset.truncated && (
          <Badge variant="warning">
            Tronqué : {plural(received, 'ligne')} sur {COUNT.format(dataset.total_rows)}
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {source ? `Source : ${source.title}` : dataset.source_id === null ? 'Calculé par StockLock' : ''}
        </span>
      </summary>

      {open && received === 0 && (
        <p className="border-t border-border px-3 py-3 text-sm text-muted-foreground">Aucune ligne.</p>
      )}

      {open && received > 0 && (
        <>
          <div
            role="region"
            aria-label={`Données : ${dataset.title}`}
            tabIndex={0}
            className="max-h-96 overflow-auto border-t border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            <table className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-2 text-right font-medium text-muted-foreground"
                  >
                    <span className="sr-only">Ligne</span>
                    <span aria-hidden="true">#</span>
                  </th>
                  {dataset.columns.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-2 text-left font-medium whitespace-nowrap"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={first + index} className="hover:bg-muted/40">
                    <td className="border-b border-border px-3 py-1.5 text-right text-muted-foreground">
                      {COUNT.format(first + index + 1)}
                    </td>
                    {row.map((cell, cellIndex) => (
                      <DataCell key={cellIndex} cell={cell} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <p className="tabular-nums" aria-live="polite">
              Lignes {COUNT.format(first + 1)}–{COUNT.format(first + rows.length)} sur{' '}
              {COUNT.format(dataset.total_rows)}
              {dataset.truncated && ` (${COUNT.format(received)} reçues)`}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={page === 0}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Précédentes
                </Button>
                <span className="tabular-nums">
                  Page {COUNT.format(page + 1)} / {COUNT.format(pageCount)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Suivantes
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </details>
  )
}

function DataCell({ cell }: { cell: LabCell }) {
  return (
    <td
      className={cn(
        'max-w-md truncate border-b border-border px-3 py-1.5 whitespace-nowrap',
        typeof cell === 'number' && 'text-right',
        cell === null && 'text-muted-foreground',
      )}
      title={typeof cell === 'string' && cell.length > 60 ? cell : undefined}
    >
      {formatValue(cell)}
    </td>
  )
}
