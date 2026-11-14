import { useMarketKpis, type MarketKpi } from '@/api/stocks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TREND_TEXT, formatSignedPercent, marketErrorMessage, trendOf } from '@/features/stocks/format'
import { cn } from '@/lib/utils'

const LOCALE = 'fr-CA'
const FORMATS: Record<MarketKpi['kind'], Intl.NumberFormat> = {
  index: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  fx: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
  count: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }),
}

const GRID = 'grid grid-cols-2 gap-x-8 gap-y-6 border-y border-border py-5 sm:grid-cols-3 xl:grid-cols-6'
const SKELETON_COUNT = 6

/**
 * The KPI strip of the Tableau de bord: the main indices and USD/CAD with
 * their day change, the size of the universe, the scored titles. One request,
 * but each tile has its own status: a failed source only blanks its tile.
 */
export function KpiStrip() {
  const { data, error, isPending, refetch } = useMarketKpis()

  if (isPending) {
    return (
      <div role="status" aria-label="Chargement des indicateurs" className={GRID}>
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div key={index} className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 border-y border-border py-4 text-sm">
        <p className="text-destructive">Indicateurs : {marketErrorMessage(error)}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          Réessayer
        </Button>
      </div>
    )
  }

  return (
    <section aria-label="Indicateurs du marché">
      <dl className={GRID}>
        {data.items.map((kpi) => (
          <KpiTile key={kpi.id} kpi={kpi} />
        ))}
      </dl>
    </section>
  )
}

function KpiTile({ kpi }: { kpi: MarketKpi }) {
  const failed = kpi.status === 'error'
  return (
    <div className="min-w-0" title={kpi.source}>
      <dt className="truncate text-xs text-muted-foreground">{kpi.label}</dt>
      <dd className="mt-1">
        <span
          className={cn(
            'block truncate text-2xl font-semibold tracking-tight tabular-nums',
            kpi.value === null && 'text-muted-foreground',
          )}
        >
          {kpi.value === null ? '—' : FORMATS[kpi.kind].format(kpi.value)}
        </span>
        <span className="mt-0.5 block text-xs tabular-nums">
          {failed ? (
            <span className="text-muted-foreground" title={kpi.message ?? undefined}>
              Indisponible
              {kpi.message && <span className="sr-only"> : {kpi.message}</span>}
            </span>
          ) : kpi.change_pct !== null ? (
            <span className={TREND_TEXT[trendOf(kpi.change_pct)]}>
              {formatSignedPercent(kpi.change_pct)}
            </span>
          ) : (
            <span className="text-muted-foreground">{kpi.detail}</span>
          )}
        </span>
      </dd>
    </div>
  )
}
