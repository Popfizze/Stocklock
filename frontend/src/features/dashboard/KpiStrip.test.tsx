import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { FIT_BATCH_ROBERT, SECTIONS_ROBERT } from '@/test/persona'
import { PERSONAS } from '@/test/personas'
import { KPIS, SECTION_POPULAIRES } from '@/test/stocks'
import { KpiStrip } from './KpiStrip'

const ORIGINAL_FETCH = globalThis.fetch
const DIVIDENDES = SECTIONS_ROBERT[0]

function mockApi(overrides: { kpis?: MockResponse[]; fit?: MockResponse[] } = {}) {
  return mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/market/kpis', responses: overrides.kpis ?? [json(KPIS)] },
    { match: '/api/market/sections/dividendes', responses: [json({ ...SECTION_POPULAIRES, ...DIVIDENDES })] },
    { match: '/api/fit', responses: overrides.fit ?? [json(FIT_BATCH_ROBERT)] },
  ])
}

/** The tile (label + value + sub line) of a KPI. */
const tile = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('KpiStrip', () => {
  it('shows the indices with their level and day change, green up and red down', async () => {
    mockApi()
    renderWithProviders(<KpiStrip />, { personaId: 'robert' })

    expect(screen.getAllByRole('status', { name: 'Chargement d’un indicateur' })).toHaveLength(3)
    expect(await screen.findByText('S&P 500')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    const sp = within(tile('S&P 500'))
    expect(sp.getByText(/^7\s561,67$/)).toBeInTheDocument()
    expect(sp.getByText('-0,40 %')).toHaveClass('text-destructive')
    const tsx = within(tile('S&P/TSX composé'))
    expect(tsx.getByText(/^36\s105,90$/)).toBeInTheDocument()
    expect(tsx.getByText('+0,09 %')).toHaveClass('text-success')
    // Only the indices are kept from the market tiles.
    expect(screen.queryByText('USD/CAD')).not.toBeInTheDocument()
    expect(screen.queryByText('Titres suivis')).not.toBeInTheDocument()
  })

  it('blanks only the index whose source failed', async () => {
    mockApi()
    renderWithProviders(<KpiStrip />, { personaId: 'robert' })

    await screen.findByText('Nasdaq composé')
    const nasdaq = within(tile('Nasdaq composé'))
    expect(nasdaq.getByText('—')).toBeInTheDocument()
    expect(nasdaq.getByText(/Indisponible/)).toHaveTextContent('Aucune cotation reçue pour ^IXIC.')
    expect(within(tile('S&P 500')).getByText(/^7\s561,67$/)).toBeInTheDocument()
  })

  it('adds the profile’s own tiles: its limits and its compatible titles', async () => {
    const calls = mockApi()
    renderWithProviders(<KpiStrip section={DIVIDENDES} />, { personaId: 'robert' })

    expect(await within(tile('Volatilité max.')).findByText('25 %')).toBeInTheDocument()
    expect(within(tile('Position max.')).getByText('10 %')).toBeInTheDocument()
    const compatible = within(tile('Titres compatibles'))
    expect(compatible.getByText('1 sur 3')).toBeInTheDocument()
    expect(compatible.getByText('dans « Dividendes réguliers »')).toBeInTheDocument()
    const batch = calls.find((call) => call.url.endsWith('/api/fit'))
    expect(JSON.parse(String(batch?.init.body))).toEqual({ persona_id: 'robert', tickers: ['NVDA', 'NU', 'INTC'] })
  })

  it('says the profile tiles are unavailable when the verdicts cannot be computed', async () => {
    mockApi({ fit: [json({ detail: 'x' }, 503)] })
    renderWithProviders(<KpiStrip section={DIVIDENDES} />, { personaId: 'robert' })

    const volatility = within(tile('Volatilité max.'))
    expect(await volatility.findByText('Indisponible', undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(volatility.getByText('—')).toBeInTheDocument()
    // The indices are not affected.
    expect(within(tile('S&P 500')).getByText(/^7\s561,67$/)).toBeInTheDocument()
  })

  it('explains a failed indices request and retries it', async () => {
    const calls = mockApi({ kpis: [json({ detail: 'boom' }, 500), json(KPIS)] })
    renderWithProviders(<KpiStrip />, { personaId: 'robert' })

    expect(await screen.findByRole('alert', undefined, { timeout: 4000 })).toHaveTextContent(
      'Indices : Le chargement a échoué (erreur 500)',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('S&P 500')).toBeInTheDocument()
    expect(calls.filter((call) => call.url.includes('/api/market/kpis')).length).toBeGreaterThan(1)
  })
})
