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
  },
]
