import type { LabStageResult } from '@/api/lab'
import { useRunStage } from '@/api/runs'
import { Button } from '@/components/ui/button'
import { formatValue } from '../labForm'
import { formatCount, formatDuration } from '../runs/runModel'
import { SourceList } from '../SourceList'
import { StageDecisions } from '../StageDecisions'
import { StageStatusBadge } from '../StatusBadges'
import { Figures, PanelBlock } from './panelParts'
import type { RunView } from './runView'
import { ScoreStagePanel } from './ScoreStagePanel'

interface StageDetailProps {
  view: RunView
  stageId: string
  /** Shows the stage's elements in « Éléments générés ». */
  onShowArtifacts: (stageId: string) => void
}

/** What one stage did: its decisions, its measures, its warnings and what it wrote. */
export function StageDetail({ view, stageId, onShowArtifacts }: StageDetailProps) {
  const live = view.score?.stages.find((stage) => stage.id === stageId)
  const isGroup = view.kind === 'batch'
  // The score pipeline's own record already holds its stages; a group's stages live in its titles' runs.
  const stored = useRunStage(live || isGroup ? null : view.id, stageId)
  const showArtifacts = () => onShowArtifacts(stageId)

  if (live) return <ScoreStagePanel stage={live} onShowArtifacts={showArtifacts} />
  if (isGroup) {
    const node = view.nodes.find((candidate) => candidate.id === stageId)
    return (
      <div className="space-y-2">
        <h3 className="text-xl">{node?.label}</h3>
        <p className="text-muted-foreground">
          Dans une exécution de groupe, chaque titre passe par cette étape dans son propre run : ouvrez un titre (une petite
          tuile du convoyeur, ou une ligne du résultat) pour voir ses décisions et ses données.
        </p>
      </div>
    )
  }
  if (stored.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        Chargement de l'étape…
      </p>
    )
  }
  if (stored.isError) {
    return (
      <p role="alert" className="text-destructive">
        Le détail de cette étape n'a pas pu être chargé (erreur {stored.error.status}).
      </p>
    )
  }
  return stored.data.pipeline === 'lab' ? (
    <LabStagePanel stage={stored.data.stage} onShowArtifacts={showArtifacts} />
  ) : (
    <ScoreStagePanel stage={stored.data.stage} onShowArtifacts={showArtifacts} />
  )
}

function LabStagePanel({ stage, onShowArtifacts }: { stage: LabStageResult; onShowArtifacts: () => void }) {
  const decisions = stage.decisions ?? []
  const datasets = stage.datasets ?? []
  const figures: Array<[string, string]> = [
    ...Object.entries(stage.options_used).map(([key, value]): [string, string] => [`option ${key}`, formatValue(value === null ? null : String(value))]),
    ...Object.entries(stage.metrics).map(([key, value]): [string, string] => [key, formatValue(value)]),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl">{stage.name}</h3>
        <StageStatusBadge status={stage.status} />
        <span className="text-sm text-muted-foreground tabular-nums">{formatDuration(stage.duration_ms)}</span>
      </div>
      {stage.warnings.length > 0 && (
        <ul aria-label="Avertissements" className="space-y-1 text-sm text-warning">
          {stage.warnings.map((warning, index) => (
            <li key={index}>{warning}</li>
          ))}
        </ul>
      )}
      {figures.length > 0 && (
        <PanelBlock title="Options et mesures">
          <Figures entries={figures} />
        </PanelBlock>
      )}
      {decisions.length > 0 && <StageDecisions decisions={decisions} />}
      {datasets.length > 0 && (
        <PanelBlock title={`Sorties (${datasets.length})`}>
          <ul className="divide-y divide-border border-y border-border text-sm">
            {datasets.map((dataset) => (
              <li key={dataset.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{dataset.title}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatCount(dataset.total_rows)} lignes × {dataset.columns.length} colonnes
                </span>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" size="sm" onClick={onShowArtifacts}>
            Inspecter ces données
          </Button>
        </PanelBlock>
      )}
      {stage.sources.length > 0 && (
        <PanelBlock title="Sources">
          <SourceList sources={stage.sources} />
        </PanelBlock>
      )}
    </div>
  )
}
