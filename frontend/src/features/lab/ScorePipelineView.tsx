import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  SCORE_PIPELINE_QUERY_KEYS,
  useScoreRun,
  useStartScoreRun,
  type ScoreRun,
  type ScoreRunList,
  type ScoreRunParams,
} from '@/api/pipeline'
import { STOCK_QUERY_KEYS } from '@/api/stocks'
import { Button } from '@/components/ui/button'
import { INPUT_NODE, OUTPUT_NODE, scoreFlow } from './flow/flowModel'
import { PipelineFlow } from './flow/PipelineFlow'
import { PipelineScene } from './flow/PipelineScene'
import { StagePanel } from './flow/StagePanel'
import { pipelineErrorMessage } from './pipeline/pipelineFormat'
import { ScoreRunForm } from './pipeline/ScoreRunForm'
import { ScoreRunInputs, ScoreRunOutput } from './pipeline/ScoreRunOutput'
import { ScoreRunProgress } from './pipeline/ScoreRunProgress'
import { ScoreStageDetail } from './pipeline/ScoreStageDetail'
import { ScoreRunHistory } from './pipeline/ScoreRunHistory'

interface ScorePipelineViewProps {
  list: ScoreRunList
}

/**
 * The score pipeline (AWS Step Functions): its diagram with the shown run's
 * live status, the « Lancer » panel, the picked stage's detail, the run's
 * output, and the history of runs.
 */
export function ScorePipelineView({ list }: ScorePipelineViewProps) {
  const queryClient = useQueryClient()
  const start = useStartScoreRun()
  const [chosenRunId, setChosenRunId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const { runs } = list
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
      onSuccess: (started: ScoreRun) => {
        setChosenRunId(started.run_id)
        setPanelOpen(false)
      },
      // 409: a run is already going — re-read the list, which puts that run on screen.
      onError: (failure) => {
        if (failure.status !== 409) return
        setChosenRunId(null)
        void queryClient.invalidateQueries({ queryKey: SCORE_PIPELINE_QUERY_KEYS.runs() })
      },
    })
  }

  const busy = start.isPending || runningRun !== undefined || run?.status === 'running'
  const nodes = scoreFlow(list.stages, run)
  const node = nodes.find((candidate) => candidate.id === selected)
  const stage = run?.stages.find((candidate) => candidate.id === selected)

  return (
    <div className="space-y-8">
      {!list.configured ? (
        <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
          Le pipeline de score n'est pas déployé sur ce serveur (développement local) : il se lance
          depuis l'application en ligne. Le diagramme ci-dessous montre ses étapes.
        </p>
      ) : (
        <div className="space-y-3">
          <Button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
            aria-controls="panneau-lancer"
            disabled={busy && !panelOpen}
          >
            {busy ? 'Run en cours…' : 'Lancer'}
          </Button>
          {panelOpen && (
            <section id="panneau-lancer" aria-label="Paramètres du run" className="rounded-xl border border-border p-4">
              <ScoreRunForm onStart={handleStart} busy={busy} busyLabel={start.isPending ? 'Lancement…' : undefined} />
            </section>
          )}
          {start.error && (
            <p role="alert" className="text-sm text-destructive">
              {pipelineErrorMessage(start.error)}
            </p>
          )}
        </div>
      )}

      {runError && !run && (
        <p role="alert" className="text-sm text-destructive">
          {pipelineErrorMessage(runError)}
        </p>
      )}
      {run && <ScoreRunProgress run={run} />}

      <PipelineScene nodes={nodes} onSelect={setSelected} name={"du pipeline de score"} />

      <PipelineFlow
        nodes={nodes}
        selectedId={selected}
        onSelect={setSelected}
        label="Diagramme du pipeline de score"
      />

      <StagePanel
        node={node}
        description={list.stages.find((def) => def.id === selected)?.description}
      >
        {selected === INPUT_NODE &&
          (run ? <ScoreRunInputs run={run} /> : <p className="text-sm text-muted-foreground">Aucun run à afficher.</p>)}
        {selected === OUTPUT_NODE &&
          (run ? <ScoreRunOutput run={run} /> : <p className="text-sm text-muted-foreground">Aucun run à afficher.</p>)}
        {node && selected !== INPUT_NODE && selected !== OUTPUT_NODE &&
          (stage ? (
            <ScoreStageDetail stage={stage} />
          ) : (
            <p className="text-sm text-muted-foreground">Aucun run à afficher pour cette étape.</p>
          ))}
      </StagePanel>

      {run && (
        <section aria-labelledby="sortie-run" className="space-y-3">
          <h2 id="sortie-run" className="text-xl font-semibold tracking-tight">
            Résultat du run
          </h2>
          <ScoreRunOutput run={run} />
        </section>
      )}

      {list.configured && <ScoreRunHistory runs={runs} shownId={runId} onShow={setChosenRunId} />}
    </div>
  )
}
