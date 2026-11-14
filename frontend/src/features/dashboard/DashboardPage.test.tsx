import { afterEach, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/render'
import { json, mockFetch } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { DashboardPage } from './DashboardPage'

const ORIGINAL_FETCH = globalThis.fetch

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

it('names the active profile', async () => {
  mockFetch([json(PERSONAS)])
  renderWithProviders(<DashboardPage />, { personaId: 'amira' })

  const name = await screen.findByText('Amira', { selector: 'strong' })
  expect(name.parentElement).toHaveTextContent('Profil actif : Amira')
})
