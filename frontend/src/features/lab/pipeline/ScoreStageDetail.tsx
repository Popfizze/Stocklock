import type { ScoreRunStage } from '@/api/pipeline'
import { formatCount } from './pipelineFormat'
import { ScoreSampleTable } from './ScoreSampleTable'

const DECISION_LABELS: Record<ScoreRunStage['decisions'][number]['kind'], string> = {
  source: 'Source',
  fallback: 'Repli',
  filter: 'Filtre',
  missing: 'Donnée manquante',
  parameter: 'Paramètre',
  info: 'Note',
}

interface ScoreStageDetailProps {
  stage: ScoreRunStage
}

/** What a stage of a score run did: row counts, decisions, samples, metrics, outputs, errors. */
export function ScoreStageDetail({ stage }: ScoreStageDetailProps) {
  const rows = Object.entries(stage.rows)
  const metrics = Object.entries(stage.metrics).filter(
    (entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number',
  )
  const empty =
    rows.length + stage.decisions.length + stage.samples.length + stage.warnings.length + stage.outputs.length + metrics.length === 0 &&
    stage.error === null

  return (
    <div className="space-y-4 text-sm">
      {stage.error && (
        <p role="alert" className="text-destructive">
          {stage.error}
        </p>
      )}
      {empty && (
        <p className="text-muted-foreground">
          {stage.status === 'pending' || stage.status === 'running'
            ? 'Cette étape n’a encore rien produit.'
            : 'Aucun détail publié pour cette étape.'}
        </p>
      )}

      {rows.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="eyebrow">Lignes</h4>
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {rows.map(([name, count]) => (
              <div key={name}>
                <dt className="text-xs text-muted-foreground">{name}</dt>
                <dd className="font-medium">{formatCount(count)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {stage.decisions.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="eyebrow">Décisions ({stage.decisions.length})</h4>
          <ul className="divide-y divide-border border-y border-border">
            {stage.decisions.map((decision, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3 py-2">
                <span className="w-32 shrink-0 text-xs text-muted-foreground">
                  {DECISION_LABELS[decision.kind]}
                </span>
                <span className="min-w-0 flex-1">{decision.message}</span>
                {decision.count !== null && (
                  <span className="font-medium tabular-nums">{formatCount(decision.count)}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {stage.warnings.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-warning">
          {stage.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}

      {stage.samples.map((sample) => (
        <ScoreSampleTable key={sample.dataset} sample={sample} />
      ))}

      {metrics.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="eyebrow">Mesures</h4>
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            {metrics.map(([name, value]) => (
              <div key={name}>
                <dt className="text-xs text-muted-foreground">{name}</dt>
                <dd className="font-medium break-all">
                  {typeof value === 'number' ? formatCount(value) : value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {(stage.outputs.length > 0 || stage.sources.length > 0) && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {stage.sources.length > 0 && (
            <p>
              Sources :{' '}
              {stage.sources.map((source, index) => (
                <span key={source.id}>
                  {index > 0 && ' · '}
                  <a href={source.url} target="_blank" rel="noopener noreferrer" className="link text-foreground">
                    {source.title}
                  </a>
                </span>
              ))}
            </p>
          )}
          {stage.outputs.map((output) => (
            <p key={output} className="font-mono break-all">
              {output}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
