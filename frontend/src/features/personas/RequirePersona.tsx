import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { usePersonas } from '@/api/personas'
import { useActivePersona } from './activePersona'

interface RequirePersonaProps {
  children: ReactNode
}

/**
 * Renders its children only once a profile is chosen; otherwise sends the
 * user to the profile picker. A stored id the API no longer knows counts as
 * no choice.
 */
export function RequirePersona({ children }: RequirePersonaProps) {
  const { personaId, persona } = useActivePersona()
  const { data: personas } = usePersonas()

  if (personaId === null || (personas !== undefined && persona === undefined)) {
    return <Navigate to="/choisir-profil" replace />
  }

  return <>{children}</>
}
