import { useId } from 'react'
import { RotateCcw } from 'lucide-react'
import type { TaxProfile } from '@/api/accounts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMoney, formatPercent } from './format'
import type { DraftErrors, SimulatorDraft } from './simulatorForm'

interface SimulatorControlsProps {
  draft: SimulatorDraft
  errors: DraftErrors
  profile?: TaxProfile
  onChange: (patch: Partial<SimulatorDraft>) => void
  onReset: () => void
}

type TextField = 'contribution' | 'years' | 'returnPct' | 'income'

/** The simulator's inputs and the tax facts they lead to. */
export function SimulatorControls({ draft, errors, profile, onChange, onReset }: SimulatorControlsProps) {
  const id = useId()
  const fields: Array<{ name: TextField; label: string; help: string; placeholder?: string }> = [
    { name: 'contribution', label: 'Montant annuel avant impôt ($)', help: 'Revenu brut mis de côté chaque année.' },
    { name: 'years', label: 'Horizon (années)', help: 'La comparaison de référence porte sur 15 ans.' },
    { name: 'returnPct', label: 'Rendement total annuel (%)', help: 'Dividendes compris, avant frais.' },
    {
      name: 'income',
      label: 'Revenu annuel ($)',
      // While the field is empty, the profile's income is the demo value.
      help:
        draft.income.trim() !== ''
          ? 'Videz le champ pour revenir au revenu du profil.'
          : profile
            ? `Vide : ${formatMoney(profile.income)}, valeur de démonstration du profil.`
            : 'Vide : revenu du profil.',
      placeholder: draft.income.trim() === '' && profile ? String(Math.round(profile.income)) : undefined,
    },
  ]
  const firstHomeBuyer = draft.firstHomeBuyer ?? profile?.first_home_buyer ?? false

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => {
          const fieldId = `${id}-${field.name}`
          const error = errors[field.name]
          return (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={fieldId}>{field.label}</Label>
              <Input
                id={fieldId}
                inputMode="decimal"
                value={draft[field.name]}
                placeholder={field.placeholder}
                aria-invalid={error ? true : undefined}
                aria-describedby={`${fieldId}-help`}
                onChange={(event) => onChange({ [field.name]: event.target.value })}
              />
              <p id={`${fieldId}-help`} className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                {error ?? field.help}
              </p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <input
            id={`${id}-fhb`}
            type="checkbox"
            checked={firstHomeBuyer}
            onChange={(event) => onChange({ firstHomeBuyer: event.target.checked })}
            className="size-4 accent-primary"
          />
          <Label htmlFor={`${id}-fhb`}>Premier achat d'une propriété prévu (CELIAPP)</Label>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw aria-hidden="true" className="mr-2 size-4" />
          Revenir au profil
        </Button>
      </div>

      {profile && (
        <dl className="grid gap-3 rounded-lg bg-muted p-4 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <Fact label="Taux marginal actuel" value={formatPercent(profile.rate_now)} />
          <Fact
            label="Taux prévu à la retraite"
            value={`${formatPercent(profile.rate_retirement)} (revenu de ${formatMoney(profile.retirement_income)})`}
          />
          <Fact label="Droits CELI disponibles" value={formatMoney(profile.tfsa_room)} />
          <Fact label="Droits REER annuels" value={formatMoney(profile.rrsp_room)} />
          <Fact label="CELIAPP" value={profile.fhsa_eligible ? `Admissible, ${profile.fhsa_years} ans` : 'Non admissible'} />
        </dl>
      )}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  )
}
