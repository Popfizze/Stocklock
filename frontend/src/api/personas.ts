import { useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

/** A profile's limits (seed `constraints`). Ratios: 0.25 = 25 %. */
export interface PersonaLimits {
  /** Highest annualized volatility of a title for this profile. */
  max_volatility: number
  /** Largest weight of a single position in the portfolio. */
  max_single_position: number
  allow_crypto: boolean
  /** GICS sector names, e.g. `Energy`. */
  excluded_sectors: string[]
}

/** An investor profile, as `GET /api/personas` returns it. */
export interface Persona {
  id: string
  name: string
  age: number
  risk_tolerance: string
  horizon: string
  preferences: string[]
  summary: string
  /** Optional: absent from an older API. */
  limits?: PersonaLimits
}

export const PERSONA_QUERY_KEYS = {
  all: ['personas'] as const,
  list: () => [...PERSONA_QUERY_KEYS.all, 'list'] as const,
}

/** The investor profiles to pick from. They are fixed server-side, so fetched once. */
export function usePersonas() {
  return useQuery<Persona[], ApiError>({
    queryKey: PERSONA_QUERY_KEYS.list(),
    queryFn: () => apiClient.request<Persona[]>('/api/personas'),
    staleTime: Infinity,
  })
}
