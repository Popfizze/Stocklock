import type { ApiError } from '@/api/client'
import type { FitResult } from '@/api/persona'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FitBadge } from './FitBadge'
import { SEVERITY_DOT, SEVERITY_LABELS } from './fitMeta'
import { formatWeight, marketErrorMessage } from './format'

interface StockFitProps {
  personaName: string
  fit: FitResult | undefined
  error: ApiError | null
  isPending: boolean
}

/**
 * « Pour {profil} » : whether the title suits the active investor profile —
 * the verdict, then each reason in plain French (volatility against the
 * profile's maximum, excluded sector, crypto, position size, ESG, hype).
 */
export function StockFit({ personaName, fit, error, isPending }: StockFitProps) {
  return (
    <section aria-labelledby="verdict-profil" className="space-y-3 rounded-xl border border-border p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 id="verdict-profil" className="text-lg font-semibold tracking-tight">
          Pour {personaName}
        </h2>
        {fit && <FitBadge verdict={fit.verdict} tone="plain" />}
      </div>

      {isPending ? (
        <div role="status" aria-label="Chargement du verdict de profil" className="space-y-2">
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
      ) : error || !fit ? (
        <p className="text-sm text-muted-foreground">
          Verdict de profil indisponible{error ? ` : ${marketErrorMessage(error)}` : '.'}
        </p>
      ) : (
        <>
          <p>{fit.summary}</p>
          <ul aria-label="Raisons du verdict" className="space-y-1.5 text-sm">
            {fit.reasons.map((reason, index) => (
              <li key={index} className="flex items-baseline gap-2.5">
                <span
                  aria-hidden="true"
                  className={cn('size-1.5 shrink-0 rounded-full', SEVERITY_DOT[reason.severity])}
                />
                <span>
                  <span className="sr-only">{SEVERITY_LABELS[reason.severity]} : </span>
                  {reason.message}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Limites du profil : volatilité maximale {formatWeight(fit.max_volatility)}, position
            maximale {formatWeight(fit.max_position)} par titre. Aide à la décision, pas un conseil
            financier personnalisé.
          </p>
        </>
      )}
    </section>
  )
}
