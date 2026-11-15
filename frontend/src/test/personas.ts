import type { Persona } from '@/api/personas'

/** Test fixtures shaped like `GET /api/personas`; the values are placeholders. */
export const PERSONAS: Persona[] = [
  {
    id: 'amira',
    name: 'Amira',
    age: 29,
    risk_tolerance: 'Élevée',
    horizon: 'Long terme',
    preferences: ['Premier logement'],
    summary: 'Résumé du profil Amira.',
    limits: { max_volatility: 0.8, max_single_position: 0.25, allow_crypto: true, excluded_sectors: [] },
  },
  {
    id: 'mateo',
    name: 'Mateo',
    age: 41,
    risk_tolerance: 'Modérée',
    horizon: 'Moyen terme',
    preferences: [],
    summary: 'Résumé du profil Mateo.',
  },
  {
    id: 'robert',
    name: 'Robert',
    age: 63,
    risk_tolerance: 'Faible',
    horizon: 'Court terme',
    preferences: ['Revenu stable', 'Faible volatilité'],
    summary: 'Résumé du profil Robert.',
    limits: { max_volatility: 0.25, max_single_position: 0.1, allow_crypto: false, excluded_sectors: [] },
  },
]
