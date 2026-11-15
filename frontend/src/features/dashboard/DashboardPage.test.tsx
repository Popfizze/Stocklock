import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, mockFetchUnreachable, type MockResponse } from '@/test/mockFetch'
import { FIT_NVDA_ROBERT, FIT_PLTR_ROBERT, FIT_RY_ROBERT, SECTIONS_AMIRA, SECTION_CRYPTOS } from '@/test/persona'
import { PERSONAS } from '@/test/personas'
import {
  KPIS,
  NVDA_1M,
  SCORE_ABSENT,
  SEARCH_BIT,
  SEARCH_NONE,
  SEARCH_RY,
  SECTION_BEST,
  SECTION_BEST_EMPTY,
  SECTION_CANADA,
  SECTION_CATALOG,
  SECTION_POPULAIRES,
} from '@/test/stocks'
import { StockPage } from '@/features/stocks/StockPage'
import { DashboardPage } from './DashboardPage'

const ORIGINAL_FETCH = globalThis.fetch
const NBSP = ' '

interface Overrides {
  best?: MockResponse[]
  hausses?: MockResponse[]
  populaires?: MockResponse[]
  search?: MockResponse[]
  catalog?: MockResponse[]
}

function mockApi(overrides: Overrides = {}) {
  return mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/market/kpis', responses: [json(KPIS)] },
    { match: /\/api\/fit$/, responses: [json({ persona_id: 'amira', items: [FIT_NVDA_ROBERT, FIT_RY_ROBERT, { ...FIT_PLTR_ROBERT, ticker: 'NU' }], missing: [] })] },
    { match: '/api/fit/', responses: [json(FIT_NVDA_ROBERT)] },
    { match: '/api/universe/search', responses: overrides.search ?? [json(SEARCH_RY)] },
    { match: '/api/market/sections/populaires', responses: overrides.populaires ?? [json(SECTION_POPULAIRES)] },
    { match: '/api/market/sections/meilleurs-scores', responses: overrides.best ?? [json(SECTION_BEST_EMPTY)] },
    {
      match: '/api/market/sections/hausses',
      responses: overrides.hausses ?? [json({ ...SECTION_POPULAIRES, ...SECTION_CATALOG[2], items: [] })],
    },
    { match: '/api/market/sections/canada-populaires', responses: [json(SECTION_CANADA)] },
    { match: /\/api\/market\/sections(\?persona=\w+)?$/, responses: overrides.catalog ?? [json(SECTION_CATALOG)] },
    { match: '/api/market/sections/ia-semis', responses: [json({ ...SECTION_POPULAIRES, ...SECTIONS_AMIRA[0] })] },
    { match: '/api/market/sections/cryptos', responses: [json(SECTION_CRYPTOS)] },
    { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
    { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
    { match: '/api/accounts/projection', responses: [json({ detail: 'x' }, 500)] },
  ])
}

function renderDashboard() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/titres/:ticker" element={<StockPage />} />
    </Routes>,
    { personaId: 'amira' },
  )
}

