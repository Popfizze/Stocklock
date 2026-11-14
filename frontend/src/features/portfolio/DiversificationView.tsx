import type { Diversification, WeightBucket } from '@/api/persona'
import { cn } from '@/lib/utils'
import { formatShare } from './portfolioStore'

const CONCENTRATION_LABELS: Record<Diversification['concentration'], string> = {
  faible: 'Concentration faible',
  moderee: 'Concentration modérée',
  elevee: 'Concentration élevée',
}

const EFFECTIVE = new Intl.NumberFormat('fr-CA', { maximumFractionDigits: 1 })

interface DiversificationViewProps {
  diversification: Diversification
}

/**
 * « Diversification » : the portfolio's weights by sector, asset class and
 * country, its largest positions against the profile's maximum, and its
 * volatility against the profile's maximum.
 */
export function DiversificationView({ diversification: d }: DiversificationViewProps) {
  const volatility = d.portfolio_volatility ?? d.weighted_volatility
  const overVolatility = volatility !== null && volatility > d.max_volatility

  return (
    <section aria-labelledby="diversification" className="space-y-5">
      <h2 id="diversification" className="text-3xl leading-tight">
        Diversification
      </h2>

      <dl className="grid grid-cols-2 gap-x-8 gap-y-5 border-y border-border py-5 lg:grid-cols-4">
        <Figure
          label="Volatilité du portefeuille"
          value={formatShare(volatility)}
          detail={`maximum du profil : ${formatShare(d.max_volatility)}`}
          alert={overVolatility}
        />
        <Figure
          label="Volatilité pondérée"
          value={formatShare(d.weighted_volatility)}
          detail="sans les corrélations (borne haute)"
        />
        <Figure
          label="Positions équivalentes"
          value={EFFECTIVE.format(d.effective_positions)}
          detail={CONCENTRATION_LABELS[d.concentration]}
          alert={d.concentration === 'elevee'}
        />
        <Figure
          label="Position maximale du profil"
          value={formatShare(d.max_position)}
          detail={
            d.positions_over_max.length === 0
              ? 'aucun titre au-dessus'
              : `au-dessus : ${d.positions_over_max.join(', ')}`
          }
          alert={d.positions_over_max.length > 0}
        />
      </dl>

      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
        <WeightBars title="Par secteur" buckets={d.by_sector} />
        <WeightBars title="Par classe d’actifs" buckets={d.by_asset_class} />
        <WeightBars title="Par pays" buckets={d.by_country} />
        <WeightBars
          title="Plus grandes positions"
          buckets={d.largest.map((position) => ({
            key: position.ticker,
            label: position.ticker,
            weight: position.weight,
          }))}
          limit={d.max_position}
        />
      </div>
    </section>
  )
}

interface FigureProps {
  label: string
  value: string
  detail: string
  alert?: boolean
}

function Figure({ label, value, detail, alert }: FigureProps) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-2 space-y-1.5">
        <span className="display block text-4xl">{value}</span>
        <span className={cn('block text-xs', alert ? 'text-destructive' : 'text-muted-foreground')}>{detail}</span>
      </dd>
    </div>
  )
}

interface WeightBarsProps {
  title: string
  buckets: WeightBucket[]
  /** A weight above this limit is flagged (the profile's maximum position). */
  limit?: number
}

function WeightBars({ title, buckets, limit }: WeightBarsProps) {
  // Bars are drawn against the largest weight, so a diversified portfolio still reads.
  const scale = Math.max(...buckets.map((bucket) => bucket.weight), limit ?? 0, 0.0001)
  return (
    <div className="space-y-2">
      <h3 className="eyebrow">{title}</h3>
      <ul className="space-y-2 text-sm">
        {buckets.map((bucket) => {
          const over = limit !== undefined && bucket.weight > limit
          return (
            <li key={bucket.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">{bucket.label}</span>
                <span className={cn('shrink-0 font-medium tabular-nums', over && 'text-destructive')}>
                  {formatShare(bucket.weight)}
                </span>
              </div>
              {/* Decorative: the figure on the right says the same thing. */}
              <svg
                aria-hidden="true"
                viewBox="0 0 100 1"
                preserveAspectRatio="none"
                className={cn('mt-1 block h-1 w-full bg-muted', over ? 'text-destructive' : 'text-foreground')}
              >
                <rect width={(bucket.weight / scale) * 100} height="1" fill="currentColor" />
              </svg>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
