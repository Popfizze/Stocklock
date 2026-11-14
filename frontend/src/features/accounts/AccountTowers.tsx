import type { AccountOutcome, SeriesPoint } from '@/api/accounts'
import { Tile3D, type SceneTile, type TileTone } from '@/components/three'
import { formatMoney } from './format'

/** Height of the tallest tower, in tile units. */
const MAX_HEIGHT = 6
const LAYERS = 5
/** Shade by rank: the winner is the ink tower. */
const RANK_TONES: TileTone[] = [1, 3, 5, 6]
const SPACING = 2.6
const MAX_FALLEN = 9

function towerTiles(accounts: AccountOutcome[], series: SeriesPoint[]): SceneTile[] {
  const ranked = accounts.filter((account) => account.eligible).sort((a, b) => b.after_tax - a.after_tax)
  const top = Math.max(...ranked.map((account) => account.after_tax), 1)
  const unit = top / MAX_HEIGHT
  const tiles: SceneTile[] = []

  ranked.forEach((account, rank) => {
    const x = rank * SPACING
    const tax = account.tax_at_exit + account.annual_tax_paid + account.withholding_lost
    const label = `${account.account} · ${formatMoney(account.after_tax)} après impôt · impôt retiré ${formatMoney(tax)}`
    // The tower grows layer by layer: each layer is what the years of that slice added, after tax.
    let base = 0
    for (let layer = 1; layer <= LAYERS; layer++) {
      const point = series[Math.min(series.length - 1, Math.round((layer / LAYERS) * (series.length - 1)))]
      const value = layer === LAYERS ? account.after_tax : (point?.[account.account] ?? account.after_tax * (layer / LAYERS))
      const height = Math.max(0.05, value / unit - base)
      tiles.push({ x, z: 0, y: base, h: height, tone: RANK_TONES[rank] ?? 6, label })
      base += height
    }
    // The tax taken out lies at the foot of the tower, as tiles that fell off it.
    const fallen = Math.min(MAX_FALLEN, Math.round((tax / unit) * 3))
    for (let index = 0; index < fallen; index++) {
      tiles.push({
        x: x - 0.35 + (index % 3) * 0.36,
        z: 1.15 + Math.floor(index / 3) * 0.36,
        w: 0.33,
        d: 0.33,
        h: 0.33,
        tone: 'down',
        label,
      })
    }
  })
  return tiles
}

interface AccountTowersProps {
  accounts: AccountOutcome[]
  series: SeriesPoint[]
  years: number
}

// 3D — why one account wins: each account is a tower that grows over the projection (after tax), and the
// tax it gave up lies at its foot as fallen tiles; the tallest tower with the fewest fallen tiles wins.
export function AccountTowers({ accounts, series, years }: AccountTowersProps) {
  const ranked = accounts.filter((account) => account.eligible).sort((a, b) => b.after_tax - a.after_tax)
  if (ranked.length === 0) return null
  const reading = ranked
    .map((account) => `${account.account} ${formatMoney(account.after_tax)}`)
    .join(', ')

  return (
    <div className="space-y-2">
      <p className="eyebrow">Les comptes en tours · {years} ans, après impôt</p>
      <Tile3D
        tiles={towerTiles(accounts, series)}
        view="front"
        label={`Les comptes en tours après ${years} ans, du plus haut au plus bas : ${reading}. Les tuiles tombées au pied de chaque tour représentent l'impôt retiré ; les montants sont dans le tableau détaillé.`}
        className="h-64"
      />
      <p className="text-xs text-muted-foreground">
        Chaque tour monte avec les années ; les petites tuiles rouges à son pied sont l'impôt retiré
        (à la sortie ou en cours de route). De gauche à droite : {ranked.map((account) => account.account).join(', ')}.
      </p>
    </div>
  )
}
