import { useMemo, useState, type ReactNode } from 'react'
import { ActivePersonaContext, readStoredPersonaId, storePersonaId } from './activePersona'

interface ActivePersonaProviderProps {
  children: ReactNode
}

export function ActivePersonaProvider({ children }: ActivePersonaProviderProps) {
  const [personaId, setPersonaId] = useState<string | null>(readStoredPersonaId)

  const value = useMemo(
    () => ({
      personaId,
      choosePersona: (id: string) => {
        storePersonaId(id)
        setPersonaId(id)
      },
      forgetPersona: () => {
        storePersonaId(null)
        setPersonaId(null)
      },
    }),
    [personaId],
  )

  return <ActivePersonaContext.Provider value={value}>{children}</ActivePersonaContext.Provider>
}
