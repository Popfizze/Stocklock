import { useMemo } from 'react'
import { type AccountId, useAccountProjection } from '@/api/accounts'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { AssetPicker } from './AssetPicker'
import { projectionErrorMessage } from './format'
import { ProjectionResults } from './ProjectionResults'
import { SectionHeading } from './SectionHeading'
import { SimulatorControls } from './SimulatorControls'
import { DEFAULT_DRAFT, toProjectionRequest, type SimulatorDraft } from './simulatorForm'
import { atLeast, DEFAULT_TICKER, type Level } from './viewOptions'

interface NumbersViewProps {
  personaId: string
  level: Level
  accounts: AccountId[]
  /** The fields, kept by the page so they survive a change of view. */
  draft: SimulatorDraft
  onDraftChange: (draft: SimulatorDraft) => void
  /** null: a generic saving; otherwise the stock projected. */
  ticker: string | null
  onTickerChange: (ticker: string | null) => void
}

/** « En chiffres » : the same saving, or one stock, placed in each account and projected after tax. */
export function NumbersView(props: NumbersViewProps) {
  const { personaId, level, accounts, draft, onDraftChange, ticker, onTickerChange } = props
  const { request, errors } = useMemo(() => toProjectionRequest(personaId, draft, ticker), [personaId, draft, ticker])
  const debounced = useDebouncedValue(request, 350)
  const { data, error, isFetching } = useAccountProjection(debounced)

  return (
    <div className="space-y-6">
      <SectionHeading
        title="La projection après impôt"
        lead="Le même montant avant impôt, placé chaque année dans chaque compte : ce qu'il en resterait après impôt. Une simulation, pas une prévision."
      />

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Ce qui est placé</p>
          <ToggleGroup
            type="single"
            value={ticker === null ? 'epargne' : 'titre'}
            onValueChange={(value) => value && onTickerChange(value === 'titre' ? (ticker ?? DEFAULT_TICKER) : null)}
            aria-label="Ce qui est placé"
          >
            <ToggleGroupItem value="epargne">Une épargne</ToggleGroupItem>
            <ToggleGroupItem value="titre">Un titre précis</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {ticker !== null && <AssetPicker ticker={ticker} onTickerChange={onTickerChange} />}
      </div>

      {atLeast(level, 'normale') && (
        <SimulatorControls
          draft={draft}
          errors={errors}
          level={level}
          withReturn={ticker === null}
          profile={data?.profile}
          onChange={(patch) => onDraftChange({ ...draft, ...patch })}
          onReset={() => onDraftChange(DEFAULT_DRAFT)}
        />
      )}

      {error && (
        <p role="alert" className="text-destructive">
          {projectionErrorMessage(error)}
        </p>
      )}

      {!data && !error && (
        <div role="status" aria-label="Calcul de la projection" className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {data && <ProjectionResults projection={data} level={level} accounts={accounts} stale={isFetching} />}
    </div>
  )
}
