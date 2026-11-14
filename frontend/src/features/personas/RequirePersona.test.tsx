import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetch } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { RequirePersona } from './RequirePersona'

const ORIGINAL_FETCH = globalThis.fetch

function renderGuarded(personaId?: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/choisir-profil" element={<p>Sélecteur</p>} />
      <Route
        path="/"
        element={
          <RequirePersona>
            <p>Contenu protégé</p>
          </RequirePersona>
        }
      />
    </Routes>,
    { personaId },
  )
}

describe('RequirePersona', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('sends the user to /choisir-profil when no profile is chosen', async () => {
    mockFetch([json(PERSONAS)])
    renderGuarded()

    expect(await screen.findByText('Sélecteur')).toBeInTheDocument()
    expect(screen.queryByText('Contenu protégé')).not.toBeInTheDocument()
  })

  it('renders the page once a profile is chosen', async () => {
    mockFetch([json(PERSONAS)])
    renderGuarded('amira')

    expect(await screen.findByText('Contenu protégé')).toBeInTheDocument()
  })

  it('treats a stored id the API does not know as no choice', async () => {
    mockFetch([json(PERSONAS)])
    renderGuarded('inconnu')

    expect(await screen.findByText('Sélecteur')).toBeInTheDocument()
  })
})
