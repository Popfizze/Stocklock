import type { AccountId } from '@/api/accounts'

export interface AccountMeta {
  id: AccountId
  /** Short name, as the API keys it. */
  short: string
  /** Full French name. */
  name: string
  /** Chart color (a theme token, so it follows light and dark mode). */
  color: string
  /** Swatch class — literal so Tailwind sees it. */
  swatch: string
  /** Recharts dataKey-safe id. */
  key: string
}

/** French names of the starter kit's asset classes. */
export const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: 'Actions',
  etf_equity: "FNB d'actions",
  etf_bond: "FNB d'obligations",
  etf_commodity: 'FNB de matière première',
  crypto: 'Cryptoactifs',
}

/** « le CELI », « le compte non enregistré » : the account inside a French sentence. */
export function withArticle(account: AccountId): string {
  return account === 'Non enregistré' ? 'le compte non enregistré' : `le ${account}`
}

/** Fixed order and colors: a color follows its account, never its rank. */
export const ACCOUNTS: Record<AccountId, AccountMeta> = {
  CELI: {
    id: 'CELI',
    short: 'CELI',
    name: "Compte d'épargne libre d'impôt",
    color: 'var(--account-celi)',
    swatch: 'bg-account-celi',
    key: 'celi',
  },
  REER: {
    id: 'REER',
    short: 'REER',
    name: "Régime enregistré d'épargne-retraite",
    color: 'var(--account-reer)',
    swatch: 'bg-account-reer',
    key: 'reer',
  },
  CELIAPP: {
    id: 'CELIAPP',
    short: 'CELIAPP',
    name: "Compte d'épargne libre d'impôt pour l'achat d'une première propriété",
    color: 'var(--account-celiapp)',
    swatch: 'bg-account-celiapp',
    key: 'celiapp',
  },
  'Non enregistré': {
    id: 'Non enregistré',
    short: 'Non enregistré',
    name: 'Compte de placement ordinaire, sans abri fiscal',
    color: 'var(--account-taxable)',
    swatch: 'bg-account-taxable',
    key: 'taxable',
  },
}
