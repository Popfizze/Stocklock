import type { LabPreview, LabSource, LabStageResult } from '@/api/lab'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DatasetTable } from './DatasetTable'
import { formatDuration, formatValue } from './labForm'
import { SourceList } from './SourceList'
import { StageDecisions } from './StageDecisions'
import { StageStatusBadge } from './StatusBadges'

interface StageResultViewProps {
  result: LabStageResult
  /** The run's sources: a dataset's `source_id` resolves there when the stage does not list it. */
  runSources?: LabSource[]
}

/**
 * What one stage did in the last run: status, duration, metrics, warnings,
 * sources, then its decisions and every dataset it fetched or produced.
 */
export function StageResultView({ result, runSources = [] }: StageResultViewProps) {
  const metrics = Object.entries(result.metrics ?? {})
  const decisions = result.decisions ?? []
  const datasets = result.datasets ?? []

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <StageStatusBadge status={result.status} />
        <span className="text-sm text-muted-foreground">
          Durée : {formatDuration(result.duration_ms)}
        </span>
      </div>

      {metrics.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
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

      {result.sources.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="eyebrow">Sources</h4>
          <SourceList sources={result.sources} />
        </section>
      )}

      {decisions.length > 0 && <StageDecisions decisions={decisions} />}

      {datasets.length > 0 && (
        <section className="space-y-2">
          <h4 className="eyebrow">Jeux de données ({datasets.length})</h4>
          <div className="space-y-2">
            {datasets.map((dataset) => (
              <DatasetTable
                key={dataset.id}
                dataset={dataset}
                sources={[...result.sources, ...runSources]}
              />
            ))}
          </div>
        </section>
      )}

      {/* The short preview only stands in when the stage sent no full dataset. */}
      {datasets.length === 0 && result.preview && <PreviewDetails preview={result.preview} />}
    </div>
  )
}

function PreviewDetails({ preview }: { preview: LabPreview }) {
  return (
    <details className="rounded-xl border border-border">
      <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
        Aperçu des données ({preview.rows.length} lignes)
      </summary>
      <div className="border-t border-border">
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
