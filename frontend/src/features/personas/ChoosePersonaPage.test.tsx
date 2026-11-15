import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetch, mockFetchUnreachable } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { API_BASE_URL } from '@/lib/env'
import { readStoredPersonaId } from './activePersona'
import { ChoosePersonaPage } from './ChoosePersonaPage'

const ORIGINAL_FETCH = globalThis.fetch

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/choisir-profil" element={<ChoosePersonaPage />} />
      <Route path="/" element={<p>Accueil</p>} />
    </Routes>,
    { route: '/choisir-profil' },
  )
}

describe('ChoosePersonaPage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('loads GET /api/personas and shows one card per profile', async () => {
    const calls = mockFetch([json(PERSONAS)])
    renderPage()

    expect(screen.getByRole('status')).toHaveTextContent('Chargement des profils…')
    for (const persona of PERSONAS) {
      expect(
        await screen.findByRole('button', { name: `Choisir le profil ${persona.name}` }),
      ).toBeInTheDocument()
    }
    expect(screen.getByText('Résumé du profil Robert.')).toBeInTheDocument()
    expect(screen.getByText('Faible volatilité')).toBeInTheDocument()
    expect(calls.map((call) => call.url)).toEqual([`${API_BASE_URL}/api/personas`])
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('chooses a profile with its arrow, remembers it and goes to the home page', async () => {
    mockFetch([json(PERSONAS)])
    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: 'Choisir le profil Mateo' }))

    expect(await screen.findByText('Accueil')).toBeInTheDocument()
    expect(readStoredPersonaId()).toBe('mateo')
  })

  it('chooses a profile when its illustration is clicked', async () => {
    mockFetch([json(PERSONAS)])
    renderPage()

    await userEvent.click(await screen.findByRole('img', { name: /Profil de Robert en tuiles/ }))

    expect(await screen.findByText('Accueil')).toBeInTheDocument()
    expect(readStoredPersonaId()).toBe('robert')
  })

  it('says the server cannot be reached when the API is down', async () => {
    mockFetchUnreachable()
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Impossible de joindre le serveur (${API_BASE_URL}). Vérifiez que le backend est démarré, puis rechargez la page.`,
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('names the HTTP status when the API answers with an error', async () => {
    mockFetch([json({ detail: 'boom' }, 500)])
    renderPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Le serveur n'a pas pu fournir les profils (erreur 500).",
    )
  })
})
