import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import { KPIS, KPIS_SCORED } from '@/test/stocks'
import { KpiStrip } from './KpiStrip'

const ORIGINAL_FETCH = globalThis.fetch

/** The tile (label + value + sub line) of a KPI. */
const tile = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('KpiStrip', () => {
  it('shows each KPI with its value and its day change, green up and red down', async () => {
    mockFetchByUrl([{ match: '/api/market/kpis', responses: [json(KPIS)] }])
    renderWithProviders(<KpiStrip />)

    expect(screen.getByRole('status', { name: 'Chargement des indicateurs' })).toBeInTheDocument()
    expect(await screen.findByText('S&P 500')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    const sp = within(tile('S&P 500'))
    expect(sp.getByText(/^7\s561,67$/)).toBeInTheDocument()
    expect(sp.getByText(`-0,40 %`)).toHaveClass('text-destructive')
    const tsx = within(tile('S&P/TSX composé'))
    expect(tsx.getByText(/^36\s105,90$/)).toBeInTheDocument()
    expect(tsx.getByText(`+0,09 %`)).toHaveClass('text-success')
    // An exchange rate keeps four decimals; a flat day is neither green nor red.
    const fx = within(tile('USD/CAD'))
    expect(fx.getByText('1,4269')).toBeInTheDocument()
    expect(fx.getByText(`0,00 %`)).toHaveClass('text-muted-foreground')
  })

  it('shows the universe count with its SEC / TMX split', async () => {
    mockFetchByUrl([{ match: '/api/market/kpis', responses: [json(KPIS)] }])
    renderWithProviders(<KpiStrip />)

    await screen.findByText('Titres suivis')
    const universe = within(tile('Titres suivis'))
    expect(universe.getByText(/^14\s409$/)).toBeInTheDocument()
    expect(universe.getByText(`SEC 10 241 · TMX 4 168`)).toBeInTheDocument()
  })

  it('says the pipeline has not run yet for « Titres notés », then the count and median score', async () => {
    mockFetchByUrl([{ match: '/api/market/kpis', responses: [json(KPIS)] }])
    const first = renderWithProviders(<KpiStrip />)

    await screen.findByText('Titres notés')
    const pending = within(tile('Titres notés'))
    expect(pending.getByText('—')).toBeInTheDocument()
    expect(pending.getByText('Pipeline pas encore exécuté')).toBeInTheDocument()
    first.unmount()

    mockFetchByUrl([{ match: '/api/market/kpis', responses: [json(KPIS_SCORED)] }])
    renderWithProviders(<KpiStrip />)
    await screen.findByText('Titres notés')
    const scored = within(tile('Titres notés'))
    expect(scored.getByText('412')).toBeInTheDocument()
    expect(scored.getByText('Score médian 61,2')).toBeInTheDocument()
  })

  it('blanks only the tile whose source failed', async () => {
    mockFetchByUrl([{ match: '/api/market/kpis', responses: [json(KPIS)] }])
    renderWithProviders(<KpiStrip />)

    await screen.findByText('Nasdaq composé')
    const nasdaq = within(tile('Nasdaq composé'))
    expect(nasdaq.getByText('—')).toBeInTheDocument()
    expect(nasdaq.getByText(/Indisponible/)).toHaveTextContent('Aucune cotation reçue pour ^IXIC.')
    expect(within(tile('S&P 500')).getByText(/^7\s561,67$/)).toBeInTheDocument()
  })

  it('explains a failed request and retries it', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/market/kpis', responses: [json({ detail: 'boom' }, 500), json(KPIS)] },
    ])
    renderWithProviders(<KpiStrip />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Indicateurs : Le chargement a échoué (erreur 500)',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
    expect(await screen.findByText('S&P 500')).toBeInTheDocument()
    expect(calls).toHaveLength(2)
  })
})