const section = (name: string) => screen.findByRole('region', { name })

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('DashboardPage', () => {
  it('shows each section of the API as a grid of cards', async () => {
    mockApi()
    renderDashboard()

    expect(screen.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument()
    const populaires = within(await section('Les plus populaires'))
    const nvda = await populaires.findByRole('link', { name: /NVDA/ })
    expect(nvda).toHaveAttribute('href', '/titres/NVDA')
    expect(within(nvda).getByText('NVIDIA Corporation')).toBeInTheDocument()
    expect(within(nvda).getByText('162,85 $ US').textContent).toBe(`162,85${NBSP}$${NBSP}US`)
    expect(within(nvda).getByText('-2,01 %')).toHaveClass('text-destructive')
    expect(within(populaires.getByRole('link', { name: /NU/ })).getByText('+11,75 %')).toHaveClass(
      'text-success',
    )
    // A card without a sparkline still shows its price.
    expect(within(populaires.getByRole('link', { name: /INTC/ })).getByText('100,00 $ US')).toBeInTheDocument()
    expect(populaires.getByText(/3 titres · Yahoo Finance \(filtre de titres\) · au 13 novembre 2026/)).toBeInTheDocument()

    const canada = within(await section('Populaires au Canada'))
    expect(within(await canada.findByRole('link', { name: /RY\.TO/ })).getByText('288,37 $')).toBeInTheDocument()

    // The day's market as a field of tiles, with its plain reading next to it.
    const field = within(await screen.findByRole('region', { name: 'Le marché du jour' }))
    expect(field.getByText(/3 titres de « Les plus populaires » et « Meilleurs scores » : 2 en hausse, 1 en baisse\./)).toBeInTheDocument()
    expect(field.getByRole('img', { name: /Le marché du jour en tuiles, de la meilleure séance à la pire : 3 titres, 2 en hausse/ })).toBeInTheDocument()

    // A KPI strip stands where the row of section links used to be.
    const kpis = within(await screen.findByRole('region', { name: 'Indicateurs' }))
    expect(kpis.getByText('S&P 500')).toBeInTheDocument()
    expect(await kpis.findByText('Titres compatibles')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Sections du tableau de bord' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Meilleurs scores' })).not.toBeInTheDocument()
  })

  it('lets every market section be hidden and shown again', async () => {
    mockApi()
    renderDashboard()

    const populaires = within(await section('Les plus populaires'))
    const toggle = populaires.getByRole('button', { name: /Les plus populaires/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(populaires.queryByRole('link', { name: /NVDA/ })).not.toBeInTheDocument()

    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(await populaires.findByRole('link', { name: /NVDA/ })).toBeInTheDocument()
  })

  it('marks each card with its fit for the active profile', async () => {
    const calls = mockApi()
    renderDashboard()

    const populaires = within(await section('Les plus populaires'))
    const nvda = await populaires.findByRole('link', { name: /NVDA/ })
    expect(await within(nvda).findByText('Hors profil')).toHaveAttribute(
      'title',
      'Hors profil pour Robert : volatilité trop élevée.',
    )
    // High hype is flagged on the card; a quiet title is not.
    expect(within(nvda).queryByText('Tendance élevée')).not.toBeInTheDocument()
    const nu = populaires.getByRole('link', { name: /NU/ })
    expect(within(nu).getByText('Tendance élevée')).toHaveAttribute('title', expect.stringContaining('Volume de la dernière séance'))
    expect(within(nu).getByText('Hors profil')).toBeInTheDocument()
    // A title the batch does not cover keeps its card, without a pastille.
    expect(within(populaires.getByRole('link', { name: /INTC/ })).queryByText(/Compatible|Hors profil|À surveiller/)).not.toBeInTheDocument()
    const canada = within(await section('Populaires au Canada'))
    expect(await within(await canada.findByRole('link', { name: /RY\.TO/ })).findByText('Compatible')).toBeInTheDocument()

    const batch = calls.find((call) => call.url.endsWith('/api/fit') && String(call.init.body).includes('NVDA'))
    expect(JSON.parse(String(batch?.init.body))).toEqual({ persona_id: 'amira', tickers: ['NVDA', 'NU', 'INTC'] })
  })

  it('greets the profile and puts its own sections first, with why', async () => {
    const calls = mockApi({ catalog: [json(SECTIONS_AMIRA)] })
    renderDashboard()

    expect(await screen.findByText('Bonjour Amira')).toBeInTheDocument()
    expect(screen.getByText(/tolérance au risque élevée, horizon long terme/)).toBeInTheDocument()
    expect(calls.some((call) => call.url.endsWith('/api/market/sections?persona=amira'))).toBe(true)

    await section('IA et semi-conducteurs')
    const headings = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.getAttribute('aria-label') ?? heading.textContent)
    expect(headings).toEqual(['Le marché du jour', 'IA et semi-conducteurs', 'Cryptomonnaies', 'Les plus populaires', 'Plus fortes hausses'])
    expect(within(await section('IA et semi-conducteurs')).getByText(/Pour vous · Préférence « IA » du profil d’Amira\./)).toBeInTheDocument()
    const cryptos = within(await section('Cryptomonnaies'))
    expect(cryptos.getByText(/Pour vous · Le profil d’Amira accepte les cryptoactifs\./)).toBeInTheDocument()
    expect(await cryptos.findByRole('link', { name: /BTC-USD/ })).toHaveAttribute('href', '/titres/BTC-USD')
    // A general section carries no « Pour vous ».
    expect(within(await section('Les plus populaires')).queryByText(/Pour vous/)).not.toBeInTheDocument()

    // The profile tiles count the compatible titles of its first section.
    const kpis = within(screen.getByRole('region', { name: 'Indicateurs' }))
    expect(await kpis.findByText('dans « IA et semi-conducteurs »')).toBeInTheDocument()
    expect(kpis.getByText('Volatilité max.')).toBeInTheDocument()
  })

  it('explains why « Meilleurs scores » is empty until the pipeline has run', async () => {
    mockApi()
    renderDashboard()

    const best = within(await section('Meilleurs scores'))
    expect(await best.findByText(/le pipeline de score n'a pas encore été exécuté/)).toBeInTheDocument()
    expect(best.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows the score on a card once it is known, and says when it is partial', async () => {
    mockApi({ best: [json(SECTION_BEST)] })
    renderDashboard()

    const best = within(await section('Meilleurs scores'))
    const aapl = await best.findByRole('link', { name: /AAPL/ })
    expect(within(aapl).getByText('Score 65,4 sur 100')).toBeInTheDocument()
    expect(within(best.getByRole('link', { name: /XIU\.TO/ })).getByText('Score 61,8 sur 100 (partiel)')).toBeInTheDocument()
    // No score yet on the cards of the other sections.
    const populaires = within(await section('Les plus populaires'))
    expect(within(await populaires.findByRole('link', { name: /NVDA/ })).queryByText(/Score/)).not.toBeInTheDocument()
  })

  it('keeps the other sections when one fails, and retries it', async () => {
    const calls = mockApi({
      hausses: [
        json({ detail: 'Yahoo Finance ne répond pas pour le moment.' }, 503),
        json({ ...SECTION_POPULAIRES, ...SECTION_CATALOG[2] }),
      ],
    })
    renderDashboard()

    const hausses = within(await section('Plus fortes hausses'))
    expect(await hausses.findByRole('alert', undefined, { timeout: 4000 })).toHaveTextContent(
      'Yahoo Finance ne répond pas pour le moment.',
    )
    expect(
      await within(await section('Les plus populaires')).findByRole('link', { name: /NVDA/ }),
    ).toBeInTheDocument()

    await userEvent.click(hausses.getByRole('button', { name: 'Réessayer' }))
    expect(await hausses.findByRole('link', { name: /NVDA/ })).toBeInTheDocument()
    expect(calls.filter((call) => call.url.includes('/sections/hausses')).length).toBeGreaterThan(1)
  })

  it('asks for more cards with « Afficher plus »', async () => {
    const full = { ...SECTION_POPULAIRES, items: Array.from({ length: 24 }, (_, i) => ({ ...SECTION_POPULAIRES.items[0], ticker: `T${i}` })) }
    const calls = mockApi({ populaires: [json(full)] })
    renderDashboard()

    const populaires = within(await section('Les plus populaires'))
    // A general section opens on one row of cards, so the page stays short…
    const more = await populaires.findByRole('button', { name: 'Afficher plus' })
    expect(populaires.getAllByRole('link')).toHaveLength(6)
    expect(populaires.getByText(/Aperçu des 24 titres/)).toBeInTheDocument()
    // … the first « Afficher plus » shows the cards already loaded, the next one asks the server for more.
    await userEvent.click(more)
    expect(populaires.getAllByRole('link')).toHaveLength(24)
    expect(calls.some((call) => call.url.includes('limit=48'))).toBe(false)
    await userEvent.click(populaires.getByRole('button', { name: 'Afficher plus' }))
    await vi.waitFor(() =>
      expect(calls.some((call) => call.url.endsWith('/sections/populaires?limit=48'))).toBe(true),
    )
  })

  it('searches the whole universe by name or symbol', async () => {
    const calls = mockApi()
    renderDashboard()

    const search = screen.getByRole('searchbox', { name: /Rechercher un titre/ })
    await userEvent.type(search, 'ry')

    const results = within(await screen.findByRole('region', { name: 'Résultats de la recherche' }))
    expect(results.getByText(/28 titres correspondent à « ry » ; les 3 premiers sont affichés\./)).toBeInTheDocument()
    // SEC names come in upper case and are shown in title case.
    const ry = results.getByRole('link', { name: /^RYRoyal Bank of Canada/ })
    expect(ry).toHaveAttribute('href', '/titres/RY')
    expect(ry).toHaveTextContent('NYSE · États-Unis')
    expect(results.getByRole('link', { name: /RY\.TO/ })).toHaveTextContent('TSX · Canada')
    expect(calls.some((call) => call.url.includes('/api/universe/search?q=ry'))).toBe(true)
    // The sections give way to the results, and come back when the field is cleared.
    expect(screen.queryByRole('region', { name: 'Les plus populaires' })).not.toBeInTheDocument()
    await userEvent.clear(search)
    expect(await section('Les plus populaires')).toBeInTheDocument()
  })

  it('lists the cryptocurrencies that match, after the listed titles', async () => {
    mockApi({ search: [json(SEARCH_BIT)] })
    renderDashboard()

    await userEvent.type(screen.getByRole('searchbox', { name: /Rechercher un titre/ }), 'bit')
    const results = within(await screen.findByRole('region', { name: 'Résultats de la recherche' }))
    const btc = results.getByRole('link', { name: /BTC-USD/ })
    expect(btc).toHaveAttribute('href', '/titres/BTC-USD')
    expect(btc).toHaveTextContent('Cryptomonnaie')
    expect(results.getByRole('link', { name: /BITF/ })).toHaveTextContent('Nasdaq · États-Unis')
  })

  it('says so when nothing matches', async () => {
    mockApi({ search: [json(SEARCH_NONE)] })
    renderDashboard()

    await userEvent.type(screen.getByRole('searchbox', { name: /Rechercher un titre/ }), 'zzz')
    expect(await screen.findByText('Aucun titre ne correspond à « zzz ».')).toBeInTheDocument()
  })

  it('opens the title page from a card', async () => {
    mockApi()
    renderDashboard()

    const populaires = within(await section('Les plus populaires'))
    await userEvent.click(await populaires.findByRole('link', { name: /NVDA/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'NVIDIA' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tableau de bord' })).toHaveAttribute('href', '/')
  })

  it('explains an unreachable server', async () => {
    mockFetchUnreachable()
    renderDashboard()

    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('Impossible de joindre le serveur')
  })
})
