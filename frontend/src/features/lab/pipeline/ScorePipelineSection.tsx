import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  SCORE_PIPELINE_QUERY_KEYS,
  useScoreRun,
  useScoreRuns,
  useStartScoreRun,
  type ScoreRunParams,
} from '@/api/pipeline'
import { STOCK_QUERY_KEYS } from '@/api/stocks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  STATUS_LABELS,
  STATUS_VARIANTS,
  TRIGGER_LABELS,
  formatCount,
  formatDateTime,
  formatSeconds,
  pipelineErrorMessage,
} from './pipelineFormat'
import { ScoreRunForm } from './ScoreRunForm'
import { ScoreRunView } from './ScoreRunView'

/**
 * « Pipeline des scores » : start the AWS run that rebuilds the gold table
 * (Bronze → Silver → Gold), follow it live, and look back at recent runs.
 */
export function ScorePipelineSection() {
  const queryClient = useQueryClient()
  const { data: list, error, isPending } = useScoreRuns()
  const start = useStartScoreRun()
  const [chosenRunId, setChosenRunId] = useState<string | null>(null)

  const runs = list?.runs ?? []
  const runningRun = runs.find((candidate) => candidate.status === 'running')
  // The run on screen: the one picked or just started, else the one running, else the latest.
  const runId = chosenRunId ?? runningRun?.run_id ?? runs[0]?.run_id ?? null
  const { data: run, error: runError } = useScoreRun(runId)

  // A finished run rewrote the score table: the dashboard and the stock pages must re-read it.
  const runStatus = run?.status
  useEffect(() => {
    if (runStatus === 'succeeded') void queryClient.invalidateQueries({ queryKey: STOCK_QUERY_KEYS.all })
  }, [runStatus, queryClient])

  const handleStart = (params: ScoreRunParams) => {
    start.mutate(params, {
      onSuccess: (started) => setChosenRunId(started.run_id),
      // 409: a run is already going — re-read the list, which puts that run on screen.
      onError: (failure) => {
        if (failure.status !== 409) return
        setChosenRunId(null)
        void queryClient.invalidateQueries({ queryKey: SCORE_PIPELINE_QUERY_KEYS.runs() })
      },
    })
  }
  const busy = start.isPending || runningRun !== undefined || run?.status === 'running'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pipeline des scores</CardTitle>
        <CardDescription>
          Reconstruit sur AWS la table des scores lue par le tableau de bord et les fiches titre :
          données brutes (Bronze), nettoyées (Silver), puis score par titre (Gold). Un run dure
          quelques minutes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {isPending ? (
          <div role="status" aria-label="Chargement du pipeline des scores" className="space-y-3">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p role="alert" className="text-sm text-destructive">
            {pipelineErrorMessage(error)}
          </p>
        ) : !list.configured ? (
          <p className="text-sm text-muted-foreground">
            Le pipeline de score n'est pas déployé sur ce serveur (développement local) : il se
            lance depuis l'application en ligne.
          </p>
        ) : (
          <>
            <div className="space-y-3">
              <ScoreRunForm
                onStart={handleStart}
                busy={busy}
                busyLabel={start.isPending ? 'Lancement…' : undefined}
              />
              {start.error && (
                <p role="alert" className="text-sm text-destructive">
                  {pipelineErrorMessage(start.error)}
                </p>
              )}
            </div>

            {runId !== null && (
              <section aria-label="Run affiché" className="space-y-4 border-t border-border pt-6">
                {run ? (
                  <ScoreRunView run={run} stageDefs={list.stages} />
                ) : runError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {pipelineErrorMessage(runError)}
                  </p>
                ) : (
                  <div role="status" aria-label="Chargement du run" className="space-y-3">
                    <Skeleton className="h-6 w-80" />
                    <Skeleton className="h-40 w-full" />
                  </div>
                )}
              </section>
            )}

            <section className="space-y-2 border-t border-border pt-6">
              <h3 className="eyebrow">Runs récents</h3>
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun run pour l'instant.</p>
              ) : (
                <ul className="divide-y divide-border border-y border-border text-sm">
                  {runs.map((item) => (
                    <li key={item.run_id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                      <Badge variant={STATUS_VARIANTS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                      <span>{formatDateTime(item.started_at)}</span>
                      <span className="text-muted-foreground">{TRIGGER_LABELS[item.trigger]}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatCount(item.summary?.titles_scored ?? null)} titres notés ·{' '}
                        {formatSeconds(item.duration_s)}
                      </span>
                      <Button
                        type="button"
                        variant={item.run_id === runId ? 'secondary' : 'outline'}
                        size="xs"
                        className="ml-auto"
                        aria-pressed={item.run_id === runId}
                        aria-label={`Voir le run ${item.run_id}`}
                        onClick={() => setChosenRunId(item.run_id)}
                      >
                        {item.run_id === runId ? 'Affiché' : 'Voir'}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
