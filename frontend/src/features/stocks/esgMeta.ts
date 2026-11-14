import type { EsgRiskCategory } from '@/api/persona'

/** Sustainalytics risk categories, lowest risk first, with the score band of each. */
export const ESG_CATEGORIES: Array<{ id: EsgRiskCategory; label: string; band: string }> = [
  { id: 'negligeable', label: 'Négligeable', band: 'moins de 10' },
  { id: 'faible', label: 'Faible', band: '10 à 20' },
  { id: 'moyen', label: 'Moyen', band: '20 à 30' },
  { id: 'eleve', label: 'Élevé', band: '30 à 40' },
  { id: 'grave', label: 'Grave', band: '40 et plus' },
]

export const ESG_CATEGORY_LABELS: Record<EsgRiskCategory, string> = {
  negligeable: 'Négligeable',
  faible: 'Faible',
  moyen: 'Moyen',
  eleve: 'Élevé',
  grave: 'Grave',
}

/** Highest controversy level of the scale (0 none … 5 severe). */
export const CONTROVERSY_MAX = 5
