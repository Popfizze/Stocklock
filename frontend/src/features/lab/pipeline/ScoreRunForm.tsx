import { useId, useState, type FormEvent } from 'react'
import { Loader2, Play } from 'lucide-react'
import type { ScoreRunParams } from '@/api/pipeline'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_PARAMS } from './pipelineFormat'

interface FieldDef {
  key: keyof ScoreRunParams
  label: string
  help: string
  min: number
  max: number
  /** Shares are typed in percent and sent as a ratio. */
  percent?: boolean
}

const MAIN_FIELD: FieldDef = {
  key: 'max_titles',
  label: 'Nombre de titres',
  help: 'De 5 à 600, les plus grandes capitalisations en premier.',
  min: 5,
  max: 600,
}

const ADVANCED_FIELDS: FieldDef[] = [
  { key: 'ca_share', label: 'Part d’actions canadiennes (%)', help: 'Parmi les actions (TSX).', min: 0, max: 100, percent: true },
  { key: 'etf_share', label: 'Part de FNB (%)', help: 'Parmi les titres notés.', min: 0, max: 100, percent: true },
  { key: 'news_per_title', label: 'Articles par titre', help: 'Nombre maximal d’articles gardés.', min: 0, max: 50 },
  { key: 'max_llm_articles', label: 'Articles envoyés à Claude Haiku', help: 'Plafond pour tout le run (Bedrock).', min: 0, max: 5000 },
]

type Draft = Record<keyof ScoreRunParams, string>

function initialDraft(): Draft {
  return {
    max_titles: String(DEFAULT_PARAMS.max_titles),
    ca_share: String(DEFAULT_PARAMS.ca_share * 100),
    etf_share: String(DEFAULT_PARAMS.etf_share * 100),
    news_per_title: String(DEFAULT_PARAMS.news_per_title),
    max_llm_articles: String(DEFAULT_PARAMS.max_llm_articles),
  }
}

interface ScoreRunFormProps {
  onStart: (params: ScoreRunParams) => void
  /** A run is being started or is already running. */
  busy: boolean
  busyLabel?: string
}

/** The parameters of a score run and the button that starts it. */
export function ScoreRunForm({ onStart, busy, busyLabel }: ScoreRunFormProps) {
  const id = useId()
  const [draft, setDraft] = useState<Draft>(initialDraft)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const value = (field: FieldDef) => {
      const typed = Number(draft[field.key])
      const bounded = Math.min(field.max, Math.max(field.min, Number.isFinite(typed) ? typed : field.min))
      return field.percent ? bounded / 100 : Math.round(bounded)
    }
    onStart({
      max_titles: value(MAIN_FIELD),
      ca_share: value(ADVANCED_FIELDS[0]),
      etf_share: value(ADVANCED_FIELDS[1]),
      news_per_title: value(ADVANCED_FIELDS[2]),
      max_llm_articles: value(ADVANCED_FIELDS[3]),
    })
  }

  const field = (def: FieldDef) => (
    <div key={def.key} className="space-y-1.5">
      <Label htmlFor={`${id}-${def.key}`}>{def.label}</Label>
      <Input
        id={`${id}-${def.key}`}
        type="number"
        min={def.min}
        max={def.max}
        value={draft[def.key]}
        onChange={(event) => setDraft((current) => ({ ...current, [def.key]: event.target.value }))}
        aria-describedby={`${id}-${def.key}-help`}
      />
      <p id={`${id}-${def.key}-help`} className="text-xs text-muted-foreground">
        {def.help}
      </p>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-full max-w-56">{field(MAIN_FIELD)}</div>
        <Button type="submit" size="lg" disabled={busy} className="mt-5.5">
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
          {busy ? (busyLabel ?? 'Run en cours…') : 'Lancer le pipeline des scores'}
        </Button>
      </div>
      <details className="text-sm">
        <summary className="w-fit cursor-pointer text-muted-foreground hover:text-foreground">
          Paramètres avancés
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{ADVANCED_FIELDS.map(field)}</div>
      </details>
    </form>
  )
}
