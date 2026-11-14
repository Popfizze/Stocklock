import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useLabPipelines } from '@/api/lab'
import { useScoreRuns } from '@/api/pipeline'
import { AppLayout, PageHeader } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { catalogErrorMessage } from './labForm'
import { formatRunTime, readLabRuns } from './labHistory'
import { STATUS_LABELS, STATUS_VARIANTS, formatDateTime } from './pipeline/pipelineFormat'
import { SCORE_PIPELINE, SCORE_PIPELINE_ID } from './pipelines'

type Variant = 'secondary' | 'warning' | 'success' | 'destructive'

interface LastRun {
  label: string
  variant: Variant
  when: string
}

const LAB_STATUS: Record<string, { label: string; variant: Variant }> = {
  ok: { label: 'OK', variant: 'success' },
  warning: { label: 'Avertissement', variant: 'warning' },
  error: { label: 'Erreur', variant: 'destructive' },
  skipped: { label: 'Ignoré', variant: 'secondary' },
}

interface PipelineRowProps {
  to: string
  title: string
  kind: string
  description: string
  /** `undefined` while it loads, `null` when the pipeline never ran. */
  lastRun: LastRun | null | undefined
}

function PipelineRow({ to, title, kind, description, lastRun }: PipelineRowProps) {
  return (
    <li>
      <Link
        to={to}
        className="group flex flex-wrap items-center gap-x-6 gap-y-2 px-2 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1 basis-72">
          <span className="block text-lg font-semibold tracking-tight">{title}</span>
          <span className="block text-xs text-muted-foreground">{kind}</span>
          <span className="mt-1 block max-w-2xl text-sm text-muted-foreground">{description}</span>
        </span>
        <span className="flex w-56 shrink-0 flex-col items-start gap-1 text-sm">
          <span className="text-xs text-muted-foreground">Dernier run</span>
          {lastRun === undefined ? (
            <Skeleton className="h-5 w-32" />
          ) : lastRun === null ? (
            <span className="text-muted-foreground">Jamais exécuté</span>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant={lastRun.variant}>{lastRun.label}</Badge>
              <span className="tabular-nums">{lastRun.when}</span>
            </span>
          )}
        </span>
        <ArrowRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      </Link>
    </li>
  )
}

/**
 * The Labo: the console of the pipelines. Each entry opens the pipeline's
 * live diagram; it shows the status and time of its last run (the score
 * pipeline's from AWS, the others' from this browser's history).
 */
export function LabPage() {
  const { data: catalog, error, isPending } = useLabPipelines()
  const scoreRuns = useScoreRuns()

  const lastScoreRun = scoreRuns.data?.runs[0]
  const scoreLast: LastRun | null | undefined = scoreRuns.isPending
    ? undefined
    : lastScoreRun
      ? {
          label: STATUS_LABELS[lastScoreRun.status],
          variant: STATUS_VARIANTS[lastScoreRun.status],
          when: formatDateTime(lastScoreRun.started_at),
        }
      : null

  return (
    <AppLayout>
      <div className="space-y-8">
        <PageHeader
          title="Labo"
          description="La console des pipelines : ouvrez-en un pour voir son diagramme en direct, le lancer, lire les décisions et les données de chaque étape, et comparer deux runs."
        />

        <ul aria-label="Pipelines" className="divide-y divide-border border-y border-border">
          <PipelineRow
            to={`/labo/${SCORE_PIPELINE_ID}`}
            title={SCORE_PIPELINE.title}
            kind="AWS · Step Functions · Bronze → Silver → Gold"
            description={SCORE_PIPELINE.description}
            lastRun={scoreLast}
          />
          {(catalog?.steps ?? []).map((step) => {
            const last = readLabRuns(step.id)[0]
            const status = last ? (LAB_STATUS[last.status] ?? LAB_STATUS.ok) : null
            return (
              <PipelineRow
                key={step.id}
                to={`/labo/${encodeURIComponent(step.id)}`}
                title={step.label}
                kind={`Synchrone · ${step.stages.length} étapes`}
                description={step.stages.map((stage) => stage.name).join(' → ')}
                lastRun={last && status ? { ...status, when: formatRunTime(last.at) } : null}
              />
            )
          })}
        </ul>

        {isPending && (
          <p role="status" className="text-muted-foreground">
            Chargement des pipelines…
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {catalogErrorMessage(error)}
          </p>
        )}
      </div>
    </AppLayout>
  )
}
