import { useQuery } from '@tanstack/react-query'
import { apiClient, type ApiError } from './client'

/** An investor profile, as `GET /api/personas` returns it. */
export interface Persona {
  id: string
  name: string
  age: number
  risk_tolerance: string
  horizon: string
  preferences: string[]
  summary: string
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
