import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, mockFetchUnreachable } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { NVDA_1M, STOCKS } from '@/test/stocks'
import { StockPage } from '@/features/stocks/StockPage'
import { DashboardPage } from './DashboardPage'

const ORIGINAL_FETCH = globalThis.fetch
const NBSP = ' '

function mockApi() {
  return mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: /\/api\/stocks\/NVDA\?range=1M$/, responses: [json(NVDA_1M)] },
    { match: /\/api\/stocks$/, responses: [json(STOCKS)] },
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

const rowLinks = () =>
  screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/titres/'))

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('DashboardPage', () => {
  it('lists the assets by section with their close and day change', async () => {
    mockApi()
    renderDashboard()

    expect(await screen.findByRole('heading', { level: 2, name: 'Actions canadiennes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument()
    expect(
      screen.getByText('Cours de clôture au 12 novembre 2026 (données du datathon)'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Actions canadiennes',
      'Actions américaines',
      'FNB',
      'Cryptomonnaies',
    ])

    const canada = screen.getByRole('region', { name: 'Actions canadiennes' })
    expect(within(canada).getAllByRole('listitem')).toHaveLength(2)

    const nvda = screen.getByRole('link', { name: /NVDA/ })
    expect(nvda).toHaveAttribute('href', '/titres/NVDA')
    expect(nvda).toHaveTextContent('NVIDIA')
    // fr-CA: no-break spaces, decimal comma (text matchers see them as plain spaces).
    expect(within(nvda).getByText('166,19 $ US').textContent).toBe(`166,19${NBSP}$${NBSP}US`)
    const change = within(nvda).getByText('-7,54 $ US (-4,34 %)')
    expect(change).toHaveClass('text-destructive')

    const shop = screen.getByRole('link', { name: /SHOP\.TO/ })
    expect(within(shop).getByText('+12,25 $ (+1,00 %)')).toHaveClass('text-success')
    expect(within(shop).getByText('1 234,50 $').textContent).toBe(`1${NBSP}234,50${NBSP}$`)
  })

  it('filters by symbol or by name and hides the empty sections', async () => {
    mockApi()
    renderDashboard()
    const search = await screen.findByRole('searchbox', { name: /Rechercher un titre/ })
    await screen.findByRole('link', { name: /NVDA/ })

    await userEvent.type(search, 'bitc')
    expect(rowLinks().map((link) => link.getAttribute('href'))).toEqual(['/titres/BTC-USD'])
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Cryptomonnaies',
    ])

    await userEvent.clear(search)
    await userEvent.type(search, 'ry.to')
    expect(rowLinks().map((link) => link.getAttribute('href'))).toEqual(['/titres/RY.TO'])

    await userEvent.clear(search)
    await userEvent.type(search, 'zzz')
    expect(rowLinks()).toHaveLength(0)
    expect(screen.getByText('Aucun titre ne correspond à « zzz ».')).toBeInTheDocument()
  })

  it('opens the stock page from a row, with the keyboard too', async () => {
    mockApi()
    renderDashboard()

    const nvda = await screen.findByRole('link', { name: /NVDA/ })
    nvda.focus()
    await userEvent.keyboard('{Enter}')

    expect(await screen.findByRole('heading', { level: 1, name: 'NVIDIA' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tableau de bord' })).toHaveAttribute('href', '/')
  })

  it('says so when the server cannot be reached', async () => {
    mockFetchUnreachable()
    renderDashboard()

    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de joindre le serveur')
  })
})
