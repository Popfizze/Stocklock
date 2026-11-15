import type { KeyboardEvent, PointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, X } from 'lucide-react'
import type { AnalyzedHolding, PortfolioHolding } from '@/api/persona'
import { FitBadge } from '@/features/stocks/FitBadge'
import { cn } from '@/lib/utils'
import { formatShare } from './portfolioStore'

interface HoldingsListProps {
  holdings: PortfolioHolding[]
  /** The analysis of each holding, by symbol, once it is back. */
  analyzed: Record<string, AnalyzedHolding>
  maxPosition: number | null
  onWeightChange: (ticker: string, weight: number) => void
  onRemove: (ticker: string) => void
}

/** Tiles of a weight gauge, and the weight a full gauge stands for (it stretches for a heavier holding). */
const TILES = 20
const SCALE = 40
const WEIGHT = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 1 })
const ROUND_BUTTON =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40'

/**
 * The holdings as a list, for the keyboard and for screen readers: each title has a gauge of tiles
 * that is a slider (arrow keys, − and +, a click on a tile), with its share, volatility and fit.
 * The weights are in any unit: the shares are normalised.
 */
export function HoldingsList({ holdings, analyzed, maxPosition, onWeightChange, onRemove }: HoldingsListProps) {
  return (
    <ul aria-label="Titres du portefeuille" className="divide-y divide-border border-y border-border">
      {holdings.map((holding) => (
        <HoldingRow
          key={holding.ticker}
          holding={holding}
          detail={analyzed[holding.ticker]}
          maxPosition={maxPosition}
          onWeight={(weight) => onWeightChange(holding.ticker, weight)}
          onRemove={() => onRemove(holding.ticker)}
        />
      ))}
    </ul>
  )
}

interface HoldingRowProps {
  holding: PortfolioHolding
  detail: AnalyzedHolding | undefined
  maxPosition: number | null
  onWeight: (weight: number) => void
  onRemove: () => void
}

function HoldingRow({ holding, detail, maxPosition, onWeight, onRemove }: HoldingRowProps) {
  const { ticker, weight } = holding
  const scale = Math.max(SCALE, Math.ceil(weight / 10) * 10)
  const filled = Math.round((weight / scale) * TILES)
  const over = Boolean(detail?.over_max_position)
  const set = (next: number) => onWeight(Math.min(999, Math.max(0, Math.round(next * 10) / 10)))
  const text = `${WEIGHT.format(weight)}${detail ? `, soit ${formatShare(detail.weight)} du portefeuille` : ''}`

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }
    if (event.key in steps) set(weight + steps[event.key])
    else if (event.key === 'Home') set(0)
    else if (event.key === 'End') set(scale)
    else return
    event.preventDefault()
  }
  /** A click on the gauge sets the weight to the tile clicked. */
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width > 0) set(Math.ceil(((event.clientX - box.left) / box.width) * TILES) * (scale / TILES))
  }

  return (
    <li className="grid items-center gap-x-6 gap-y-3 py-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,16rem)_auto]">
      <div className="min-w-0">
        <Link to={`/titres/${encodeURIComponent(ticker)}`} className="link font-display text-lg">
          {ticker}
        </Link>
        {detail && <span className="block truncate text-xs text-muted-foreground">{detail.name}</span>}
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={() => set(weight - 1)} disabled={weight <= 0} aria-label={`Moins de poids pour ${ticker}`} className={ROUND_BUTTON}>
          <Minus aria-hidden="true" className="size-3.5" />
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label={`Poids de ${ticker}`}
          aria-valuemin={0}
          aria-valuemax={scale}
          aria-valuenow={weight}
          aria-valuetext={text}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          className="flex h-9 min-w-0 flex-1 cursor-pointer touch-none items-stretch gap-0.5 rounded-sm py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {Array.from({ length: TILES }, (_, index) => (
            <span key={index} aria-hidden="true" className={cn('flex-1', index < filled ? (over ? 'bg-destructive' : 'bg-tile-1') : 'bg-tile-7')} />
          ))}
        </div>
        <button type="button" onClick={() => set(weight + 1)} aria-label={`Plus de poids pour ${ticker}`} className={ROUND_BUTTON}>
          <Plus aria-hidden="true" className="size-3.5" />
        </button>
        <output aria-live="polite" className="display w-14 shrink-0 text-right text-2xl">
          <span className="sr-only">Poids de {ticker} : </span>
          {WEIGHT.format(weight)}
        </output>
      </div>

      <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <div>
          <dt className="sr-only">Part</dt>
          <dd className={cn('font-medium', over && 'text-destructive')}>
            {detail ? formatShare(detail.weight) : '—'}
            {over && maxPosition !== null && <span className="ml-1 text-xs font-normal">max. {formatShare(maxPosition)}</span>}
          </dd>
        </div>
        <div className="text-muted-foreground">
          <dt className="sr-only">Secteur</dt>
          <dd>{detail?.sector ?? '—'}</dd>
        </div>
        <div className="text-muted-foreground">
          <dt className="sr-only">Volatilité 1 an</dt>
          <dd>vol. {formatShare(detail?.volatility_1y ?? null)}</dd>
        </div>
        {detail && (
          <div>
            <dt className="sr-only">Pour votre profil</dt>
            <dd>
              <FitBadge verdict={detail.fit.verdict} summary={detail.fit.summary} tone="plain" />
            </dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer ${ticker}`}
        className="inline-flex size-9 items-center justify-center justify-self-end rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </li>
  )
}
