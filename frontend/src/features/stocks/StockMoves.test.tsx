import { afterEach, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import { NVDA_MOVES } from '@/test/moves'
import { PERSONAS } from '@/test/personas'
import { renderWithProviders } from '@/test/render'
import { StockMoves } from './StockMoves'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks() })

const movesCalls = (calls: Array<{ url: string; init: RequestInit }>) =>
  calls.filter((call) => call.url.includes('/api/explain-move/stock'))

it('runs only when asked, then shows the figures, the narration and each move’s explanation', async () => {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/explain-move/stock', responses: [json(NVDA_MOVES)] },
  ])
  renderWithProviders(<StockMoves ticker="NVDA" />, { personaId: 'robert' })

  const button = await screen.findByRole('button', { name: 'Expliquer les mouvements' })
  expect(movesCalls(calls)).toHaveLength(0)
  await userEvent.click(button)

  expect(await screen.findByText('Écart avec l’indice')).toBeInTheDocument()
  expect(JSON.parse(String(movesCalls(calls)[0].init.body))).toEqual({ persona_id: 'robert', ticker: 'NVDA', period: '1y' })
  expect(screen.getByText('Indice QQQ').nextElementSibling).toHaveTextContent('+18,34 %')
  expect(screen.getByText('Confiance').nextElementSibling).toHaveTextContent('moyenne')
  expect(screen.getByText(/modèle de marché \(bêta estimé/)).toBeInTheDocument()

  // the narrator's text without its internal source ids, bold kept
  expect(screen.getByText('moins bien').tagName).toBe('STRONG')
  expect(screen.queryByText(/starter_prices\]|Analyse pour Robert/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Écart avec le profil de Robert' })).toBeInTheDocument()

  const items = within(screen.getByRole('heading', { name: 'Mouvements marquants' }).parentElement as HTMLElement)
    .getAllByRole('listitem')
  expect(within(items[0]).getByText('Fait daté')).toBeInTheDocument()
  expect(within(items[0]).getByRole('link', { name: 'NVIDIA publie des revenus trimestriels record.' }))
    .toHaveAttribute('href', NVDA_MOVES.moves[0].event?.url)
  expect(items[0]).toHaveTextContent('Lien plausible selon Claude Haiku')
  expect(items[0]).toHaveTextContent('« revenus trimestriels record »')
  expect(within(items[1]).getByText('Hypothèse')).toBeInTheDocument()
  expect(items[1]).toHaveTextContent('(publié le 11 novembre 2026)')  // dated the day before by Haiku
  expect(within(items[2]).getByText('Aucun événement')).toBeInTheDocument()

  await userEvent.click(screen.getByText('Sources, hypothèses et limites'))
  expect(screen.getByText(/Réserve fédérale \(Fed\) : hausse du taux/)).toBeInTheDocument()
  expect(screen.getByText(/GDELT indisponible/)).toBeInTheDocument()
})

it('runs again for another period once started', async () => {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/explain-move/stock', responses: [json(NVDA_MOVES), json({ ...NVDA_MOVES, period: '2022', moves: [] })] },
  ])
  renderWithProviders(<StockMoves ticker="NVDA" />, { personaId: 'amira' })
  await userEvent.click(await screen.findByRole('button', { name: 'Expliquer les mouvements' }))
  await screen.findByText('Écart avec l’indice')
  await userEvent.click(screen.getByRole('button', { name: '2022' }))
  expect(await screen.findByText(/le titre a suivi son marché/)).toBeInTheDocument()
  expect(movesCalls(calls).map((call) => JSON.parse(String(call.init.body)).period)).toEqual(['1y', '2022'])
  expect(screen.getByRole('button', { name: '2022' })).toHaveAttribute('aria-pressed', 'true')
})

it('says why the analysis failed', async () => {
  mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/explain-move/stock', responses: [json({ detail: 'Étape « Prix » indisponible.' }, 503)] },
  ])
  renderWithProviders(<StockMoves ticker="NVDA" />, { personaId: 'robert' })
  await userEvent.click(await screen.findByRole('button', { name: 'Expliquer les mouvements' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Étape « Prix » indisponible.')
})
