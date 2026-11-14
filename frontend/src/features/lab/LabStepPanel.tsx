import { useMemo, useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { useRunLab, type LabScalar, type LabStep } from '@/api/lab'
import { Button } from '@/components/ui/button'
import { useActivePersona } from '@/features/personas/activePersona'
import { FinalResult } from './FinalResult'
import {
  initialInputDraft,
  initialOptionValues,
  runErrorMessage,
  toRequestInputs,
  toRunRecord,
  type LabRunRecord,
} from './labForm'
import { PipelineStages } from './PipelineStages'
import { StepInputs } from './StepInputs'

interface LabStepPanelProps {
  step: LabStep
  onRun: (record: LabRunRecord) => void
}

/** One step: its inputs, its pipeline options, the run button, and the last run's results. */
export function LabStepPanel({ step, onRun }: LabStepPanelProps) {
  const { personaId, persona } = useActivePersona()
  const [inputs, setInputs] = useState(() => initialInputDraft(step.inputs))
  const [options, setOptions] = useState(() => initialOptionValues(step.stages))
  const run = useRunLab()

  const stageResults = useMemo(
    () => (run.data ? new Map(run.data.stages.map((stage) => [stage.id, stage])) : undefined),
    [run.data],
  )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (personaId === null || run.isPending) return
    const sentOptions = options
    run.mutate(
      {
        step: step.id,
        persona_id: personaId,
        inputs: toRequestInputs(step.inputs, inputs),
        options: sentOptions,
      },
      { onSuccess: (response) => onRun(toRunRecord(step, sentOptions, response)) },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <StepInputs
        inputs={step.inputs}
        values={inputs}
        onChange={(name, value) => setInputs((current) => ({ ...current, [name]: value }))}
        personaName={persona?.name ?? ''}
      />

      <PipelineStages
        stages={step.stages}
        values={options}
        onChange={(id: string, value: LabScalar) =>
          setOptions((current) => ({ ...current, [id]: value }))
        }
        results={stageResults}
      />

      <div className="space-y-3">
        <Button type="submit" disabled={run.isPending}>
          {run.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {run.isPending ? 'Exécution…' : 'Exécuter'}
        </Button>
        {run.error && (
          <p role="alert" className="text-sm text-destructive">
            {runErrorMessage(run.error)}
          </p>
        )}
      </div>

      {run.data && <FinalResult result={run.data.result} />}
    </form>
  )
}
