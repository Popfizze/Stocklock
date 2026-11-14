/** Labels and formatting of the « Pourquoi le titre a bougé ? » section (step 2). */

import type { EventCategory, MoveExplanation, MovesPeriod } from '@/api/moves'
import { formatSignedPercent } from './format'

/** +12,34 % from a ratio (0.1234). */
export const signedRatio = (ratio: number) => formatSignedPercent(ratio * 100)

export const PERIODS: Array<{ value: MovesPeriod; label: string; name: string }> = [
  { value: '3m', label: '3M', name: 'les 3 derniers mois' },
  { value: '6m', label: '6M', name: 'les 6 derniers mois' },
  { value: '1y', label: '1A', name: 'la dernière année' },
  { value: '2025', label: '2025', name: 'l’année 2025' },
  { value: '2024', label: '2024', name: 'l’année 2024' },
  { value: '2023', label: '2023', name: 'l’année 2023' },
  { value: '2022', label: '2022', name: 'l’année 2022' },
]

export const CATEGORIES: Record<EventCategory, string> = {
  entreprise: 'Entreprise',
  direction: 'Direction',
  économique: 'Économie',
  politique: 'Politique',
  marché: 'Marché',
  autre: 'Autre',
}

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
  'décision politique US': 'Présidence américaine',
  'pic politique GDELT': 'Tarifs et sanctions (pic de couverture GDELT)',
}

export const METHODS: Record<string, string> = {
  market_model: 'modèle de marché (bêta estimé sur l’année précédente)',
  simple_diff: 'différence simple avec l’indice',
}
