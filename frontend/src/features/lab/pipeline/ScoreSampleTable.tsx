import type { ScoreDatasetSample, ScoreSampleCell } from '@/api/pipeline'
import { cn } from '@/lib/utils'
import { formatCount } from './pipelineFormat'

function formatCell(cell: ScoreSampleCell): string {
  if (cell === null) return '—'
  if (typeof cell === 'boolean') return cell ? 'oui' : 'non'
  if (typeof cell === 'number') return cell.toLocaleString('fr-CA', { maximumFractionDigits: 4 })
  return cell
}

/** The first rows of a dataset a stage wrote, with how many the whole dataset has. */
export function ScoreSampleTable({ sample }: { sample: ScoreDatasetSample }) {
  return (
    <section className="space-y-1.5">
      <h4 className="eyebrow">
        Échantillon de {sample.dataset} · {formatCount(sample.rows.length)} sur {formatCount(sample.total_rows)} lignes
      </h4>
      <div className="max-h-72 overflow-auto rounded-xl border border-border">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              {sample.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className="sticky top-0 border-b border-border bg-muted px-3 py-2 text-left font-medium whitespace-nowrap"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={cn(
                      'max-w-xs truncate border-b border-border px-3 py-1.5 whitespace-nowrap',
                      typeof cell === 'number' && 'text-right',
                      cell === null && 'text-muted-foreground',
                    )}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
