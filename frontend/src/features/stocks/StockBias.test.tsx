import { afterEach, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import { HYPE_AAPL_LOW, HYPE_PLTR_HIGH } from '@/test/persona'
import { PERSONAS } from '@/test/personas'
import { renderWithProviders } from '@/test/render'
import { StockBias } from './StockBias'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks() })

it('sends the selected title, active profile and message and shows a limited result', async () => {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/bias/stock', responses: [json({
      analysis: {
        answer: 'Analyse pour Robert\n\nVoici **un signal** [bedrock_classifier].\nSimulation éducative.',
        sources: [{ id: 'yfinance_history', title: 'Yahoo Finance — cours historiques NVDA', url: 'https://finance.yahoo.com/', as_of: '2026-11-12' }],
        assumptions: [], limits: [], governance: { passed: true, checks: [] },
      },
      signals: [{ category: 'panique', excerpt: 'tout vendre', method: 'lexique' }],
      profile_flags: [], history: null, hype: null,
      media: { source: 'yahoo', message: 'Yahoo Finance : 10 manchettes récentes reçues (source de repli).' },
      simulation: null, warnings: [],
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
  expect(screen.getByText(/Yahoo Finance : 10 manchettes récentes/)).toBeInTheDocument()
  expect(screen.getByText(/Simulation historique indisponible/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Lien avec le profil de Robert' })).toBeInTheDocument()
  expect(screen.getByText(/Préférences : Revenu stable/)).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Selon ton profil' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Voir la source des données : Contexte du titre' }))
  expect(await screen.findByText('Yahoo Finance — cours historiques NVDA')).toBeInTheDocument()
  expect(screen.getByText('un signal').tagName).toBe('STRONG')
  expect(screen.queryByText(/bedrock_classifier|Analyse pour Robert|\*\*/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Cette analyse vous a-t-elle aidé à prendre du recul/)).not.toBeInTheDocument()
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
  expect(screen.getByRole('status')).toHaveTextContent('Préparation de l’analyse')
  expect(screen.getByText(/Connexion au pipeline/)).toBeInTheDocument()
  finish?.(new Response(JSON.stringify({ detail: 'Test terminé' }), { status: 503 }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Test terminé')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('shows the real pipeline stage and a check once each stage is completed', async () => {
  const result = {
    analysis: { answer: 'Simulation éducative.', sources: [], assumptions: [], limits: [], governance: { passed: true, checks: [] } },
    signals: [], profile_flags: [], history: null, hype: null, simulation: null, warnings: [],
  }
  const stages = [
    { id: 'message_analysis', name: 'Analyse du message', status: 'done' },
    { id: 'hype_signal', name: 'Signal de tendance', status: 'active' },
    { id: 'profile_check', name: 'Confrontation au profil', status: 'pending' },
  ] as const
  mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: /\/api\/bias\/stock\/runs$/, responses: [json({ run_id: 'bias-1', status: 'running', stages })] },
    {
      match: /\/api\/bias\/stock\/runs\/bias-1$/,
      responses: [json({
        run_id: 'bias-1', status: 'completed',
        stages: stages.map((stage) => ({ ...stage, status: 'done' })), result,
      })],
    },
  ])
  renderWithProviders(<StockBias ticker="NVDA" />, { personaId: 'robert' })
  await userEvent.type(await screen.findByLabelText('Pourquoi envisagez-vous cette décision ?'), 'Je réfléchis')
  await userEvent.click(screen.getByRole('radio', { name: 'Acheter' }))
  await userEvent.click(screen.getByRole('button', { name: 'Analyser ma décision' }))

  expect(await screen.findByText('En cours : Signal de tendance')).toBeInTheDocument()
  expect(screen.getByLabelText('Terminée')).toBeInTheDocument()
  expect(screen.getByLabelText('En cours')).toBeInTheDocument()
  expect(await screen.findByText('Analyse terminée')).toBeInTheDocument()
  expect(screen.getAllByLabelText('Terminée')).toHaveLength(3)
})

it('proposes the tempted buyer’s case while the hype is high, and lets the user write their own', async () => {
  mockFetchByUrl([{ match: '/api/personas', responses: [json(PERSONAS)] }])
  renderWithProviders(<StockBias ticker="PLTR" hype={HYPE_PLTR_HIGH} />, { personaId: 'robert' })
  const input = await screen.findByLabelText<HTMLTextAreaElement>('Pourquoi envisagez-vous cette décision ?')
  expect(screen.getByRole('note')).toHaveTextContent('Tendance élevée sur PLTR.')
  expect(screen.getByRole('radio', { name: 'Acheter' })).toBeChecked()
  expect(input.value).toMatch(/^Le titre a pris 38,2\s% en un mois et on en parle partout/)
  expect(screen.getByRole('button', { name: 'Analyser ma décision' })).toBeEnabled()

  await userEvent.clear(input)
  await userEvent.type(input, 'Mon beau-frère en a acheté')
  await userEvent.click(screen.getByRole('radio', { name: 'Je ne sais pas encore' }))
  expect(input).toHaveValue('Mon beau-frère en a acheté')
  expect(screen.getByRole('radio', { name: 'Acheter' })).not.toBeChecked()
})

it('proposes nothing while the hype is not high', async () => {
  mockFetchByUrl([{ match: '/api/personas', responses: [json(PERSONAS)] }])
  renderWithProviders(<StockBias ticker="AAPL" hype={HYPE_AAPL_LOW} />, { personaId: 'robert' })
  expect(await screen.findByLabelText('Pourquoi envisagez-vous cette décision ?')).toHaveValue('')
  expect(screen.getByRole('radio', { name: 'Acheter' })).not.toBeChecked()
  expect(screen.queryByRole('note')).not.toBeInTheDocument()
})
