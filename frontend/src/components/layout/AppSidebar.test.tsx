import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
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

  it('links to the Labo, last in the nav', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Labo' })).toHaveAttribute('href', '/labo')
    const nav = within(screen.getByRole('navigation', { name: 'Navigation principale' }))
    const links = nav.getAllByRole('link')
    expect(links[links.length - 1]).toHaveTextContent('Labo')
  })

  it('links to « Mon portefeuille »', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Mon portefeuille' })).toHaveAttribute('href', '/portefeuille')
  })

  it('links to the Comptes tab', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Comptes' })).toHaveAttribute('href', '/comptes')
  })

  it('marks the current page', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByRole('link', { name: 'Tableau de bord' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Labo' })).not.toHaveAttribute('aria-current')
  })

  it('switches straight to another profile from the menu', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    await userEvent.click(await screen.findByRole('button', { name: 'Profil actif : Robert' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /Amira/ }))

    expect(await screen.findByRole('button', { name: 'Profil actif : Amira' })).toBeInTheDocument()
    expect(readStoredPersonaId()).toBe('amira')
  })

  it('"Changer de profil" forgets the profile and opens the picker', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    await userEvent.click(await screen.findByRole('button', { name: 'Profil actif : Robert' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Changer de profil' }))

    expect(await screen.findByText('Sélecteur')).toBeInTheDocument()
    expect(readStoredPersonaId()).toBeNull()
  })
})
