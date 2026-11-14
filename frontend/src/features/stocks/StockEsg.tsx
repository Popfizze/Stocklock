import { useEsg, type EsgReport, type EsgScores, type FitResult } from '@/api/persona'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { CONTROVERSY_MAX, ESG_CATEGORIES } from './esgMeta'
import { FitReasonList } from './FitReasons'
import { ESG_RULES, reasonsFor } from './fitMeta'
import { formatLongDate } from './format'
import { BlockError, StockSection } from './StockSection'

interface StockEsgProps {
  ticker: string
  personaName: string
  /** The profile's verdict, for what it says about ESG risk and controversies. */
  fit: FitResult | undefined
}

/**
 * « ESG et controverses » : the title's ESG risk band, its controversy level
 * and the recent controversy-type headlines, then what they mean for the
 * active profile — or a plain « non disponible » (ETFs, cryptos, small caps).
 */
export function StockEsg({ ticker, personaName, fit }: StockEsgProps) {
  const { data, error, isPending, refetch } = useEsg(ticker)
  const reasons = reasonsFor(fit, ESG_RULES)

  return (
    <StockSection
      id="esg"
      eyebrow="Critères ESG"
      title="ESG"
      accent="et controverses"
      description="Le risque environnemental, social et de gouvernance du titre (plus il est bas, mieux c’est) et les controverses qui le touchent."
    >
      {isPending ? (
        <div role="status" aria-label="Chargement des données ESG" className="space-y-3">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <BlockError error={error} subject="Données ESG" onRetry={() => refetch()} />
      ) : (
        <div className="space-y-5">
          {data.esg ? (
            <EsgMeasures esg={data.esg} />
          ) : (
            <div className="rounded-3xl border border-border p-6">
              <p className="font-display text-xl">Données ESG non disponibles</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.message ?? `Aucune donnée ESG publiée pour ${ticker}.`}
              </p>
            </div>
          )}

          {reasons.length > 0 && (
            <div className="space-y-2">
              <h3 className="eyebrow">Pour {personaName}</h3>
              <FitReasonList reasons={reasons} label={`Les critères ESG pour ${personaName}`} />
            </div>
          )}

          <EsgHeadlines report={data} />
        </div>
      )}
    </StockSection>
  )
}

function EsgMeasures({ esg }: { esg: EsgScores }) {
  const level = esg.controversy_level
  return (
    <div className="space-y-5">
      <dl className="grid gap-x-10 gap-y-6 xl:grid-cols-2">
        <div className="space-y-2">
          <dt className="eyebrow">Risque ESG</dt>
          <dd className="space-y-3">
            <p className="font-display text-xl">{esg.risk_label}</p>
            {/* Decorative: the five risk categories, the title's one in ink. */}
            <ol aria-hidden="true" className="grid grid-cols-5 gap-1 text-center text-xs text-muted-foreground">
              {ESG_CATEGORIES.map((category) => (
                <li key={category.id} className="min-w-0 space-y-1">
                  <span
                    className={cn('block h-2', category.id === esg.risk_category ? 'bg-tile-1' : 'bg-tile-7')}
                  />
                  <span
                    className={cn('block', category.id === esg.risk_category && 'font-medium text-foreground')}
                  >
                    {category.label}
                  </span>
                </li>
              ))}
            </ol>
          </dd>
        </div>
        <div className="space-y-2">
          <dt className="eyebrow">Controverses</dt>
          <dd className="space-y-3">
            <p className="font-display text-xl">
              {esg.controversy_label ?? 'Niveau de controverse inconnu'}
            </p>
            {level !== null && (
              <span aria-hidden="true" className="flex gap-1">
                {Array.from({ length: CONTROVERSY_MAX }, (_, index) => (
                  <span
                    key={index}
                    className={cn('h-2 flex-1', index < level ? 'bg-tile-1' : 'bg-tile-7')}
                  />
                ))}
              </span>
            )}
          </dd>
        </div>
      </dl>
      {esg.involvement.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Activités sensibles :</span>
          {esg.involvement.map((flag) => (
            <Badge key={flag} variant="outline">
              {flag}
            </Badge>
          ))}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {esg.total_esg !== null && `Score de risque Sustainalytics : ${esg.total_esg}. `}
        Source : {esg.source}.
      </p>
    </div>
  )
}

function EsgHeadlines({ report }: { report: EsgReport }) {
  const news = report.sources.find((source) => source.id !== 'yahoo_screener_esg')
  return (
    <div className="space-y-2">
      <h3 className="eyebrow">Manchettes récentes de type controverse</h3>
      {report.events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucune manchette récente ne contient de mot-clé de controverse (poursuite, amende, rappel…).
        </p>
      ) : (
        <ul className="divide-y divide-border border-y border-border text-sm">
          {report.events.map((event) => (
            <li key={`${event.date}-${event.title}`} className="space-y-1 py-3">
              <p>
                {event.url ? (
                  <a href={event.url} target="_blank" rel="noopener noreferrer" className="link">
                    {event.title}
                  </a>
                ) : (
                  event.title
                )}
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {formatLongDate(event.date)}
                  {event.publisher ? ` · ${event.publisher}` : ''}
                </span>
                <Badge variant="secondary">mot-clé : {event.keyword}</Badge>
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Repérage par mots-clés dans les titres d’articles{news ? ` (${news.title})` : ''} : un indice à lire, pas un
        jugement sur l’entreprise.
      </p>
    </div>
  )
}
