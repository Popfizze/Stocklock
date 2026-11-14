import type { StockSummary } from '@/api/stocks'

export interface StockGroup {
  id: string
  label: string
  stocks: StockSummary[]
}

/** The Tableau de bord's sections, in display order; every asset of the starter kit falls in one. */
const GROUPS: Array<{ id: string; label: string; matches: (stock: StockSummary) => boolean }> = [
  {
    id: 'canada',
    label: 'Actions canadiennes',
    matches: (stock) => stock.asset_class === 'equity' && stock.market === 'TSX',
  },
  {
    id: 'etats-unis',
    label: 'Actions américaines',
    matches: (stock) => stock.asset_class === 'equity' && stock.market !== 'TSX',
  },
  { id: 'fnb', label: 'FNB', matches: (stock) => stock.asset_class.startsWith('etf') },
  { id: 'crypto', label: 'Cryptomonnaies', matches: (stock) => stock.asset_class === 'crypto' },
]

/** Lower case without accents, so « societe » finds « Société ». */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

export function matchesQuery(stock: StockSummary, query: string): boolean {
  const needle = normalize(query)
  if (!needle) return true
  return normalize(stock.ticker).includes(needle) || normalize(stock.name).includes(needle)
}

/** The assets matching `query` (name or symbol), by section; empty sections are left out. */
export function groupStocks(stocks: StockSummary[], query: string): StockGroup[] {
  const matching = stocks.filter((stock) => matchesQuery(stock, query))
  return GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    stocks: matching.filter(group.matches),
  })).filter((group) => group.stocks.length > 0)
}
