import { Link } from 'react-router-dom'
import type { AccountId, AccountProjection, TaxProfile, TaxRules } from '@/api/accounts'
import { AccountLabel } from './AccountLabel'
import { formatMoney, formatPercent } from './format'

interface PersonaOrderProps {
  projection: AccountProjection
  rules: TaxRules
}

function room(account: AccountId, profile: TaxProfile, rules: TaxRules): string {
  switch (account) {
    case 'CELI':
      return `${formatMoney(profile.tfsa_room)} disponibles, puis ${formatMoney(rules.tfsa.annual_limits[String(rules.year)])} par an`
    case 'REER':
      return `${formatMoney(profile.rrsp_room)} par an (${formatPercent(rules.rrsp.rate_of_earned_income, 0)} du revenu)`
    case 'CELIAPP':
      return `${formatMoney(rules.fhsa.annual_limit)} par an, ${formatMoney(rules.fhsa.lifetime_limit)} à vie`
    default:
      return 'Sans plafond'
  }
}

/** The profile's own order: fill the first account up to its limit, then the next. */
export function PersonaOrder({ projection, rules }: PersonaOrderProps) {
  const { profile, inputs, ranking, recommendations } = projection
  const ineligible = projection.accounts.filter((account) => !account.eligible)

  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {ranking.map((row, index) => {
          const why = recommendations.accounts.find((advice) => advice.account === row.account)?.pros[0]
          return (
            <li
              key={row.account}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  <span className="sr-only">Étape {index + 1} : </span>
                  <AccountLabel account={row.account} />
                </p>
                <p className="text-sm text-muted-foreground">{room(row.account, profile, rules)}</p>
                {why && <p className="text-sm">{why}</p>}
              </div>
              <p className="text-sm sm:text-right">
                <span className="block text-xs text-muted-foreground">Après impôt, {inputs.years} ans</span>
                <span className="text-lg font-semibold tabular-nums">{formatMoney(row.after_tax)}</span>
              </p>
            </li>
          )
        })}
      </ol>
      {ineligible.map((account) => (
        <p key={account.account} className="text-sm text-muted-foreground">
          <AccountLabel account={account.account} /> : non admissible pour {profile.name}. {profile.fhsa_reason}
        </p>
      ))}
      <p className="text-xs text-muted-foreground">
        Classement de la projection : {formatMoney(inputs.annual_contribution)} avant impôt par an pendant {inputs.years}{' '}
        ans, à {formatPercent(inputs.total_return, 0)} par an. Changez ces hypothèses dans{' '}
        <Link to={{ search: '?onglet=projection' }} className="link">
          Projection 15 ans
        </Link>
        .
      </p>
    </div>
  )
}
