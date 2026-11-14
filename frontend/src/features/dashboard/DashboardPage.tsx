import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppLayout } from '@/components/layout'
import { useActivePersona } from '@/features/personas/activePersona'

export function DashboardPage() {
  const { persona } = useActivePersona()

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="text-muted-foreground">Bienvenue dans votre application</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bienvenue dans votre tableau de bord</CardTitle>
            <CardDescription>
              Ceci est votre page d'accueil vide. Commencez à construire votre application ici.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Profil actif : <strong>{persona?.name}</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
