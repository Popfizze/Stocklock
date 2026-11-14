import type { LabStep } from '@/api/lab'
import { cn } from '@/lib/utils'
import { FLOW_COLUMNS } from '../run/flowModel'
import { SCORE_PIPELINE, SCORE_PIPELINE_INFO } from './launchModel'

interface PipelinePickerProps {
  steps: LabStep[]
  /** Stage layers of the score pipeline, in order. */
  scoreLayers: string[]
  value: string
  onChange: (pipeline: string) => void
}

/** The pipelines as tiles: each one drawn as its stages, layer by layer, with whether it takes a group. */
export function PipelinePicker({ steps, scoreLayers, value, onChange }: PipelinePickerProps) {
  const options = [
    { id: SCORE_PIPELINE, label: SCORE_PIPELINE_INFO.label, note: `AWS · groupe · ${SCORE_PIPELINE_INFO.timing}`, layers: scoreLayers },
    ...steps.map((step) => ({
      id: step.id,
      label: step.label,
      note: step.group_runnable ? 'Labo · groupe ou titre seul' : 'Labo · un scénario à la fois',
      layers: step.stages.map((stage) => stage.layer),
    })),
  ]

  return (
    <div role="radiogroup" aria-label="Pipeline" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {options.map((option) => {
        const checked = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex flex-col gap-3 rounded-3xl border border-border p-5 text-left outline-none transition-colors hover:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
              checked && 'border-primary bg-primary text-primary-foreground',
            )}
          >
            <span className="font-display text-xl leading-tight">{option.label}</span>
            {/* The pipeline's silhouette: one tile per stage, stacked by layer (Bronze, Silver, Gold, Sortie). */}
            <span aria-hidden="true" className="flex h-12 items-end gap-1.5">
              {FLOW_COLUMNS.slice(1).map((layer) => (
                <span key={layer} className="flex flex-col-reverse gap-0.5">
                  {option.layers
                    .filter((candidate) => candidate === layer)
                    .slice(0, 7)
                    .map((_, index) => (
                      <span key={index} className={cn('block h-1.5 w-5', checked ? 'bg-primary-foreground/80' : 'bg-tile-4')} />
                    ))}
                </span>
              ))}
            </span>
            <span className={cn('text-xs', checked ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
              {option.layers.length} étapes · {option.note}
            </span>
          </button>
        )
      })}
    </div>
  )
}
