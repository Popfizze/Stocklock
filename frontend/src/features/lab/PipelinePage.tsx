import { Link, useParams } from 'react-router-dom'
import { useLabPipelines } from '@/api/lab'
import { useScoreRuns } from '@/api/pipeline'
import { AppLayout, PageHeader } from '@/components/layout'
import { Skeleton } from '@/components/ui/skeleton'
import { catalogErrorMessage } from './labForm'
import { LabPipelineView } from './LabPipelineView'
import { pipelineErrorMessage } from './pipeline/pipelineFormat'
import { SCORE_PIPELINE, SCORE_PIPELINE_ID } from './pipelines'
import { ScorePipelineView } from './ScorePipelineView'

/**
 * One pipeline of the Labo (`/labo/:pipelineId`): its live diagram, the
 * « Lancer » panel, a stage's detail, the result and the history. `scores`
 * is the AWS score pipeline; the other ids are the lab catalog's steps.
 */
export function PipelinePage() {
  const { pipelineId = '' } = useParams()
  const isScore = pipelineId === SCORE_PIPELINE_ID
  const catalog = useLabPipelines()
  const scoreRuns = useScoreRuns()
  const step = catalog.data?.steps.find((candidate) => candidate.id === pipelineId)

  const pending = isScore ? scoreRuns.isPending : catalog.isPending
  const error = isScore ? scoreRuns.error : catalog.error

  return (
    <AppLayout>
      <div className="space-y-8">
        <Link
          to="/labo"
          className="inline-block rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ← Labo
        </Link>

        {pending ? (
          <div role="status" aria-label="Chargement du pipeline" className="space-y-4">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-destructive">
            {isScore ? pipelineErrorMessage(error) : catalogErrorMessage(error)}
          </p>
        ) : isScore && scoreRuns.data ? (
          <>
            <PageHeader title={SCORE_PIPELINE.title} eyebrow="Pipeline AWS · Step Functions" description={SCORE_PIPELINE.description} />
            <ScorePipelineView list={scoreRuns.data} />
          </>
        ) : step ? (
          <>
            <PageHeader
              title={step.label}
              eyebrow="Pipeline synchrone · une requête"
              description="Réglez les entrées et les options, lancez, puis ouvrez chaque étape du diagramme."
            />
            <LabPipelineView key={step.id} step={step} />
          </>
        ) : (
          <p role="alert" className="text-destructive">
            Ce pipeline n'existe pas.
          </p>
        )}
      </div>
    </AppLayout>
  )
}
