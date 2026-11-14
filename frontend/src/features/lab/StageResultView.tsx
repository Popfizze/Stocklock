import type { LabPreview, LabStageResult } from '@/api/lab'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatDuration, formatValue } from './labForm'
import { SourceList } from './SourceList'
import { StageStatusBadge } from './StatusBadges'

interface StageResultViewProps {
  result: LabStageResult
}

/** What one stage did in the last run: status, duration, metrics, warnings, sources, data. */
export function StageResultView({ result }: StageResultViewProps) {
  const metrics = Object.entries(result.metrics ?? {})

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <StageStatusBadge status={result.status} />
        <span className="text-sm text-muted-foreground">
          Durée : {formatDuration(result.duration_ms)}
        </span>
      </div>

      {metrics.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {metrics.map(([name, value]) => (
            <div key={name}>
              <dt className="text-xs text-muted-foreground">{name}</dt>
              <dd className="font-medium">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {result.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-warning">
          {result.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}

      {result.sources.length > 0 && <SourceList sources={result.sources} />}

      {result.preview && <PreviewDetails preview={result.preview} />}
    </div>
  )
}

function PreviewDetails({ preview }: { preview: LabPreview }) {
  return (
    <details className="rounded-xl border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Aperçu des données ({preview.rows.length} lignes)
      </summary>
      <div className="border-t">
        <Table>
          <TableHeader>
            <TableRow>
              {preview.columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <TableCell key={cellIndex}>{formatValue(cell)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  )
}
