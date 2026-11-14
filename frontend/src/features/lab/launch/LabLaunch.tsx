import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { useLabGroups, useRunLab, useRunLabBatch, type LabInputValue, type LabStep } from '@/api/lab'
import { Button } from '@/components/ui/button'
import { initialOptionValues, runErrorMessage, type OptionValues } from '../labForm'
import { runPath } from '../labRoutes'
import { catalogFlow } from '../run/flowModel'
import { GroupPicker } from './GroupPicker'
import { LabInputs, LabOptions } from './LabParams'
import { defaultInputs, draftTickers, fittingSize, groupProblem, groupSize, labGroup, labLimits, type GroupDraft } from './launchModel'
import { LaunchStage, LaunchStep } from './LaunchParts'
import { previewTravellers } from './preview'

interface LabLaunchProps {
  step: LabStep
  personaId: string
  portfolio: string[]
  presetTickers: string[]
}

/** Launching a Labo step: on a group of titles when the step runs per title, else on its one scenario. */
export function LabLaunch({ step, personaId, portfolio, presetTickers }: LabLaunchProps) {
  const navigate = useNavigate()
  const groups = useLabGroups()
  const single = useRunLab()
  const batch = useRunLabBatch()
  const limits = labLimits(groups.data?.max_titles ?? 25)
  const grouped = step.group_runnable
  const [draft, setDraft] = useState<GroupDraft>(
    presetTickers.length > 0
      ? { kind: 'custom', ref: null, size: limits.defaults.section, tickers: presetTickers }
      : { kind: 'portfolio', ref: null, size: limits.defaults.section, tickers: [] },
  )
  // The per-title input is set by the group, not by a field.
  const fields = useMemo(() => step.inputs.filter((input) => input.name !== step.group_input), [step])
  const [inputs, setInputs] = useState<Record<string, LabInputValue>>(() => defaultInputs(fields))
  const [options, setOptions] = useState<OptionValues>(() => initialOptionValues(step.stages))

  const pending = single.isPending || batch.isPending
  const error = single.error ?? batch.error
  const fit = fittingSize(batch.error)
  const nodes = useMemo(() => catalogFlow(step.stages, pending ? 'running' : 'idle'), [step.stages, pending])
  const travellers = useMemo(
    () => (grouped ? previewTravellers(draft, portfolio, limits.cap, pending) : []),
    [grouped, draft, portfolio, limits.cap, pending],
  )
  const problem = grouped ? groupProblem(draft, portfolio, limits.cap) : null
  const size = grouped ? groupSize(draft, portfolio, limits.cap) : 1

  const launch = () => {
    single.reset()
    batch.reset()
    const tickers = grouped ? draftTickers(draft, portfolio, limits.cap) : null
    if (grouped && step.group_input && tickers?.length !== 1) {
      batch.mutate(
        { step: step.id, persona_id: personaId, group: labGroup(draft, portfolio, limits.cap), inputs, options },
        { onSuccess: (run) => navigate(runPath(run.batch_id)) },
      )
    } else {
      // One title (or a step without titles): a single run.
      const body = step.group_input && tickers ? { ...inputs, [step.group_input]: tickers[0] } : inputs
      single.mutate({ step: step.id, persona_id: personaId, inputs: body, options }, { onSuccess: (run) => navigate(runPath(run.run_id)) })
    }
  }
  // The server said which size fits its time budget: cut the group to it.
  const shrink = (to: number) => {
    batch.reset()
    setDraft((current) => {
      const tickers = draftTickers(current, portfolio, limits.cap)
      return tickers ? { ...current, kind: 'custom', tickers: tickers.slice(0, to) } : { ...current, size: to }
    })
  }

  return (
    <>
      {grouped ? (
        <LaunchStep number={2} title="Le groupe de titres" hint="Le pipeline s'exécute sur chaque titre ; un seul titre donne un run simple.">
          <GroupPicker
            kinds={['portfolio', 'section', 'sector', 'custom']}
            draft={draft}
            limits={limits}
            sections={groups.data?.sections ?? []}
            sectors={groups.data?.sectors ?? []}
            portfolio={portfolio}
            onChange={setDraft}
          />
        </LaunchStep>
      ) : (
        <LaunchStep number={2} title="Le scénario" hint="Ce pipeline ne porte pas sur un titre : il s'exécute sur un scénario à la fois.">
          <LabInputs inputs={fields} values={inputs} onChange={(name, value) => setInputs((current) => ({ ...current, [name]: value }))} />
        </LaunchStep>
      )}

      <LaunchStep number={3} title="Les réglages" hint="Préremplis ; une valeur modifiée est marquée.">
        {grouped && fields.length > 0 && (
          <LabInputs inputs={fields} values={inputs} onChange={(name, value) => setInputs((current) => ({ ...current, [name]: value }))} />
        )}
        <LabOptions stages={step.stages} values={options} onChange={(id, value) => setOptions((current) => ({ ...current, [id]: value }))} />
      </LaunchStep>

      <LaunchStep number={4} title="Lancer">
        <LaunchStage
          name={`du pipeline ${step.label}`}
          nodes={nodes}
          travellers={travellers}
          summary={grouped ? `${step.label} sur ${size} titre${size > 1 ? 's' : ''}.` : `${step.label} sur ce scénario.`}
          running={pending}
        >
          <Button type="button" size="lg" loading={pending} loadingText="Exécution…" disabled={problem !== null} onClick={launch}>
            <Play aria-hidden="true" data-icon="inline-start" />
            Lancer le run
          </Button>
          {problem && <p className="text-sm text-muted-foreground">{problem}</p>}
          {pending && grouped && size > 1 && (
            <p role="status" className="text-sm text-muted-foreground">
              Un groupe prend de quelques secondes à quelques minutes : gardez cette page ouverte.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {runErrorMessage(error)}
            </p>
          )}
          {fit !== null && (
            <Button type="button" variant="outline" onClick={() => shrink(fit)}>
              Réduire le groupe à {fit} titres
            </Button>
          )}
        </LaunchStage>
      </LaunchStep>
    </>
  )
}
