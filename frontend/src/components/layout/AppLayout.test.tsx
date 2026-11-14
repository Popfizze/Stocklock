import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetch } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { AppLayout } from './AppLayout'
import { readSidebarOpen } from './sidebarState'

const ORIGINAL_FETCH = globalThis.fetch

function renderLayout() {
  mockFetch([json(PERSONAS)])
  return renderWithProviders(
    <AppLayout>
      <p>Contenu</p>
    </AppLayout>,
    { personaId: 'robert' },
  )
}

/** The desktop sidebar's wrapper, which carries its deployed / reduced state. */
const sidebarState = (container: HTMLElement) =>
  container.querySelector('[data-side="left"]')?.getAttribute('data-state')

describe('AppLayout', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('starts with the menu deployed and a button to reduce it', async () => {
    const { container } = renderLayout()

    const button = screen.getByRole('button', { name: 'Réduire le menu' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('aria-controls', 'menu-principal')
    expect(container.querySelector('#menu-principal')).toBeInTheDocument()
    expect(sidebarState(container)).toBe('expanded')
    expect(await screen.findByRole('link', { name: 'Tableau de bord' })).toBeInTheDocument()
    expect(screen.getByText('Contenu')).toBeInTheDocument()
  })

  it('reduces the menu to its icon rail, then deploys it again', async () => {
    const { container } = renderLayout()

    await userEvent.click(screen.getByRole('button', { name: 'Réduire le menu' }))
    const deploy = screen.getByRole('button', { name: 'Déployer le menu' })
    expect(deploy).toHaveAttribute('aria-expanded', 'false')
    expect(sidebarState(container)).toBe('collapsed')
    expect(readSidebarOpen()).toBe(false)
    // The destinations and the profile stay reachable from the rail.
    expect(await screen.findByRole('link', { name: 'Labo' })).toHaveAttribute('href', '/labo')
    expect(await screen.findByRole('button', { name: 'Profil actif : Robert' })).toBeInTheDocument()

    await userEvent.click(deploy)
    expect(screen.getByRole('button', { name: 'Réduire le menu' })).toHaveAttribute('aria-expanded', 'true')
    expect(sidebarState(container)).toBe('expanded')
    expect(readSidebarOpen()).toBe(true)
  })

  it('works from the keyboard', async () => {
    renderLayout()

    screen.getByRole('button', { name: 'Réduire le menu' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('button', { name: 'Déployer le menu' })).toHaveFocus()
  })

  it('remembers a reduced menu on the next page', () => {
    window.localStorage.setItem('stocklock.sidebarOpen', 'false')
    const { container } = renderLayout()

    expect(screen.getByRole('button', { name: 'Déployer le menu' })).toBeInTheDocument()
    expect(sidebarState(container)).toBe('collapsed')
  })

  it('stays deployed when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { container } = renderLayout()

    expect(sidebarState(container)).toBe('expanded')
  })
})
