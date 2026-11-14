import { useId } from 'react'
import { Link } from 'react-router-dom'
import { useAssets, type AssetSummary } from '@/api/accounts'
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

interface AssetPickerProps {
  ticker: string
  onTickerChange: (ticker: string) => void
}

/** One of the starter kit's assets, grouped by class, with a link to its page. */
export function AssetPicker({ ticker, onTickerChange }: AssetPickerProps) {
  const id = useId()
  const { data: assets, error } = useAssets()
  const groups = groupByClass(assets ?? [])

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-ticker`}>Titre</Label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Select value={ticker} onValueChange={onTickerChange}>
          <SelectTrigger id={`${id}-ticker`} className="w-full sm:w-80">
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
        <Link to={`/titres/${encodeURIComponent(ticker)}`} className="link text-sm">
          Fiche de {ticker}
        </Link>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {projectionErrorMessage(error)}
        </p>
      )}
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
