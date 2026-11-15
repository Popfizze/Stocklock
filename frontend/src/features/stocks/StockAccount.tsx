import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccountProjection } from '@/api/accounts'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
// Straight from the component files, not the feature's index: that would pull the whole Comptes tab in.
import { projectionErrorMessage } from '@/features/accounts/format'
import { LevelToggle } from '@/features/accounts/LevelToggle'
import { ProjectionResults } from '@/features/accounts/ProjectionResults'
import type { Level } from '@/features/accounts/viewOptions'
import { useActivePersona } from '@/features/personas/activePersona'
import { stockAccountRequest } from './accountRequest'
import { StockSection } from './StockSection'

interface StockAccountProps {
  ticker: string
  /** One of the datathon's 31 assets: only those have their own account projection. */
  starterKit: boolean
}

/**
 * « L'impôt selon le compte » (step 3): the title projected after tax in a
 * CELI, a REER, a CELIAPP and a non-registered account for the active profile,
 * from the one-sentence result (Simple) to every figure (Complexe) — the
 * Comptes tab's own results, facts and no pick. A title outside the datathon's
 * assets gets the profile's general projection, and says so.
 */
export function StockAccount({ ticker, starterKit }: StockAccountProps) {
  const { personaId, persona } = useActivePersona()
  const [level, setLevel] = useState<Level>('simple')
  const request = personaId ? stockAccountRequest(personaId, starterKit ? ticker : null) : null
  const { data, error, isPending, isFetching, refetch } = useAccountProjection(request)
  const more = starterKit ? `/comptes?vue=chiffres&titre=${encodeURIComponent(ticker)}` : '/comptes?vue=chiffres'

  return (
    <StockSection
      id="compte"
      eyebrow="Étape 3 · Optimisation fiscale"
      title="L'impôt"
      accent="selon le compte"
      description={`${starterKit ? ticker : 'Une épargne'} dans un CELI, un REER, un CELIAPP ou un compte non enregistré : ce qu’il en resterait après impôt${persona ? ` pour ${persona.name}` : ''}.`}
      action={<LevelToggle level={level} onLevelChange={setLevel} hideHint />}
    >
      {!starterKit && (
        <p className="rounded-2xl border border-border p-5 text-sm text-muted-foreground">
          La projection propre à un titre couvre les 31 titres du jeu de données du datathon ; {ticker} n’en fait pas
          partie. Voici la projection d’une épargne{persona ? ` de ${persona.name}` : ''} en général : elle ne tient
          pas compte de ce que verse ce titre (dividendes, retenue américaine).
        </p>
      )}
      {isPending ? (
        <div role="status" aria-label="Analyse des comptes" className="space-y-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p className="text-destructive">{projectionErrorMessage(error)}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          <ProjectionResults projection={data} level={level} stale={isFetching} />
          <p className="text-sm">
            <Link to={more} className="link">
              Voir la projection en chiffres dans Comptes
            </Link>
          </p>
        </>
      )}
    </StockSection>
  )
}
