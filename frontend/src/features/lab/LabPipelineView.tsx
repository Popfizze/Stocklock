import { useMemo, useState } from 'react'
import { useRunLab, type LabScalar, type LabStep } from '@/api/lab'
import { Button } from '@/components/ui/button'
import { useActivePersona } from '@/features/personas/activePersona'
import { FinalResult } from './FinalResult'
import { INPUT_NODE, OUTPUT_NODE, labFlow } from './flow/flowModel'
import { PipelineFlow } from './flow/PipelineFlow'
import { StagePanel } from './flow/StagePanel'
import { initialInputDraft, initialOptionValues, runErrorMessage, toRequestInputs } from './labForm'
import {
  formatRunTime,
  labCompareRun,
  readLabRuns,
  storeLabRuns,
  toStoredRun,
  type StoredLabRun,
} from './labHistory'
import { LabRunForm } from './LabRunForm'
import { RunCompare } from './RunCompare'
import { RunHistory, type HistoryItem } from './RunHistory'
import { StageResultView } from './StageResultView'

const STATUS: Record<StoredLabRun['status'], Pick<HistoryItem, 'statusLabel' | 'statusVariant'>> = {
  ok: { statusLabel: 'OK', statusVariant: 'success' },
  warning: { statusLabel: 'Avertissement', statusVariant: 'warning' },
  error: { statusLabel: 'Erreur', statusVariant: 'destructive' },
  skipped: { statusLabel: 'Ignoré', statusVariant: 'secondary' },
}

interface LabPipelineViewProps {
  step: LabStep
}

/**
 * A synchronous pipeline (one `POST /api/lab/run`): its diagram, the
 * « Lancer » panel with inputs and per-stage options, the picked stage's
 * detail, the result, and the runs kept in this browser.
 */
export function LabPipelineView({ step }: LabPipelineViewProps) {
  const { personaId, persona } = useActivePersona()
  const [inputs, setInputs] = useState(() => initialInputDraft(step.inputs))
  const [options, setOptions] = useState(() => initialOptionValues(step.stages))
  const [history, setHistory] = useState(() => readLabRuns(step.id))
  const [panelOpen, setPanelOpen] = useState(() => readLabRuns(step.id).length === 0)
  const [selected, setSelected] = useState<string | null>(null)
  const [compareIds, setCompareIds] = useState<string[]>([])
  const run = useRunLab()

  const results = useMemo(
    () => (run.data ? new Map(run.data.stages.map((stage) => [stage.id, stage])) : undefined),
    [run.data],
  )

  const handleRun = () => {
    if (personaId === null || run.isPending) return
    const sentInputs = inputs
    const sentOptions = options
    run.mutate(
      { step: step.id, persona_id: personaId, inputs: toRequestInputs(step.inputs, sentInputs), options: sentOptions },
      {
        onSuccess: (response) => {
          const next = [toStoredRun(step, sentInputs, sentOptions, response), ...history]
          setHistory(next)
          storeLabRuns(step.id, next)
          setSelected(OUTPUT_NODE)
          setPanelOpen(false)
        },
      },
    )
  }

  const nodes = labFlow(step.stages, results, run.isPending)
  const node = nodes.find((candidate) => candidate.id === selected)
  const stageDef = step.stages.find((stage) => stage.id === selected)
  const stageResult = run.isPending ? undefined : results?.get(selected ?? '')
  const compared = compareIds
    .map((id) => history.find((item) => item.runId === id))
    .filter((item): item is StoredLabRun => item !== undefined)

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          aria-controls={`panneau-lancer-${step.id}`}
        >
          Lancer
        </Button>
        {panelOpen && (
          <section
            id={`panneau-lancer-${step.id}`}
            aria-label="Paramètres du run"
            className="rounded-xl border border-border p-4 sm:p-5"
          >
            <LabRunForm
              step={step}
              inputs={inputs}
              options={options}
              onInputChange={(name, value) => setInputs((current) => ({ ...current, [name]: value }))}
              onOptionChange={(id: string, value: LabScalar) => setOptions((current) => ({ ...current, [id]: value }))}
              onSubmit={handleRun}
              running={run.isPending}
              personaName={persona?.name ?? ''}
            />
          </section>
        )}
        {run.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            Exécution en cours : chaque étape interroge ses sources, cela peut prendre une quinzaine
            de secondes.
          </p>
        )}
        {run.error && (
          <p role="alert" className="text-sm text-destructive">
            {runErrorMessage(run.error)}
          </p>
        )}
      </div>

      <PipelineFlow
        nodes={nodes}
        selectedId={selected}
        onSelect={setSelected}
        label={`Diagramme du pipeline ${step.label}`}
      />

      <StagePanel node={node} description={stageDef?.description}>
        {selected === INPUT_NODE && (
          <p className="text-sm text-muted-foreground">
            Les entrées et les options de chaque étape se règlent dans le panneau « Lancer ».
          </p>
        )}
        {selected === OUTPUT_NODE &&
          (run.data && !run.isPending ? (
            <FinalResult result={run.data.result} />
          ) : (
            <p className="text-sm text-muted-foreground">Le résultat apparaîtra ici après un run.</p>
          ))}
        {stageDef &&
          (stageResult ? (
            <StageResultView result={stageResult} runSources={run.data?.result.sources} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {run.isPending ? 'Étape en cours d’exécution…' : 'Cette étape n’a pas encore été exécutée.'}
            </p>
          ))}
      </StagePanel>

      <RunHistory
        items={history.map((item) => ({
          id: item.runId,
          ...STATUS[item.status],
          when: formatRunTime(item.at),
          summary: item.keyResult,
          detail: [
            item.changedOptions.length === 0 ? 'Options par défaut' : item.changedOptions.join(' ; '),
            `Gouvernance ${item.governancePassed ? 'passée' : 'échouée'}`,
          ].join(' · '),
        }))}
        compareIds={compareIds}
        onToggleCompare={(id) =>
          setCompareIds((current) =>
            current.includes(id) ? current.filter((other) => other !== id) : [...current, id].slice(0, 2),
          )
        }
      >
        {compared.length === 2 && (
          <RunCompare left={labCompareRun(compared[0])} right={labCompareRun(compared[1])} />
        )}
      </RunHistory>
    </div>
  )
}
