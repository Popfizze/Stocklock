import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { LabPage } from './features/lab/LabPage'
import { ActivePersonaProvider } from './features/personas/ActivePersonaProvider'
import { ChoosePersonaPage } from './features/personas/ChoosePersonaPage'
import { RequirePersona } from './features/personas/RequirePersona'
import { Toaster } from './components/ui/sonner'

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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </BrowserRouter>
      </ActivePersonaProvider>
    </QueryClientProvider>
  )
}

export default App
