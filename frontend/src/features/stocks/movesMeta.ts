/** Labels and formatting of the « Pourquoi le titre a bougé ? » section (step 2). */

import type { MoveExplanation, MovesPeriod } from '@/api/moves'
import { formatSignedPercent } from './format'

/** +12,34 % from a ratio (0.1234). */
export const signedRatio = (ratio: number) => formatSignedPercent(ratio * 100)

export const PERIODS: Array<{ value: MovesPeriod; label: string; name: string }> = [
  { value: '3m', label: '3M', name: 'les 3 derniers mois' },
  { value: '6m', label: '6M', name: 'les 6 derniers mois' },
  { value: '1y', label: '1A', name: 'la dernière année' },
  { value: '2022', label: '2022', name: 'l’année 2022' },
]

export const EXPLANATIONS: Record<
  MoveExplanation,
  { label: string; variant: 'success' | 'warning' | 'outline'; help: string }
> = {
  fait: {
    label: 'Fait daté',
    variant: 'success',
    help: 'Un événement officiel (dépôt de l’entreprise, dividende, décision de taux) précède le mouvement et le lien est jugé plausible.',
  },
  hypothese: {
    label: 'Hypothèse',
    variant: 'warning',
    help: 'Un événement proche pourrait expliquer le mouvement, sans que le lien soit établi.',
  },
  aucun_evenement: {
    label: 'Aucun événement',
    variant: 'outline',
    help: 'Aucun événement daté des jours précédents n’explique ce mouvement.',
  },
}

/** Event kinds as the stock page names them. */
export const EVENT_KINDS: Record<string, string> = {
  'pic GDELT': 'Article (pic de couverture GDELT)',
  article: 'Article',
  dividend: 'Dividende',
  split: 'Fractionnement',
  'décision BdC': 'Décision de taux',
  'décision Fed': 'Décision de taux',
}

export const METHODS: Record<string, string> = {
  market_model: 'modèle de marché (bêta estimé sur l’année précédente)',
  simple_diff: 'différence simple avec l’indice',
}
