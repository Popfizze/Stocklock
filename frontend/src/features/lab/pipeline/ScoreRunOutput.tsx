import { Link } from 'react-router-dom'
import type { ScoreRun } from '@/api/pipeline'
import { formatScore } from '@/features/stocks/format'
import { cn } from '@/lib/utils'
import { formatCount, formatShare } from './pipelineFormat'

interface FigureProps {
  label: string
  value: string
  large?: boolean
}

function Figure({ label, value, large }: FigureProps) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium', large && 'text-2xl font-semibold tracking-tight')}>{value}</dd>
    </div>
  )
}

/** « Entrées » of a score run: the parameters it was started with. */
export function ScoreRunInputs({ run }: { run: ScoreRun }) {
  const { params } = run
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
      <Figure label="Titres demandés" value={formatCount(params.max_titles)} />
      <Figure label="Actions canadiennes" value={formatShare(params.ca_share)} />
      <Figure label="FNB" value={formatShare(params.etf_share)} />
      <Figure label="Articles par titre" value={formatCount(params.news_per_title)} />
      <Figure label="Articles envoyés à Haiku (max.)" value={formatCount(params.max_llm_articles)} />
      <Figure label="Données du" value={run.date ?? '—'} />
    </dl>
  )
}

/** « Sortie » of a score run: titles scored, partial ones, Bedrock usage, the best titles. */
export function ScoreRunOutput({ run }: { run: ScoreRun }) {
  const { summary } = run
  if (summary === null) {
    return (
      <p className="text-sm text-muted-foreground">
        {run.status === 'running'
          ? 'La table des scores sera écrite à la fin de l’étape Gold.'
          : 'Ce run n’a pas produit de table des scores.'}
      </p>
    )
  }
  return (
    <div className="space-y-3">
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
    </div>
  )
}
