import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { LabPage } from './features/lab/LabPage'
import { ActivePersonaProvider } from './features/personas/ActivePersonaProvider'
import { ChoosePersonaPage } from './features/personas/ChoosePersonaPage'
import { RequirePersona } from './features/personas/RequirePersona'
import { Toaster } from './components/ui/sonner'
import { AppLayout } from './components/layout'

// Lazy: the Comptes tab brings the charting library, loaded only when opened.
const AccountsPage = lazy(() =>
  import('./features/accounts/AccountsPage').then((module) => ({ default: module.AccountsPage })),
)
// Lazy for the same reason: a stock's page draws its price chart with it.
const StockPage = lazy(() =>
  import('./features/stocks/StockPage').then((module) => ({ default: module.StockPage })),
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ActivePersonaProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/choisir-profil" element={<ChoosePersonaPage />} />
            <Route
              path="/"
              element={
                <RequirePersona>
                  <DashboardPage />
                </RequirePersona>
              }
            />
            <Route
              path="/labo"
              element={
                <RequirePersona>
                  <LabPage />
                </RequirePersona>
              }
            />
            <Route
              path="/comptes"
              element={
                <RequirePersona>
                  <Suspense
                    fallback={
                      <AppLayout>
                        <p role="status" className="text-muted-foreground">
                          Chargement de l'onglet Comptes…
                        </p>
                      </AppLayout>
                    }
                  >
                    <AccountsPage />
                  </Suspense>
                </RequirePersona>
              }
            />
            <Route
              path="/titres/:ticker"
              element={
                <RequirePersona>
                  <Suspense
                    fallback={
                      <AppLayout>
                        <p role="status" className="text-muted-foreground">
                          Chargement du titre…
                        </p>
                      </AppLayout>
                    }
                  >
                    <StockPage />
                  </Suspense>
                </RequirePersona>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </ActivePersonaProvider>
    </QueryClientProvider>
  )
}

export default App
