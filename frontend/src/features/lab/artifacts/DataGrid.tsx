import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { formatValue } from '../labForm'

type Cell = string | number | boolean | null

interface DataGridProps {
  /** Names the table for assistive technology: « Données : univers.csv ». */
  label: string
  columns: string[]
  rows: Cell[][]
  /** Index of the first row in the whole table (0-based), for the row numbers. */
  offset?: number
  /** Replaces a cell's content (a link on a ticker…); return undefined to keep the default. */
  renderCell?: (cell: Cell, column: string) => ReactNode | undefined
  className?: string
}

function cellText(cell: Cell): string {
  return typeof cell === 'boolean' ? (cell ? 'oui' : 'non') : formatValue(cell)
}

/** Tabular data to inspect: every column, a sticky header and row numbers, scrollable both ways. */
export function DataGrid({ label, columns, rows, offset = 0, renderCell, className }: DataGridProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        'max-h-[28rem] overflow-auto rounded-xl border border-border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        className,
      )}
    >
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th scope="col" className="sticky top-0 left-0 z-20 border-b border-border bg-muted px-3 py-2 text-right font-medium text-muted-foreground">
              <span className="sr-only">Ligne</span>
              <span aria-hidden="true">#</span>
            </th>
            {columns.map((column) => (
              <th key={column} scope="col" className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-2 text-left font-medium whitespace-nowrap">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={offset + index} className="hover:bg-muted/40">
              <td className="sticky left-0 border-b border-border bg-background px-3 py-1.5 text-right text-muted-foreground">
                {(offset + index + 1).toLocaleString('fr-CA')}
              </td>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  title={typeof cell === 'string' && cell.length > 60 ? cell : undefined}
                  className={cn(
                    'max-w-md truncate border-b border-border px-3 py-1.5 whitespace-nowrap',
                    typeof cell === 'number' && 'text-right',
                    cell === null && 'text-muted-foreground',
                  )}
                >
                  {renderCell?.(cell, columns[cellIndex]) ?? cellText(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
