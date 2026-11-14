import { Link } from 'react-router-dom'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { GROUP_KIND_LABELS, groupSize, type GroupDraft, type GroupKind, type GroupLimits } from './launchModel'
import { ParamSlider } from './ParamSlider'
import { TickerTiles } from './TickerTiles'

const METER_TILES = 50

interface GroupPickerProps {
  /** The kinds of group the pipeline accepts. */
  kinds: GroupKind[]
  draft: GroupDraft
  limits: GroupLimits
  sections: Array<{ id: string; title: string }>
  sectors: Array<{ name: string; label: string }>
  /** The active profile's holdings. */
  portfolio: string[]
  onChange: (draft: GroupDraft) => void
}

/** The group of titles a run takes: a dashboard section, a sector, the profile's portfolio or a set built by hand. */
export function GroupPicker({ kinds, draft, limits, sections, sectors, portfolio, onChange }: GroupPickerProps) {
  const isAuto = draft.kind === 'auto'
  const cap = isAuto ? limits.autoCap : limits.cap
  const size = groupSize(draft, portfolio, limits.cap)
  const setKind = (kind: GroupKind) => {
    const sized = kind === 'auto' || kind === 'section' || kind === 'sector'
    onChange({ ...draft, kind, ref: null, size: sized ? limits.defaults[kind] : draft.size })
  }
  const refs = draft.kind === 'section' ? sections.map((s) => [s.id, s.title]) : sectors.map((s) => [s.name, s.label])
  const filled = Math.max(size > 0 ? 1 : 0, Math.round((size / cap) * METER_TILES))

  return (
    <div className="space-y-6">
      <ToggleGroup type="single" variant="chips" aria-label="Type de groupe" value={draft.kind} onValueChange={(next) => next && setKind(next as GroupKind)}>
        {kinds.map((kind) => (
          <ToggleGroupItem key={kind} value={kind} className="h-11 px-5">
            {GROUP_KIND_LABELS[kind]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {(draft.kind === 'section' || draft.kind === 'sector') && (
        <ToggleGroup
          type="single"
          variant="chips"
          aria-label={draft.kind === 'section' ? 'Section' : 'Secteur'}
          value={draft.ref ?? ''}
          onValueChange={(next) => next && onChange({ ...draft, ref: next })}
        >
          {refs.map(([value, label]) => (
            <ToggleGroupItem key={value} value={value}>
              {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      )}

      {draft.kind === 'portfolio' && (
        <div className="space-y-3">
          <ul aria-label="Titres du portefeuille" className="flex flex-wrap gap-2">
            {portfolio.map((ticker, index) => (
              <li
                key={ticker}
                className={cn(
                  'tile-in flex h-11 items-center rounded-xl px-3.5 text-sm font-medium',
                  index < limits.cap ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground line-through',
                )}
              >
                {ticker}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            Les titres du portefeuille du profil actif
            {portfolio.length > limits.cap && ` (les ${limits.cap} premiers : plafond du pipeline)`} —{' '}
            <Link to="/portefeuille" className="link">
              modifier le portefeuille
            </Link>
            .
          </p>
        </div>
      )}

      {draft.kind === 'custom' && (
        <TickerTiles label="Titres du groupe" tickers={draft.tickers} cap={limits.cap} onChange={(tickers) => onChange({ ...draft, tickers })} />
      )}

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,20rem)_1fr]">
        {draft.kind === 'auto' || draft.kind === 'section' || draft.kind === 'sector' ? (
          <ParamSlider
            label="Taille du groupe"
            help={isAuto ? 'Les titres les plus valorisés : actions américaines, TSX et FNB.' : 'Les premiers titres de la liste, dans son ordre.'}
            value={draft.size}
            defaultValue={limits.defaults[draft.kind]}
            min={isAuto ? 5 : 1}
            max={cap}
            step={isAuto ? 5 : 1}
            format="count"
            onChange={(next) => onChange({ ...draft, size: next })}
          />
        ) : (
          <div className="rounded-3xl border border-border p-5">
            <p className="eyebrow">Taille du groupe</p>
            <p className="display text-3xl">{size}</p>
          </div>
        )}
        <div className="flex flex-col justify-center gap-2 rounded-3xl border border-border p-5">
          <p className="tabular-nums" aria-live="polite">
            <span className="font-medium">
              {size} titre{size > 1 ? 's' : ''}
            </span>
            <span className="text-muted-foreground"> · plafond {cap}</span>
          </p>
          <svg aria-hidden="true" viewBox={`0 0 ${METER_TILES * 6 - 1} 5`} className="h-3 w-full" preserveAspectRatio="none">
            {Array.from({ length: METER_TILES }, (_, index) => (
              <rect key={index} x={index * 6} y={0} width={5} height={5} className={index < filled ? 'fill-tile-1' : 'fill-tile-7'} />
            ))}
          </svg>
        </div>
      </div>
    </div>
  )
}
