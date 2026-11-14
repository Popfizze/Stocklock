import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { usePersonas } from '@/api/personas'
import { AppLayout, PageHeader } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ArtifactsSection } from './artifacts/ArtifactsSection'
import { CompareWith } from './compare/CompareWith'
import { LAB_PATH, launchPath, runPath } from './labRoutes'
import { FlowBoard } from './run/FlowBoard'
import { INPUT_NODE, OUTPUT_NODE } from './run/flowModel'
import { GroupOutcome } from './run/GroupOutcome'
import { LabOutcome } from './run/LabOutcome'
import { RunConveyor } from './run/RunConveyor'
import { RunInputs } from './run/RunInputs'
import type { RunView } from './run/runView'
import { ScoreOutcome } from './run/ScoreOutcome'
import { StageDetail } from './run/StageDetail'
import { useRunView } from './run/useRunView'
import { formatDateTime, formatDuration, STATUS_LABELS, STATUS_VARIANTS, TRIGGER_LABELS } from './runs/runModel'

/** One run: its stages on the 3D conveyor (live while it runs), each stage's detail, its result and everything it generated. */
export function RunPage() {
  const { runId = '' } = useParams()
  const { view, isLoading, error } = useRunView(runId)

  return (
    <AppLayout>
      <div className="space-y-10">
        <Link to={LAB_PATH} className="link inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Toutes les exécutions
        </Link>
        {view ? (
          // A new run starts from its own selection.
          <RunBody key={view.id} view={view} />
        ) : isLoading ? (
          <p role="status" className="text-muted-foreground">
            Chargement du run…
          </p>
        ) : (
          <p role="alert" className="text-destructive">
            {error?.status === 0
              ? 'Impossible de joindre le serveur. Vérifiez que le backend est démarré, puis rechargez la page.'
              : `Ce run est introuvable (${runId}).`}
          </p>
        )}
      </div>
    </AppLayout>
  )
}

function Outcome({ view }: { view: RunView }) {
  if (view.kind === 'score') return <ScoreOutcome view={view} />
  if (view.kind === 'batch') return <GroupOutcome view={view} />
  if (view.registry?.result) return <LabOutcome result={view.registry.result} keyResult={view.registry.key_result} />
  return <p className="text-muted-foreground">Ce run n'a pas produit de résultat.</p>
}

function RunBody({ view }: { view: RunView }) {
  const navigate = useNavigate()
  const personas = usePersonas()
  const [selected, setSelected] = useState<string>(OUTPUT_NODE)
  const [artifactStage, setArtifactStage] = useState<string | null>(null)
  const artifactsRef = useRef<HTMLElement>(null)
  const persona = personas.data?.find((candidate) => candidate.id === view.personaId)
  const stageNames = Object.fromEntries(view.nodes.filter((node) => node.order !== undefined).map((node) => [node.id, node.label]))
  const showArtifacts = (stageId: string) => {
    setArtifactStage(stageId)
    artifactsRef.current?.scrollIntoView({ block: 'start' })
  }
  const meta = [
    formatDateTime(view.startedAt),
    view.durationMs === null ? null : formatDuration(view.durationMs),
    TRIGGER_LABELS[view.trigger],
    persona ? `Profil : ${persona.name}` : null,
  ].filter(Boolean)

  return (
    <>
      <PageHeader
        eyebrow={view.pipelineLabel}
        title={view.title}
        description={
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-3 tabular-nums">
              <Badge variant={STATUS_VARIANTS[view.status]}>{STATUS_LABELS[view.status]}</Badge>
              {meta.join(' · ')}
            </p>
            {view.parentId && (
              <p>
                Titre d'un run de groupe —{' '}
                <Link to={runPath(view.parentId)} className="link">
                  ouvrir le groupe
                </Link>
              </p>
            )}
            {view.error && (
              <p role="alert" className="text-destructive">
                {view.error}
              </p>
            )}
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <CompareWith view={view} />
            <Button asChild>
              <Link to={launchPath(view.pipelineId)}>Relancer</Link>
            </Button>
          </div>
        }
      />

      <section aria-labelledby="convoyeur" className="space-y-4">
        <h2 id="convoyeur" className="text-2xl">
          Parcours <em>des données</em>
        </h2>
        <Card>
          <CardContent className="space-y-6">
            <RunConveyor
              nodes={view.nodes}
              travellers={view.travellers}
              selected={selected}
              onSelect={setSelected}
              onTraveller={(traveller) => traveller.runId && navigate(runPath(traveller.runId))}
              name={`du run ${view.title}`}
            />
            <FlowBoard nodes={view.nodes} selected={selected} onSelect={setSelected} />
          </CardContent>
        </Card>
        <Card aria-live="polite">
          <CardContent>
            {selected === INPUT_NODE ? (
              <RunInputs view={view} />
            ) : selected === OUTPUT_NODE ? (
              <Outcome view={view} />
            ) : (
              <StageDetail view={view} stageId={selected} onShowArtifacts={showArtifacts} />
            )}
          </CardContent>
        </Card>
      </section>

      <section ref={artifactsRef} aria-labelledby="elements" className="scroll-mt-6 space-y-4">
        <h2 id="elements" className="text-2xl">
          Éléments <em>générés</em>
        </h2>
        <ArtifactsSection runId={view.id} stageNames={stageNames} stage={artifactStage} onStage={setArtifactStage} />
      </section>
    </>
  )
}
