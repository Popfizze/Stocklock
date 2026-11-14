import type { ReactNode } from 'react'
import type { ApiError } from '@/api/client'
import { FIT_VERDICT_LABELS, type FitResult } from '@/api/persona'
import type { Persona } from '@/api/personas'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { FitReasonList } from './FitReasons'
import { VERDICT_DOT } from './fitMeta'
import { blockErrorMessage, formatWeight } from './format'

interface ProfileFitProps {
  persona: Persona
  fit: FitResult | undefined
  error: ApiError | null
  isPending: boolean
  onRetry: () => void
  /** Under the reasons: the page's summary rows. */
  children?: ReactNode
}

/**
 * « Pour {profil} » : the decision block of the stock page. Whether the title
 * suits the active investor profile — the verdict, one sentence, then each
 * reason in plain French (volatility against the profile's maximum, excluded
 * sector, crypto, position size, ESG, hype).
 */
export function ProfileFit({ persona, fit, error, isPending, onRetry, children }: ProfileFitProps) {
  return (
    <section
      id="profil"
      aria-labelledby="profil-titre"
      className="fade-up scroll-mt-6 space-y-6 rounded-3xl border border-border p-6"
    >
      <div className="space-y-2">
        {/* A label, not a title: the verdict under it is the block's big line. */}
        <h2 id="profil-titre" className="eyebrow">
          Pour {persona.name}
        </h2>
        {isPending ? (
          <div role="status" aria-label="Chargement du verdict de profil" className="space-y-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : error || !fit ? (
          <div className="space-y-2 text-sm">
            <p className="font-display text-xl">Verdict de profil indisponible</p>
            {error && <p className="text-muted-foreground">{blockErrorMessage(error)}</p>}
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            <p className="flex items-center gap-3 font-display text-4xl tracking-tight">
              <span aria-hidden="true" className={cn('size-3.5 shrink-0', VERDICT_DOT[fit.verdict])} />
              {FIT_VERDICT_LABELS[fit.verdict]}
            </p>
            <p className="text-sm">{fit.summary}</p>
          </>
        )}
      </div>

      {fit && <FitReasonList reasons={fit.reasons} label="Raisons du verdict" />}

      {children}

      <p className="text-xs text-muted-foreground">
        Profil : {persona.age} ans, tolérance au risque {persona.risk_tolerance.toLowerCase()}, horizon{' '}
        {persona.horizon.toLowerCase()}.
        {fit &&
          ` Limites : volatilité maximale ${formatWeight(fit.max_volatility)}, position maximale ${formatWeight(fit.max_position)} par titre.`}{' '}
        Aide à la décision, pas un conseil financier personnalisé.
      </p>
    </section>
  )
}
