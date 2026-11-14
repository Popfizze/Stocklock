import type { Persona } from '@/api/personas'
import type { RunFilters as Filters, RunStatus, RunTrigger } from '@/api/runs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  DATE_RANGE_LABELS,
  PIPELINE_LABELS,
  STATUS_LABELS,
  TRIGGER_LABELS,
  type DateRange,
  type PipelineFilter,
} from './runModel'

const ALL = 'all'

interface RunFiltersProps {
  filters: Filters
  range: DateRange
  personas: Persona[]
  onFilters: (filters: Filters) => void
  onRange: (range: DateRange) => void
}

/** The console's filters as chips: one choice per row, « Tous » by default. Sent to the registry. */
export function RunFilters({ filters, range, personas, onFilters, onRange }: RunFiltersProps) {
  const set = <K extends keyof Filters>(key: K, value: string) =>
    onFilters({ ...filters, [key]: value === ALL ? undefined : (value as Filters[K]) })

  return (
    <div className="grid gap-x-10 gap-y-4 lg:grid-cols-2">
      <ChipRow
        label="Pipeline"
        value={filters.pipeline ?? ALL}
        options={Object.entries(PIPELINE_LABELS) as [PipelineFilter, string][]}
        onChange={(value) => set('pipeline', value)}
      />
      <ChipRow
        label="Statut"
        value={filters.status ?? ALL}
        options={Object.entries(STATUS_LABELS) as [RunStatus, string][]}
        onChange={(value) => set('status', value)}
      />
      <ChipRow
        label="Profil"
        value={filters.persona ?? ALL}
        options={personas.map((persona) => [persona.id, persona.name.split(' ')[0]])}
        onChange={(value) => set('persona', value)}
      />
      <ChipRow
        label="Déclencheur"
        value={filters.trigger ?? ALL}
        options={Object.entries(TRIGGER_LABELS) as [RunTrigger, string][]}
        onChange={(value) => set('trigger', value)}
      />
      <ChipRow
        label="Date"
        allLabel={DATE_RANGE_LABELS.all}
        value={range}
        options={(Object.entries(DATE_RANGE_LABELS) as [DateRange, string][]).filter(([key]) => key !== ALL)}
        onChange={(value) => onRange(value as DateRange)}
      />
    </div>
  )
}

interface ChipRowProps {
  label: string
  allLabel?: string
  value: string
  options: Array<[value: string, label: string]>
  onChange: (value: string) => void
}

function ChipRow({ label, allLabel = 'Tous', value, options, onChange }: ChipRowProps) {
  return (
    <div className="space-y-2">
      <p className="eyebrow" id={`filtre-${label}`}>
        {label}
      </p>
      <ToggleGroup
        type="single"
        variant="chips"
        aria-labelledby={`filtre-${label}`}
        value={value}
        // Radix sends '' when the pressed chip is pressed again: that is « Tous ».
        onValueChange={(next) => onChange(next || ALL)}
      >
        <ToggleGroupItem value={ALL}>{allLabel}</ToggleGroupItem>
        {options.map(([option, text]) => (
          <ToggleGroupItem key={option} value={option}>
            {text}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
