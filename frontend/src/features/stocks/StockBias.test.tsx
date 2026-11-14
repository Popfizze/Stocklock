import { afterEach, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { renderWithProviders } from '@/test/render'
import { StockBias } from './StockBias'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks() })

it('sends the selected title, active profile and message and shows a limited result', async () => {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/bias/stock', responses: [json({
      analysis: { answer: 'Simulation éducative.', sources: [], assumptions: [], limits: [], governance: { passed: true, checks: [] } },
      signals: [{ category: 'panique', excerpt: 'tout vendre', method: 'lexique' }],
      profile_flags: [], history: null, hype: null, simulation: null, warnings: [],
    })] },
  ])
  renderWithProviders(<StockBias ticker="NVDA" />, { personaId: 'robert' })
  const input = await screen.findByLabelText('Que souhaitez-vous faire, et pourquoi ?')
  await userEvent.type(input, 'Je veux tout vendre')
  await userEvent.click(screen.getByRole('button', { name: 'Analyser ma décision' }))
  expect((await screen.findByText('Panique')).closest('li')).toHaveTextContent('tout vendre')
  expect(screen.getByText(/Historique insuffisant/)).toBeInTheDocument()
  expect(screen.getByText(/Simulation historique indisponible/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Lien avec le profil de Robert' })).toBeInTheDocument()
  expect(screen.getByText(/Préférences : Revenu stable/)).toBeInTheDocument()
  const request = calls.find((call) => call.url.includes('/api/bias/stock'))
  expect(JSON.parse(String(request?.init.body))).toEqual({ persona_id: 'robert', ticker: 'NVDA', message: 'Je veux tout vendre' })
})
