import type { ScoreRun } from '@/api/pipeline'
import { Badge } from '@/components/ui/badge'
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  TRIGGER_LABELS,
  formatDateTime,
  formatSeconds,
} from './pipelineFormat'

interface ScoreRunProgressProps {
  run: ScoreRun
}

/** The run on screen: its identity and, while it is going, how far it is. */
export function ScoreRunProgress({ run }: ScoreRunProgressProps) {
  const done = run.stages.filter((stage) => stage.status === 'succeeded').length
  const current = run.stages.find((stage) => stage.status === 'running')
  const plural = done > 1 ? 's' : ''

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Badge variant={STATUS_VARIANTS[run.status]}>{STATUS_LABELS[run.status]}</Badge>
        <span className="font-mono text-xs">{run.run_id}</span>
        <span className="text-muted-foreground">
          {TRIGGER_LABELS[run.trigger]} · {formatDateTime(run.started_at)} · durée{' '}
          {formatSeconds(run.duration_s)}
        </span>
      </div>

      {run.status === 'running' && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            <span className="font-medium">
              {done} étape{plural} sur {run.stages.length} terminée{plural}
            </span>
            {current && <span> · en cours : {current.label}</span>}
            <span className="text-muted-foreground">
              {' '}
              · un run complet dure 4 à 5 minutes, la page se met à jour toutes les 5 secondes.
            </span>
          </p>
          <progress
            value={done}
            max={run.stages.length}
            aria-label="Avancement du run"
            className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-muted accent-primary [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
          />
        </div>
      )}

      {run.error && (
        <p role="alert" className="text-sm text-destructive">
          Le run a échoué : {run.error.message}
        </p>
      )}
    </div>
  )
}
