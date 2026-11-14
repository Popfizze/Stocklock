import { useId } from 'react'
import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAssets, type AssetSummary } from '@/api/accounts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ASSET_CLASS_LABELS } from './accountMeta'
import { projectionErrorMessage } from './format'
import { StockAccountOptions } from './StockAccountOptions'

interface StockAccountsTabProps {
  ticker: string
  onTickerChange: (ticker: string) => void
}

/** Pick a stock and see its account section, as the stock page will show it. */
export function StockAccountsTab({ ticker, onTickerChange }: StockAccountsTabProps) {
  const id = useId()
  const { data: assets, error } = useAssets()
  const groups = groupByClass(assets ?? [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Essayer avec un titre</CardTitle>
          <CardDescription className="flex gap-2">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Cette section s'affiche aussi dans la fiche de chaque titre du tableau de bord.{' '}
              <Link to={`/titres/${encodeURIComponent(ticker)}`} className="text-primary hover:underline">
                Ouvrir la fiche de {ticker}
              </Link>
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor={`${id}-ticker`}>Titre</Label>
          <Select value={ticker} onValueChange={onTickerChange}>
            <SelectTrigger id={`${id}-ticker`} className="w-full sm:w-96">
              <SelectValue placeholder="Choisir un titre" />
            </SelectTrigger>
            <SelectContent>
              {groups.map(([assetClass, items]) => (
                <SelectGroup key={assetClass}>
                  <SelectLabel>{ASSET_CLASS_LABELS[assetClass] ?? assetClass}</SelectLabel>
                  {items.map((asset) => (
                    <SelectItem key={asset.ticker} value={asset.ticker}>
                      {asset.ticker} — {asset.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {projectionErrorMessage(error)}
            </p>
          )}
        </CardContent>
      </Card>

      <StockAccountOptions ticker={ticker} />
    </div>
  )
}

function groupByClass(assets: AssetSummary[]): Array<[string, AssetSummary[]]> {
  const groups = new Map<string, AssetSummary[]>()
  for (const asset of assets) {
    groups.set(asset.asset_class, [...(groups.get(asset.asset_class) ?? []), asset])
  }
  return [...groups.entries()]
}
