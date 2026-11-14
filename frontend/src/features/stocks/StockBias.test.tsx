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
      analysis: { answer: 'Analyse pour Robert\n\nVoici **un signal** [bedrock_classifier].\nSimulation éducative.', sources: [], assumptions: [], limits: [], governance: { passed: true, checks: [] } },
      signals: [{ category: 'panique', excerpt: 'tout vendre', method: 'lexique' }],
      profile_flags: [], history: null, hype: null, simulation: null, warnings: [],
    })] },
  ])
  renderWithProviders(<StockBias ticker="NVDA" />, { personaId: 'robert' })
  const input = await screen.findByLabelText('Pourquoi envisagez-vous cette décision ?')
  await userEvent.type(input, 'Je veux tout vendre')
  expect(screen.getByRole('button', { name: 'Analyser ma décision' })).toBeDisabled()
  await userEvent.click(screen.getByRole('radio', { name: 'Vendre' }))
  await userEvent.click(screen.getByRole('button', { name: 'Analyser ma décision' }))
  expect((await screen.findByText('Panique')).closest('li')).toHaveTextContent('tout vendre')
  expect(screen.getByText(/Historique insuffisant/)).toBeInTheDocument()
  expect(screen.getByText(/Simulation historique indisponible/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Lien avec le profil de Robert' })).toBeInTheDocument()
  expect(screen.getByText(/Préférences : Revenu stable/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Selon ton profil' })).toBeInTheDocument()
  expect(screen.getByText('un signal').tagName).toBe('STRONG')
  expect(screen.queryByText(/bedrock_classifier|Analyse pour Robert|\*\*/)).not.toBeInTheDocument()
  const request = calls.find((call) => call.url.includes('/api/bias/stock'))
  expect(JSON.parse(String(request?.init.body))).toEqual({ persona_id: 'robert', ticker: 'NVDA', message: 'Je veux tout vendre', intent: 'sell' })
  await userEvent.click(screen.getByRole('radio', { name: 'Acheter' }))
  expect(screen.queryByRole('heading', { name: 'Selon ton profil' })).not.toBeInTheDocument()
})

it('shows the operations included while the analysis is pending', async () => {
  let finish: ((response: Response) => void) | undefined
  globalThis.fetch = vi.fn((url: RequestInfo | URL) => {
    if (String(url).includes('/api/personas')) return Promise.resolve(new Response(JSON.stringify(PERSONAS)))
    return new Promise<Response>((resolve) => { finish = resolve })
  }) as typeof fetch
  renderWithProviders(<StockBias ticker="NVDA" />, { personaId: 'robert' })
  await userEvent.type(await screen.findByLabelText('Pourquoi envisagez-vous cette décision ?'), 'Je réfléchis')
  await userEvent.click(screen.getByRole('radio', { name: 'Je ne sais pas encore' }))
  await userEvent.click(screen.getByRole('button', { name: 'Analyser ma décision' }))
  expect(screen.getByRole('status')).toHaveTextContent('Analyse en cours')
  expect(screen.getByText(/recherche de contexte médiatique sur le web/)).toBeInTheDocument()
  finish?.(new Response(JSON.stringify({ detail: 'Test terminé' }), { status: 503 }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Test terminé')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
