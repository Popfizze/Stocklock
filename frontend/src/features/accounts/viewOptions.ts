/**
 * The Comptes tab's viewing options, kept in the URL so any view can be linked:
 * `?vue=comparer&niveau=complexe&comptes=CELI,REER`.
 *
 * - the lens (`vue`) is a way of looking at the same four accounts;
 * - the level (`niveau`) adds detail: Simple has no figures, Complexe has them all;
 * - the account filter (`comptes`) hides the accounts left out.
 */

import { ChartLine, Columns3, Target, Workflow, type LucideIcon } from 'lucide-react'
import { ACCOUNT_IDS, type AccountId } from '@/api/accounts'

export type Lens = 'parcours' | 'comparer' | 'objectifs' | 'chiffres'

export const LENSES: Array<{ value: Lens; label: string; icon: LucideIcon }> = [
  { value: 'parcours', label: 'Le parcours', icon: Workflow },
  { value: 'comparer', label: 'Côte à côte', icon: Columns3 },
  { value: 'objectifs', label: 'Par objectif', icon: Target },
  { value: 'chiffres', label: 'En chiffres', icon: ChartLine },
]

export type Level = 'simple' | 'normale' | 'complexe'

export const LEVELS: Array<{ value: Level; label: string }> = [
  { value: 'simple', label: 'Simple' },
  { value: 'normale', label: 'Normale' },
  { value: 'complexe', label: 'Complexe' },
]

const LEVEL_ORDER: Record<Level, number> = { simple: 0, normale: 1, complexe: 2 }

/** True when `level` shows at least what `min` shows. */
export function atLeast(level: Level, min: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[min]
}

export function parseLens(value: string | null): Lens {
  return LENSES.find((lens) => lens.value === value)?.value ?? 'parcours'
}

export function parseLevel(value: string | null): Level {
  return LEVELS.find((level) => level.value === value)?.value ?? 'simple'
}

/** The accounts shown, in their fixed order; all four when the list is absent or empty. */
export function parseAccounts(value: string | null): AccountId[] {
  const picked = new Set((value ?? '').split(','))
  const accounts = ACCOUNT_IDS.filter((account) => picked.has(account))
  return accounts.length > 0 ? accounts : ACCOUNT_IDS
}

/** The stock first shown when « Un titre précis » is picked. */
export const DEFAULT_TICKER = 'JNJ'

/** The `comptes` URL value; null when all four are shown (the default). */
export function formatAccounts(accounts: AccountId[]): string | null {
  return accounts.length === ACCOUNT_IDS.length ? null : accounts.join(',')
}
