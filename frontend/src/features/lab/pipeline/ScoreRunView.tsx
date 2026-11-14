import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { ScoreRun, ScoreStageDef, ScoreStageStatus } from '@/api/pipeline'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatScore } from '@/features/stocks/format'
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  TRIGGER_LABELS,
  formatCount,
  formatDateTime,
  formatSeconds,
  formatShare,
  layerStatus,
  outputStatus,
} from './pipelineFormat'
import { ScoreStageRow } from './ScoreStageRow'

const DOT: Record<ScoreStageStatus, string> = {
  pending: 'bg-border',
  running: 'bg-warning animate-pulse',
  succeeded: 'bg-success',
  failed: 'bg-destructive',
}

interface ScoreRunViewProps {
  run: ScoreRun
  stageDefs: ScoreStageDef[]
}

/**
 * A score run from end to end: Entrées → Bronze → Silver → Gold → Sortie,
 * each stage with its live status, timing, row counts, decisions and
 * samples, then what the run produced.
 */
export function ScoreRunView({ run, stageDefs }: ScoreRunViewProps) {
  const flow: Array<{ label: string; status: ScoreStageStatus }> = [
    { label: 'Entrées', status: 'succeeded' },
    { label: 'Bronze', status: layerStatus(run.stages, 'bronze') },
    { label: 'Silver', status: layerStatus(run.stages, 'silver') },
    { label: 'Gold', status: layerStatus(run.stages, 'gold') },
    { label: 'Sortie', status: outputStatus(run.status) },
  ]
  const { params, summary } = run
  const done = run.stages.filter((stage) => stage.status === 'succeeded').length
  const current = run.stages.find((stage) => stage.status === 'running')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Badge variant={STATUS_VARIANTS[run.status]}>{STATUS_LABELS[run.status]}</Badge>
        <span className="font-mono text-xs">{run.run_id}</span>
        <span className="text-muted-foreground">
          {TRIGGER_LABELS[run.trigger]} · {formatDateTime(run.started_at)} · durée{' '}
          {formatSeconds(run.duration_s)}
        </span>
      </div>

      <ol aria-label="Étapes du run" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {flow.map((node, index) => (
          <Fragment key={node.label}>
            {index > 0 && (
              <li aria-hidden="true" className="text-muted-foreground">
                <ArrowRight className="size-4" />
              </li>
            )}
            <li className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5">
              <span aria-hidden="true" className={cn('size-2 rounded-full', DOT[node.status])} />
              <span className="font-medium">{node.label}</span>
              <span className="text-xs text-muted-foreground">{STATUS_LABELS[node.status]}</span>
            </li>
          </Fragment>
        ))}
      </ol>

      {run.status === 'running' && (
        <div role="status" className="space-y-2 text-sm">
          <p>
            <span className="font-medium">
              {done} étape{done > 1 ? 's' : ''} sur {run.stages.length} terminée{done > 1 ? 's' : ''}
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

      <section className="space-y-1.5">
        <h4 className="eyebrow">Entrées</h4>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <Figure label="Titres demandés" value={formatCount(params.max_titles)} />
          <Figure label="Actions canadiennes" value={formatShare(params.ca_share)} />
          <Figure label="FNB" value={formatShare(params.etf_share)} />
          <Figure label="Articles par titre" value={formatCount(params.news_per_title)} />
          <Figure label="Articles envoyés à Haiku (max.)" value={formatCount(params.max_llm_articles)} />
          <Figure label="Données du" value={run.date ?? '—'} />
        </dl>
      </section>

      <section className="space-y-1.5">
        <h4 className="eyebrow">Bronze → Silver → Gold</h4>
        <ol className="divide-y divide-border border-y border-border">
          {run.stages.map((stage, index) => (
            <ScoreStageRow
              key={stage.id}
              stage={stage}
              index={index}
              description={stageDefs.find((def) => def.id === stage.id)?.description}
            />
          ))}
        </ol>
      </section>

      <section className="space-y-2">
        <h4 className="eyebrow">Sortie</h4>
        {summary === null ? (
          <p className="text-sm text-muted-foreground">
            {run.status === 'running'
              ? 'La table des scores sera écrite à la fin de l’étape Gold.'
              : 'Ce run n’a pas produit de table des scores.'}
          </p>
        ) : (
          <>
            <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
              <Figure label="Titres notés" value={formatCount(summary.titles_scored)} large />
              <Figure label="Dont scores partiels" value={formatCount(summary.partial)} large />
              <Figure label="Titres sélectionnés" value={formatCount(summary.titles_selected)} />
              <Figure label="Appels Bedrock" value={formatCount(summary.bedrock_calls)} />
              <Figure
                label="Jetons (entrée / sortie)"
                value={`${formatCount(summary.bedrock_input_tokens)} / ${formatCount(summary.bedrock_output_tokens)}`}
              />
            </dl>
            {summary.top && summary.top.length > 0 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Meilleurs scores : </span>
                {summary.top.map((row, index) => (
                  <span key={row.symbol}>
                    {index > 0 && ' · '}
                    <Link to={`/titres/${encodeURIComponent(row.symbol)}`} className="link font-medium">
                      {row.symbol}
                    </Link>{' '}
                    <span className="tabular-nums">
                      {formatScore(row.score)}
                      {row.partiel && <span title="Score partiel">*</span>}
                    </span>
                  </span>
                ))}
              </p>
            )}
            {summary.table_key && (
              <p className="font-mono text-xs break-all text-muted-foreground">{summary.table_key}</p>
            )}
            {run.status === 'succeeded' && (
              <p className="text-sm">
                <Link to="/#section-meilleurs-scores" className="link font-medium">
                  Voir « Meilleurs scores » sur le tableau de bord
                </Link>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function Figure({ label, value, large }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium', large && 'text-2xl font-semibold tracking-tight')}>{value}</dd>
    </div>
  )
}
