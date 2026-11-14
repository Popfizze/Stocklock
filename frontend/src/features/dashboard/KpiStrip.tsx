import { useFitBatch } from '@/api/persona'
import {
  useMarketKpis,
  useMarketSection,
  type MarketKpi,
  type MarketSectionInfo,
} from '@/api/stocks'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useActivePersona } from '@/features/personas/activePersona'
import {
  TREND_TEXT,
  formatSignedPercent,
  formatWeight,
  marketErrorMessage,
  trendOf,
} from '@/features/stocks/format'
import { cn } from '@/lib/utils'

const LOCALE = 'fr-CA'
const FORMATS: Record<MarketKpi['kind'], Intl.NumberFormat> = {
  index: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  fx: new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
  count: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }),
}

const GRID = 'grid grid-cols-2 gap-x-8 gap-y-6 border-y border-border py-5 sm:grid-cols-3 xl:grid-cols-6'
const INDEX_SKELETONS = 3

interface KpiStripProps {
  /** The profile's first section: its cards feed the « Titres compatibles » tile. */
  section?: MarketSectionInfo
}

/**
 * The KPI strip of the Tableau de bord: the main indices with their day
 * change, then the active profile's own figures — its maximum volatility,
 * its maximum position, and how many titles of its first section suit it.
 * Each tile has its own status: a failed source only blanks its tile.
 */
export function KpiStrip({ section }: KpiStripProps) {
  const { data, error, isPending, refetch } = useMarketKpis()
  const indices = (data?.items ?? []).filter((kpi) => kpi.kind === 'index')

  return (
    <section aria-label="Indicateurs" className="space-y-2">
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-destructive">Indices : {marketErrorMessage(error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Réessayer
          </Button>
        </div>
      )}
      <dl className={GRID}>
        {isPending &&
          Array.from({ length: INDEX_SKELETONS }, (_, index) => <TileSkeleton key={index} />)}
        {indices.map((kpi) => (
          <KpiTile key={kpi.id} kpi={kpi} />
        ))}
        {section && <ProfileTiles section={section} />}
      </dl>
    </section>
  )
}

function TileSkeleton() {
  return (
    <div role="status" aria-label="Chargement d’un indicateur" className="space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-3 w-16" />
    </div>
  )
}

interface TileProps {
  label: string
  value: string | null
  detail?: React.ReactNode
  title?: string
}

function Tile({ label, value, detail, title }: TileProps) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1">
        <span
          className={cn(
            'block truncate text-2xl font-semibold tracking-tight tabular-nums',
            value === null && 'text-muted-foreground',
          )}
        >
          {value ?? '—'}
        </span>
        <span className="mt-0.5 block text-xs tabular-nums">{detail}</span>
      </dd>
    </div>
  )
}

function KpiTile({ kpi }: { kpi: MarketKpi }) {
  const detail =
    kpi.status === 'error' ? (
      <span className="text-muted-foreground" title={kpi.message ?? undefined}>
        Indisponible
        {kpi.message && <span className="sr-only"> : {kpi.message}</span>}
      </span>
    ) : kpi.change_pct !== null ? (
      <span className={TREND_TEXT[trendOf(kpi.change_pct)]}>{formatSignedPercent(kpi.change_pct)}</span>
    ) : (
      <span className="text-muted-foreground">{kpi.detail}</span>
    )
  return (
    <Tile
      label={kpi.label}
      value={kpi.value === null ? null : FORMATS[kpi.kind].format(kpi.value)}
      detail={detail}
      title={kpi.source}
    />
  )
}

/** The profile's limits and its compatible titles, from the fit verdicts of its first section. */
function ProfileTiles({ section }: { section: MarketSectionInfo }) {
  const { personaId } = useActivePersona()
  // Same requests as the section's own block: answered once.
  const { data: cards } = useMarketSection(section.id)
  const tickers = (cards?.items ?? []).map((item) => item.ticker)
  const { data: batch, isError } = useFitBatch(personaId, tickers)

  const items = batch?.items ?? []
  const limits = items[0]
  const muted = (text: string) => <span className="text-muted-foreground">{text}</span>
  const waiting = isError || (cards !== undefined && tickers.length === 0) ? 'Indisponible' : 'Calcul en cours…'

  return (
    <>
      <Tile
        label="Votre volatilité max."
        value={limits ? formatWeight(limits.max_volatility) : null}
        detail={muted(limits ? 'par an, selon votre profil' : waiting)}
      />
      <Tile
        label="Votre position max."
        value={limits ? formatWeight(limits.max_position) : null}
        detail={muted(limits ? 'du portefeuille par titre' : waiting)}
      />
      <Tile
        label="Titres compatibles"
        value={
          limits
            ? `${items.filter((item) => item.verdict === 'compatible').length} sur ${items.length}`
            : null
        }
        detail={muted(limits ? `dans « ${section.title} »` : waiting)}
      />
    </>
  )
}
