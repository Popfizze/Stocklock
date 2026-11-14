import type { AssetProfile } from '@/api/accounts'
import { ASSET_CLASS_LABELS } from './accountMeta'
import { formatPercent } from './format'

interface AssetSnapshotProps {
  asset: AssetProfile
}

/** What the asset pays and how it behaved: the facts that decide the account. */
export function AssetSnapshot({ asset }: AssetSnapshotProps) {
  const facts = [
    { label: 'Type de revenu', value: asset.income_label },
    {
      label: 'Dividendes (12 derniers mois)',
      value: asset.dividend_yield > 0 ? formatPercent(asset.dividend_yield, 2) : 'Aucun',
    },
    {
      label: 'Retenue américaine sur dividendes',
      value: asset.us_withholding ? 'Oui, 15 % (sauf REER)' : 'Non',
    },
    {
      label: 'Rendement historique annualisé',
      value: asset.hist_return === null ? '—' : `${formatPercent(asset.hist_return)} (${asset.hist_period}, en $ CA)`,
    },
    {
      label: 'Volatilité historique',
      value: asset.hist_volatility === null ? '—' : formatPercent(asset.hist_volatility, 0),
    },
    {
      label: 'Rendement supposé pour la projection',
      value: `${formatPercent(asset.expected_return)} : ${asset.expected_return_basis}`,
    },
  ]

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {ASSET_CLASS_LABELS[asset.asset_class] ?? asset.asset_class} · {asset.sector} · {asset.market} ·{' '}
        {asset.currency}
      </p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="rounded-lg bg-muted p-3">
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="text-sm font-semibold">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        Le rendement historique n'est pas une prévision : la projection utilise une hypothèse à long
        terme publique.
      </p>
    </div>
  )
}
