import { useMemo } from 'react'
import { useAccountProjection } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { projectionErrorMessage } from './format'
import { ProjectionResults } from './ProjectionResults'
import { SimulatorControls } from './SimulatorControls'
import { DEFAULT_DRAFT, toProjectionRequest, type SimulatorDraft } from './simulatorForm'

interface ProjectionSimulatorProps {
  personaId: string
  /** The fields, kept by the page so they survive a tab switch. */
  draft: SimulatorDraft
  onDraftChange: (draft: SimulatorDraft) => void
}

/** The generic 15-year comparison: the same saving in each account, after tax. */
export function ProjectionSimulator({ personaId, draft, onDraftChange }: ProjectionSimulatorProps) {
  const { request, errors } = useMemo(() => toProjectionRequest(personaId, draft), [personaId, draft])
  const debounced = useDebouncedValue(request, 350)
  const { data, error, isFetching } = useAccountProjection(debounced)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Vos hypothèses</CardTitle>
          <CardDescription>
            Le même montant, placé chaque année dans chacun des comptes : combien en reste-t-il après
            impôt ? Les résultats se mettent à jour pendant la saisie.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SimulatorControls
            draft={draft}
            errors={errors}
            profile={data?.profile}
            onChange={(patch) => onDraftChange({ ...draft, ...patch })}
            onReset={() => onDraftChange(DEFAULT_DRAFT)}
          />
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-destructive">
          {projectionErrorMessage(error)}
        </p>
      )}

      {!data && !error && (
        <div role="status" aria-label="Calcul de la projection" className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      )}

      {data && <ProjectionResults projection={data} stale={isFetching} />}
    </div>
  )
}
