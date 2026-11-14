import { useNavigate } from 'react-router-dom'
import type { ApiError } from '@/api/client'
import { usePersonas } from '@/api/personas'
import { API_BASE_URL } from '@/lib/env'
import { useActivePersona } from './activePersona'
import { PersonaCard } from './PersonaCard'

function loadErrorMessage(error: ApiError): string {
  if (error.status === 0) {
    return `Impossible de joindre le serveur (${API_BASE_URL}). Vérifiez que le backend est démarré, puis rechargez la page.`
  }
  return `Le serveur n'a pas pu fournir les profils (erreur ${error.status}). Rechargez la page pour réessayer.`
}

export function ChoosePersonaPage() {
  const { data: personas, error, isPending } = usePersonas()
  const { choosePersona } = useActivePersona()
  const navigate = useNavigate()

  const handleChoose = (id: string) => {
    choosePersona(id)
    navigate('/', { replace: true })
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="space-y-6">
          <p className="text-lg font-semibold tracking-tight">StockLock</p>
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold tracking-tight">Choisir un profil</h1>
            <p className="max-w-2xl text-muted-foreground">
              Aucune connexion : les analyses s'adaptent au profil d'investisseur choisi. Vous
              pourrez en changer à tout moment.
            </p>
          </div>
        </header>

        {isPending && (
          <p role="status" className="text-muted-foreground">
            Chargement des profils…
          </p>
        )}

        {error && (
          <p role="alert" className="text-destructive">
            {loadErrorMessage(error)}
          </p>
        )}

        {personas && (
          <ul className="grid gap-4 md:grid-cols-3">
            {personas.map((persona) => (
              <li key={persona.id}>
                <PersonaCard persona={persona} onChoose={() => handleChoose(persona.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
