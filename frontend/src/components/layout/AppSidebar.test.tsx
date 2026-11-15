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

function renderSidebar(open = true) {
  return renderWithProviders(
    <Routes>
      <Route
        path="/"
        element={
          <SidebarProvider defaultOpen={open}>
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

  it('deployed: the animations switch and the theme button are in the footer', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar()

    expect(await screen.findByRole('switch', { name: 'Animations' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Passer au thème/ })).toBeInTheDocument()
  })

  it('rail: the footer keeps the profile button only, and its menu holds the display settings', async () => {
    mockFetch([json(PERSONAS)])
    renderSidebar(false)

    const profile = await screen.findByRole('button', { name: 'Profil actif : Robert' })
    expect(screen.queryByRole('switch', { name: 'Animations' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Passer au thème/ })).not.toBeInTheDocument()

    await userEvent.click(profile)
    const animations = await screen.findByRole('menuitemcheckbox', { name: 'Animations' })
    expect(animations).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(animations)
    expect(document.documentElement.dataset.motion).toBe('reduced')

    await userEvent.click(screen.getByRole('button', { name: 'Profil actif : Robert' }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Thème sombre' }))
    expect(document.documentElement).toHaveClass('dark')

    // Left as found for the other tests.
    await userEvent.click(screen.getByRole('button', { name: 'Profil actif : Robert' }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Thème sombre' }))
    await userEvent.click(screen.getByRole('button', { name: 'Profil actif : Robert' }))
    await userEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Animations' }))
    expect(document.documentElement).not.toHaveClass('dark')
    expect(document.documentElement.dataset.motion).toBeUndefined()
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
