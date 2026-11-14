import { useState } from 'react'
import { useRunArtifacts } from '@/api/runs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatCount } from '../runs/runModel'
import { ArtifactCard } from './ArtifactCard'
import { ArtifactGrid } from './ArtifactGrid'
import { artifactStages } from './artifactModel'

const ALL = '__all'
const RUN_LEVEL = '__run'

interface ArtifactsSectionProps {
  runId: string
  /** Stage names by id, for the cards and the filter. */
  stageNames: Record<string, string>
  /** The stage whose elements are shown (`null`: all of them). */
  stage: string | null
  onStage: (stageId: string | null) => void
}

/** « Éléments générés » : everything the run wrote, each one summarized, then opened as a paginated grid. */
export function ArtifactsSection({ runId, stageNames, stage, onStage }: ArtifactsSectionProps) {
  const artifacts = useRunArtifacts(runId)
  const [openId, setOpenId] = useState<string | null>(null)

  if (artifacts.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        Chargement des éléments générés…
      </p>
    )
  }
  if (artifacts.isError) {
    return (
      <p role="alert" className="text-destructive">
        Les éléments générés n'ont pas pu être listés (erreur {artifacts.error.status}).
      </p>
    )
  }
  const all = artifacts.data.artifacts
  if (all.length === 0) return <p className="text-muted-foreground">Ce run n'a encore rien écrit.</p>

  const stages = artifactStages(all)
  const key = (stageId: string | null) => stageId ?? RUN_LEVEL
  const shown = stage === null ? all : all.filter((artifact) => key(artifact.stage_id) === stage)
  const opened = shown.find((artifact) => artifact.id === openId)
  const name = (stageId: string | null) => (stageId === null ? 'Run' : (stageNames[stageId] ?? stageId))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {formatCount(shown.length)} élément{shown.length > 1 ? 's' : ''}
          {stage !== null && ` sur ${formatCount(all.length)}`} · cliquez un élément pour inspecter ses données.
        </p>
        {stages.length > 1 && (
          <ToggleGroup
            type="single"
            variant="chips"
            aria-label="Étape des éléments"
            value={stage ?? ALL}
            onValueChange={(next) => onStage(!next || next === ALL ? null : next)}
          >
            <ToggleGroupItem value={ALL}>Toutes les étapes</ToggleGroupItem>
            {stages.map((stageId) => (
              <ToggleGroupItem key={key(stageId)} value={key(stageId)}>
                {name(stageId)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      <ul aria-label="Éléments générés" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((artifact) => (
          <li key={artifact.id}>
            <ArtifactCard
              runId={runId}
              artifact={artifact}
              stageName={name(artifact.stage_id)}
              open={artifact.id === openId}
              onToggle={() => setOpenId(artifact.id === openId ? null : artifact.id)}
            />
          </li>
        ))}
      </ul>

      {opened && (
        <section aria-label={`Aperçu de ${opened.title}`} className="space-y-3">
          <h3 className="text-xl">{opened.title}</h3>
          <ArtifactGrid key={opened.id} runId={runId} artifact={opened} />
        </section>
      )}
    </div>
  )
}
