import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { useScoreRuns, useStartScoreRun, type ScoreRunParams } from '@/api/pipeline'
import { Button } from '@/components/ui/button'
import { runPath } from '../labRoutes'
import { scoreFlow } from '../run/flowModel'
import { GroupPicker } from './GroupPicker'
import {
  GROUP_KIND_LABELS,
  groupProblem,
  groupSize,
  SCORE_DEFAULTS,
  SCORE_PARAM_SPECS,
  scoreErrorMessage,
  scoreLimits,
  scoreRequest,
  type GroupDraft,
} from './launchModel'
import { LaunchStage, LaunchStep } from './LaunchParts'
import { ParamSlider } from './ParamSlider'
import { previewTravellers } from './preview'
import type { Relaunch } from './relaunch'

interface ScoreLaunchProps {
  portfolio: string[]
  /** Titles to start the custom set with (« relancer ce titre »). */
  presetTickers: string[]
  /** A past run to start again: its group and settings. */
  relaunch?: Relaunch | null
}

/** Launching the AWS score pipeline on a group: the group, its few settings, then the run's live page. */
export function ScoreLaunch({ portfolio, presetTickers, relaunch = null }: ScoreLaunchProps) {
  const navigate = useNavigate()
  const runs = useScoreRuns()
  const start = useStartScoreRun()
  const limits = scoreLimits(runs.data?.group_options?.max_tickers ?? 100)
  const [draft, setDraft] = useState<GroupDraft>(
    presetTickers.length > 0
      ? { kind: 'custom', ref: null, size: limits.defaults.auto, tickers: presetTickers }
      : (relaunch?.draft ?? { kind: 'auto', ref: null, size: limits.defaults.auto, tickers: [] }),
  )
  const [params, setParams] = useState<ScoreRunParams>(relaunch?.scoreParams ?? SCORE_DEFAULTS)

  const nodes = useMemo(() => scoreFlow(runs.data?.stages ?? [], undefined), [runs.data?.stages])
  const travellers = useMemo(() => previewTravellers(draft, portfolio, limits.cap, false), [draft, portfolio, limits.cap])
  const problem = groupProblem(draft, portfolio, limits.cap)
  const size = groupSize(draft, portfolio, limits.cap)
  const running = runs.data?.runs.find((run) => run.status === 'running')
  const notDeployed = runs.data?.configured === false

  const launch = () =>
    start.mutate(scoreRequest(draft, params, portfolio, limits.cap), {
      onSuccess: (run) => navigate(runPath(run.run_id)),
      // 409: the list now shows the run that is going.
      onError: () => void runs.refetch(),
    })

  return (
    <>
      <LaunchStep number={2} title="Le groupe de titres" hint="L’exécution note ces titres et les fusionne dans la table des scores.">
        <GroupPicker
          kinds={['auto', 'section', 'sector', 'portfolio', 'custom']}
          draft={draft}
          limits={limits}
          sections={runs.data?.group_options?.sections ?? []}
          sectors={runs.data?.group_options?.sectors ?? []}
          portfolio={portfolio}
          onChange={setDraft}
        />
      </LaunchStep>

      <LaunchStep number={3} title="Les réglages" hint="Préremplis ; une valeur modifiée est marquée.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SCORE_PARAM_SPECS.filter((spec) => spec.kinds.includes(draft.kind)).map((spec) => (
            <ParamSlider
              key={spec.key}
              label={spec.label}
              help={spec.help}
              min={spec.min}
              max={spec.max}
              step={spec.step}
              format={spec.format}
              value={params[spec.key]}
              defaultValue={SCORE_DEFAULTS[spec.key]}
              onChange={(value) => setParams((current) => ({ ...current, [spec.key]: value }))}
            />
          ))}
        </div>
      </LaunchStep>

      <LaunchStep number={4} title="Lancer">
        <LaunchStage
          name="du pipeline de score"
          nodes={nodes}
          travellers={travellers}
          summary={`Pipeline de score sur ${size} titre${size > 1 ? 's' : ''} — ${GROUP_KIND_LABELS[draft.kind].toLowerCase()}.`}
          running={false}
          waiting={`${size} titre${size > 1 ? 's' : ''} en attente`}
        >
          <Button type="button" size="lg" loading={start.isPending} disabled={problem !== null || notDeployed || Boolean(running)} onClick={launch}>
            <Play aria-hidden="true" data-icon="inline-start" />
            Lancer l’exécution
          </Button>
          {problem && <p className="text-sm text-muted-foreground">{problem}</p>}
          {notDeployed && (
            <p role="note" className="text-sm text-muted-foreground">
              Le pipeline de score n'est pas déployé sur ce serveur : il se lance depuis l'application en ligne.
            </p>
          )}
          {running && (
            <p className="text-sm">
              Une exécution est déjà en cours —{' '}
              <Link to={runPath(running.run_id)} className="link">
                l'ouvrir
              </Link>
              .
            </p>
          )}
          {start.isError && !running && (
            <p role="alert" className="text-sm text-destructive">
              {scoreErrorMessage(start.error)}
            </p>
          )}
        </LaunchStage>
      </LaunchStep>
    </>
  )
}
