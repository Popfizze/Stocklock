import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetch } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { SidebarProvider } from '@/components/ui/sidebar'
import { readStoredPersonaId } from '@/features/personas/activePersona'
import { AppSidebar } from './AppSidebar'

const ORIGINAL_FETCH = globalThis.fetch

function renderSidebar() {
  return renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        }
      />
      <Route path="/choisir-profil" element={<p>Sélecteur</p>} />
    </Routes>,
    { personaId: 'robert' },
  )
}

describe('AppSidebar', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('shows the active profile name', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByText('Robert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Profil actif : Robert' })).toBeInTheDocument()
  })

  it('links to the Labo', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Labo' })).toHaveAttribute('href', '/labo')
  })

  it('links to the Comptes tab', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Comptes' })).toHaveAttribute('href', '/comptes')
  })

  it('"Changer de profil" forgets the profile and opens the picker', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    await userEvent.click(await screen.findByRole('button', { name: 'Changer de profil' }))

    expect(await screen.findByText('Sélecteur')).toBeInTheDocument()
    expect(readStoredPersonaId()).toBeNull()
  })
})
