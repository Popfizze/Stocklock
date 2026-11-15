import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useLabPipelines } from '@/api/lab'
import { useScoreRuns } from '@/api/pipeline'
import { AppLayout, PageHeader } from '@/components/layout'
import { useActivePersona } from '@/features/personas/activePersona'
import { readPortfolio } from '@/features/portfolio/portfolioStore'
import { catalogErrorMessage } from './labForm'
import { LAB_PATH } from './labRoutes'
import { LabLaunch } from './launch/LabLaunch'
import { SCORE_PIPELINE } from './launch/launchModel'
import { relaunchOf } from './launch/relaunch'
import { useRunView } from './run/useRunView'
import { LaunchStep } from './launch/LaunchParts'
import { PipelinePicker } from './launch/PipelinePicker'
import { ScoreLaunch } from './launch/ScoreLaunch'

/** « Lancer » : pick a pipeline, the group of titles it runs on and its few settings, then land on the run's live page. */
export function LaunchPage() {
  const [search, setSearch] = useSearchParams()
  const { personaId, persona } = useActivePersona()
  const catalog = useLabPipelines()
  const scoreRuns = useScoreRuns()
  const pipeline = search.get('pipeline') ?? SCORE_PIPELINE
  const presetTickers = useMemo(
    () =>
      (search.get('titres') ?? '')
        .split(',')
        .map((ticker) => ticker.trim().toUpperCase())
        .filter(Boolean),
    [search],
  )
  // Read when the page opens: the portfolio page is where it changes.
  const portfolio = useMemo(() => (personaId ? readPortfolio(personaId).map((holding) => holding.ticker) : []), [personaId])
  const step = catalog.data?.steps.find((candidate) => candidate.id === pipeline)
  // « Relancer » : the run to start again hands over its group and its settings.
  const fromId = search.get('depuis')
  const from = useRunView(fromId)
  const relaunch = useMemo(() => (from.view ? relaunchOf(from.view) : null), [from.view])
  const waiting = fromId !== null && from.isLoading

  return (
    <AppLayout>
      <div className="space-y-12">
        <Link to={LAB_PATH} className="link inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Toutes les exécutions
        </Link>
        <PageHeader
          eyebrow="Labo"
          title="Lancer"
          accent="une exécution"
          description={`Sur un groupe de titres, pas titre par titre. Profil actif : ${persona?.name ?? '…'}.`}
        />

        <LaunchStep number={1} title="Le pipeline">
          <PipelinePicker
            steps={catalog.data?.steps ?? []}
            scoreLayers={(scoreRuns.data?.stages ?? []).map((stage) => stage.layer)}
            value={pipeline}
            // Another pipeline is another run: the one being started again is let go.
            onChange={(next) => setSearch({ pipeline: next }, { replace: true })}
          />
          {catalog.isError && (
            <p role="alert" className="text-destructive">
              {catalogErrorMessage(catalog.error)}
            </p>
          )}
        </LaunchStep>

        {relaunch && (
          <p role="note" className="rounded-3xl border border-border px-5 py-4 text-sm">
            Repris de l'exécution « {relaunch.title} » : même groupe, mêmes réglages. Modifiez ce que vous voulez avant de
            lancer.
          </p>
        )}
        {fromId !== null && !from.isLoading && !from.view && (
          <p role="alert" className="text-sm text-destructive">
            L'exécution à relancer est introuvable ({fromId}) : le lanceur part des réglages par défaut.
          </p>
        )}

        {waiting ? (
          <p role="status" className="text-muted-foreground">
            Chargement des réglages de l'exécution à relancer…
          </p>
        ) : pipeline === SCORE_PIPELINE ? (
          <ScoreLaunch key={`${SCORE_PIPELINE}-${relaunch?.runId ?? ''}`} portfolio={portfolio} presetTickers={presetTickers} relaunch={relaunch} />
        ) : step && personaId ? (
          // Each pipeline starts from its own defaults, or from the run being started again.
          <LabLaunch
            key={`${step.id}-${relaunch?.runId ?? ''}`}
            step={step}
            personaId={personaId}
            portfolio={portfolio}
            presetTickers={presetTickers}
            relaunch={relaunch}
          />
        ) : catalog.isPending ? (
          <p role="status" className="text-muted-foreground">
            Chargement des pipelines…
          </p>
        ) : null}
      </div>
    </AppLayout>
  )
}
