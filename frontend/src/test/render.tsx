import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { ActivePersonaProvider } from '@/features/personas/ActivePersonaProvider'
import { storePersonaId } from '@/features/personas/activePersona'

/**
 * Renders `ui` inside the app's providers. `personaId` is stored as the
 * active profile before the first render, as a previous visit would have.
 */
export function renderWithProviders(
  ui: ReactElement,
  opts: { route?: string; queryClient?: QueryClient; personaId?: string } = {},
) {
  const queryClient =
    opts.queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (opts.personaId !== undefined) storePersonaId(opts.personaId)
  const result = render(
    <QueryClientProvider client={queryClient}>
      <ActivePersonaProvider>
        <MemoryRouter initialEntries={[opts.route ?? '/']}>
          {ui}
          <Toaster />
        </MemoryRouter>
      </ActivePersonaProvider>
    </QueryClientProvider>,
  )
  return { ...result, queryClient }
}
