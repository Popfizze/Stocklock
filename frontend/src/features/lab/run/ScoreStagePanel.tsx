import type { ScoreDecision, ScoreRunStage, ScoreStageStatus } from '@/api/pipeline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataGrid } from '../artifacts/DataGrid'
import { formatCount, formatDuration } from '../runs/runModel'
import { Figures, PanelBlock } from './panelParts'

const STATUS: Record<ScoreStageStatus, { label: string; variant: 'secondary' | 'success' | 'destructive' }> = {
  pending: { label: 'En attente', variant: 'secondary' },
  running: { label: 'En cours', variant: 'secondary' },
  succeeded: { label: 'Terminé', variant: 'success' },
  failed: { label: 'Échec', variant: 'destructive' },
}

const DECISION_LABELS: Record<ScoreDecision['kind'], string> = {
  source: 'Source',
  fallback: 'Repli',
  filter: 'Filtre',
  missing: 'Manquant',
  parameter: 'Paramètre',
  info: 'Info',
}

interface ScoreStagePanelProps {
  stage: ScoreRunStage
  onShowArtifacts: () => void
}

/** A stage of the score pipeline: rows by dataset, decisions, the first rows it wrote and its files. */
export function ScoreStagePanel({ stage, onShowArtifacts }: ScoreStagePanelProps) {
  const status = STATUS[stage.status]
  const figures: Array<[string, string]> = [
    ...Object.entries(stage.rows).map(([name, count]): [string, string] => [name, formatCount(count)]),
    ...Object.entries(stage.metrics)
      .filter((entry): entry is [string, string | number] => typeof entry[1] === 'number' || typeof entry[1] === 'string')
      .map(([name, value]): [string, string] => [name, typeof value === 'number' ? formatCount(value) : value]),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl">{stage.label}</h3>
        <Badge variant={status.variant}>{status.label}</Badge>
        {stage.duration_s !== null && (
          <span className="text-sm text-muted-foreground tabular-nums">{formatDuration(stage.duration_s * 1000)}</span>
        )}
      </div>
      {stage.error && (
        <p role="alert" className="text-sm text-destructive">
          {stage.error}
        </p>
      )}
      {stage.warnings.length > 0 && (
        <ul aria-label="Avertissements" className="space-y-1 text-sm text-warning">
          {stage.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
      {figures.length > 0 && (
        <PanelBlock title="Lignes et mesures">
          <Figures entries={figures} />
        </PanelBlock>
      )}
      {stage.decisions.length > 0 && (
        <PanelBlock title={`Décisions (${stage.decisions.length})`}>
          <ol className="divide-y divide-border border-y border-border text-sm">
            {stage.decisions.map((decision, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <Badge variant={decision.kind === 'fallback' || decision.kind === 'missing' ? 'warning' : 'secondary'}>
                  {DECISION_LABELS[decision.kind]}
                </Badge>
                <span className="min-w-0 flex-1 basis-64">{decision.message}</span>
                {decision.count !== null && <span className="text-muted-foreground tabular-nums">{formatCount(decision.count)}</span>}
              </li>
            ))}
          </ol>
        </PanelBlock>
      )}
      {stage.samples.map((sample) => (
        <PanelBlock key={sample.dataset} title={`${sample.dataset} · ${sample.rows.length} premières lignes sur ${formatCount(sample.total_rows)}`}>
          <DataGrid label={`Extrait : ${sample.dataset}`} columns={sample.columns} rows={sample.rows} />
        </PanelBlock>
      ))}
      {stage.outputs.length > 0 && (
        <PanelBlock title={`Fichiers écrits (${stage.outputs.length})`}>
          <ul className="space-y-1 font-mono text-xs break-all text-muted-foreground">
            {stage.outputs.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={onShowArtifacts}>
            Inspecter ces fichiers
          </Button>
        </PanelBlock>
      )}
      {stage.sources.length > 0 && (
        <PanelBlock title="Sources">
          <ul className="space-y-1 text-sm">
            {stage.sources.map((source) => (
              <li key={source.id}>
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="link">
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </PanelBlock>
      )}
    </div>
  )
}
