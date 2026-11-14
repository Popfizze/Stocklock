import { ChevronRight } from 'lucide-react'
import type { ScoreRunStage } from '@/api/pipeline'
import { Badge } from '@/components/ui/badge'
import {
  LAYER_LABELS,
  STATUS_LABELS,
  STATUS_VARIANTS,
  formatCount,
  formatSeconds,
} from './pipelineFormat'
import { ScoreSampleTable } from './ScoreSampleTable'

const DECISION_LABELS: Record<ScoreRunStage['decisions'][number]['kind'], string> = {
  source: 'Source',
  fallback: 'Repli',
  filter: 'Filtre',
  missing: 'Donnée manquante',
  parameter: 'Paramètre',
  info: 'Note',
}

interface ScoreStageRowProps {
  stage: ScoreRunStage
  index: number
  description?: string
}

/** One stage of a score run: status, timing and row counts; opened, its decisions, samples and outputs. */
export function ScoreStageRow({ stage, index, description }: ScoreStageRowProps) {
  const rows = Object.entries(stage.rows)
  const metrics = Object.entries(stage.metrics).filter(
    (entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number',
  )
  const hasDetail =
    stage.decisions.length + stage.samples.length + stage.warnings.length + stage.outputs.length + metrics.length > 0 ||
    stage.error !== null

  return (
    <li>
      <details className="group/stage" open={stage.status === 'failed' || undefined}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-3 text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open/stage:rotate-90"
          />
          <span className="w-14 shrink-0 text-xs text-muted-foreground">{LAYER_LABELS[stage.layer]}</span>
          <span className="font-medium">
            {index + 1}. {stage.label}
          </span>
          <Badge variant={STATUS_VARIANTS[stage.status]}>{STATUS_LABELS[stage.status]}</Badge>
          <span className="ml-auto flex flex-wrap gap-x-4 text-xs text-muted-foreground tabular-nums">
            {rows.slice(0, 3).map(([name, count]) => (
              <span key={name}>
                {name} : <span className="text-foreground">{formatCount(count)}</span>
              </span>
            ))}
            <span>{formatSeconds(stage.duration_s)}</span>
          </span>
        </summary>

        <div className="space-y-4 pb-5 pl-7 text-sm">
          {description && <p className="text-muted-foreground">{description}</p>}
          {stage.error && (
            <p role="alert" className="text-destructive">
              {stage.error}
            </p>
          )}
          {!hasDetail && <p className="text-muted-foreground">Aucun détail pour cette étape pour le moment.</p>}

          {rows.length > 3 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {rows.map(([name, count]) => (
                <div key={name} className="flex gap-1.5">
                  <dt className="text-muted-foreground">{name} :</dt>
                  <dd className="font-medium">{formatCount(count)}</dd>
                </div>
              ))}
            </dl>
          )}

          {stage.decisions.length > 0 && (
            <section className="space-y-1.5">
              <h4 className="eyebrow">Décisions ({stage.decisions.length})</h4>
              <ul className="divide-y divide-border border-y border-border">
                {stage.decisions.map((decision, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-3 py-2">
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
              {stage.warnings.map((warning, i) => (
                <li key={i}>{warning}</li>
              ))}
            </ul>
          )}

          {stage.samples.map((sample) => (
            <ScoreSampleTable key={sample.dataset} sample={sample} />
          ))}

          {metrics.length > 0 && (
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {metrics.map(([name, value]) => (
                <div key={name} className="flex gap-1.5">
                  <dt className="text-muted-foreground">{name} :</dt>
                  <dd className="font-medium">{typeof value === 'number' ? formatCount(value) : value}</dd>
                </div>
              ))}
            </dl>
          )}

          {(stage.outputs.length > 0 || stage.sources.length > 0) && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {stage.sources.length > 0 && (
                <p>
                  Sources :{' '}
                  {stage.sources.map((source, i) => (
                    <span key={source.id}>
                      {i > 0 && ' · '}
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
      </details>
    </li>
  )
}
