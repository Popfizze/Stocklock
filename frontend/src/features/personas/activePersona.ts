/**
 * The active investor profile — the one the user picked instead of logging in.
 *
 * Only its id is kept, in localStorage, so the choice survives a reload. The
 * profile itself comes from `GET /api/personas` (see `usePersonas`).
 */

import { createContext, useContext } from 'react'
import { usePersonas, type Persona } from '@/api/personas'

const STORAGE_KEY = 'stocklock.activePersonaId'

/** The stored profile id, or `null` when none is stored or storage is unavailable. */
export function readStoredPersonaId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Stores `id`, or clears it when `null`. Never throws. */
export function storePersonaId(id: string | null): void {
  try {
    if (id === null) {
      window.localStorage.removeItem(STORAGE_KEY)
    } else {
      window.localStorage.setItem(STORAGE_KEY, id)
    }
  } catch {
    // Storage blocked (private window, site data disabled): the choice then
    // lasts until the tab is reloaded, which is all we can do.
  }
}

export interface ActivePersonaState {
  personaId: string | null
  choosePersona: (id: string) => void
  forgetPersona: () => void
}

export const ActivePersonaContext = createContext<ActivePersonaState | null>(null)

/**
 * The active profile id, the profile itself once `GET /api/personas` has
 * answered (`undefined` before, or when the id is unknown to the API), and
 * the two ways to change it.
 */
export function useActivePersona(): ActivePersonaState & { persona: Persona | undefined } {
  const state = useContext(ActivePersonaContext)
  if (!state) {
    throw new Error('useActivePersona must be used inside <ActivePersonaProvider>')
  }
  const { data: personas } = usePersonas()
  const persona = personas?.find((candidate) => candidate.id === state.personaId)
  return { ...state, persona }
}
