import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { stockProjection } from '@/test/accounts'
import { FIT_NVDA_AMIRA, FIT_NVDA_ROBERT } from '@/test/persona'
import {
  BTC_1M,
  NVDA_1M,
  NVDA_1Y,
  ONE_V_1M,
  SCORE_AAPL,
  SCORE_ABSENT,
  SCORE_NOT_SCORED,
  SCORE_XIU_PARTIAL,
} from '@/test/stocks'
import { StockPage } from './StockPage'

const ORIGINAL_FETCH = globalThis.fetch
const NBSP = ' '

function renderStock(ticker: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/titres/:ticker" element={<StockPage />} />
    </Routes>,
    { personaId: 'amira', route: `/titres/${ticker}` },
  )
}

/** The color the chart paints its line with (ChartStyle's `--color-close`). */
function chartColor(container: HTMLElement) {
  const style = container.querySelector('[data-slot="chart"] style')?.textContent ?? ''
  return /--color-close: ([^;]+);/.exec(style)?.[1]
}

/** The value next to a « Chiffres clés » label. */
const figure = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('StockPage', () => {
  it('shows the close, the day change, the key figures and the dividends', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderStock('NVDA')

    expect(await screen.findByRole('heading', { level: 1, name: 'NVIDIA' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tableau de bord' })).toHaveAttribute('href', '/')
    expect(screen.getByText('NVDA · NASDAQ')).toBeInTheDocument()
    // fr-CA: no-break spaces, decimal comma (text matchers see them as plain spaces).
    expect(screen.getByText('166,19 $ US').textContent).toBe(`166,19${NBSP}$${NBSP}US`)
    expect(screen.getByText('-7,54 $ US (-4,34 %)')).toHaveClass('text-destructive')

    expect(figure('Ouverture')).toHaveTextContent('151,01 $ US')
    expect(figure('Haut du jour')).toHaveTextContent('167,14 $ US')
    expect(figure('Bas du jour')).toHaveTextContent('148,80 $ US')
    expect(figure('Volume')?.textContent).toBe(`742${NBSP}789${NBSP}000`)
    expect(figure('Volume moyen (3 mois)')?.textContent).toBe(`140${NBSP}898${NBSP}889`)
    expect(figure('Haut 52 semaines')).toHaveTextContent('243,37 $ US')
    expect(figure('Bas 52 semaines')).toHaveTextContent('148,80 $ US')
    expect(figure('Rendement du dividende (12 mois)')?.textContent).toBe(`0,31${NBSP}%`)
    expect(figure('Devise')).toHaveTextContent('USD')
    expect(figure('Catégorie')).toHaveTextContent('Actions')
    expect(figure('Secteur')).toHaveTextContent('Information Technology')

    const card = screen.getByText('Dividendes').closest<HTMLElement>('[data-slot="card"]')
    const dividends = within(card as HTMLElement).getAllByRole('listitem')
    expect(dividends.map((item) => item.textContent)).toEqual([
      `10 septembre 2026${'0,25'}${NBSP}$${NBSP}US`,
      `5 mars 2024${'0,004'}${NBSP}$${NBSP}US`,
    ])
  })

  it('switches the chart period and colors it by the trend over that period', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
      { match: '/api/stocks/NVDA?range=1Y', responses: [json(NVDA_1Y)] },
    ])
    const { container } = renderStock('NVDA')
    await screen.findByRole('heading', { level: 1, name: 'NVIDIA' })

    const periods = screen.getByRole('group', { name: 'Période du graphique' })
    expect(within(periods).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1S',
      '1M',
      '3M',
      '1A',
      'Max',
    ])
    expect(within(periods).getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'true')
    expect(chartColor(container)).toBe('var(--destructive)')

    await userEvent.click(within(periods).getByRole('button', { name: '1A' }))

    expect(await screen.findByLabelText('Cours de clôture sur 1 an')).toBeInTheDocument()
    expect(within(periods).getByRole('button', { name: '1A' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(periods).getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'false')
    expect(calls.some((call) => call.url.endsWith('/api/stocks/NVDA?range=1Y'))).toBe(true)
    await vi.waitFor(() => expect(chartColor(container)).toBe('var(--success)'))
  })

  it('says « Aucun dividende » for an asset that pays none', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/BTC-USD?range=1M', responses: [json(BTC_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('BTC-USD', 'Bitcoin'))] },
    ])
    renderStock('BTC-USD')

    expect(await screen.findByText('Aucun dividende')).toBeInTheDocument()
    expect(figure('Rendement du dividende (12 mois)')).toHaveTextContent('—')
    expect(figure('Catégorie')).toHaveTextContent('Cryptoactifs')
  })

  it('shows which account suits this stock for the active profile', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderStock('NVDA')

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Quel compte pour NVIDIA (NVDA) ?' }),
    ).toBeInTheDocument()
    const request = calls.find((call) => call.url.endsWith('/api/accounts/projection'))
    expect(JSON.parse(String(request?.init.body))).toEqual({
      persona_id: 'amira',
      ticker: 'NVDA',
      annual_contribution: 7000,
      years: 15,
    })
    expect(screen.getByRole('list', { name: 'Options de compte' })).toHaveTextContent('Le plus avantageux ici')
  })

  it('says the score is not computed yet while the pipeline has not run', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/NVDA', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderStock('NVDA')

    const score = within(await screen.findByRole('region', { name: 'Score StockLock' }))
    expect(await score.findByText('Score pas encore calculé')).toBeInTheDocument()
    expect(score.getByText(/le pipeline de score n'a pas encore été exécuté/)).toBeInTheDocument()
    expect(score.getByRole('link', { name: 'Labo' })).toHaveAttribute('href', '/labo')
  })

  it('says so when the table does not cover the title', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/NVDA', responses: [json(SCORE_NOT_SCORED)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderStock('NVDA')

    const score = within(await screen.findByRole('region', { name: 'Score StockLock' }))
    expect(await score.findByText('Score pas encore calculé')).toBeInTheDocument()
    expect(score.getByText(/il ne figure pas dans la dernière table calculée/)).toBeInTheDocument()
  })

  it('shows the score, its six sub-scores and the raw indicators behind one', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/NVDA', responses: [json(SCORE_AAPL)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderStock('NVDA')

    const score = within(await screen.findByRole('region', { name: 'Score StockLock' }))
    expect(await score.findByText('65,4')).toBeInTheDocument()
    expect(score.queryByText('Partiel')).not.toBeInTheDocument()
    expect(score.getByText('Données au').nextElementSibling).toHaveTextContent('13 novembre 2026')
    expect(score.getByText('Comparé à').nextElementSibling).toHaveTextContent('Technologie, 48 titres')
    expect(score.getByText('Calculé le').nextElementSibling).toHaveTextContent('15 novembre 2026')

    // Each sub-score: weight, score, contribution.
    expect(score.getAllByRole('button')).toHaveLength(6)
    const profitability = score.getByRole('button', { name: /Rentabilité/ })
    expect(profitability).toHaveTextContent('Poids 25 %')
    expect(profitability).toHaveTextContent('92 / 100')
    expect(profitability).toHaveTextContent('+23,0 pts')

    // The raw indicators appear when a sub-score is opened.
    await userEvent.click(profitability)
    const roe = await score.findByRole('row', { name: /ROE/ })
    expect(roe).toHaveTextContent('152 %')
    expect(roe).toHaveTextContent('96')
    expect(roe).toHaveTextContent('Plus haut, mieux')
    await userEvent.click(score.getByRole('button', { name: /Valorisation/ }))
    const pe = await score.findByRole('row', { name: /Cours \/ bénéfice/ })
    expect(pe).toHaveTextContent('35,2×')
    expect(pe).toHaveTextContent('Plus bas, mieux')
    expect(pe).toHaveTextContent('Comparé au secteur')

    expect(score.getByRole('link', { name: 'SEC EDGAR (companyfacts)' })).toHaveAttribute(
      'href',
      'https://www.sec.gov/edgar',
    )
    expect(score.getByText(/au 10 novembre 2026/)).toBeInTheDocument()
  })

  it('marks a partial score and its missing sub-scores', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/NVDA', responses: [json(SCORE_XIU_PARTIAL)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderStock('NVDA')

    const score = within(await screen.findByRole('region', { name: 'Score StockLock' }))
    expect(await score.findByText('Partiel')).toBeInTheDocument()
    expect(score.getByRole('button', { name: /Rentabilité/ })).toHaveTextContent('Non disponible')
    expect(score.getByRole('button', { name: /Momentum et risque/ })).toHaveTextContent(
      'Poids 15 % · 60 % après redistribution',
    )
  })

  it('offers bias analysis but not account comparison for a title outside the starter kit', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/ONE.V?range=1M', responses: [json(ONE_V_1M)] },
    ])
    renderStock('ONE.V')

    expect(await screen.findByRole('heading', { level: 1, name: '01 Quantum Inc.' })).toBeInTheDocument()
    expect(screen.getByText('ONE.V · TSXV')).toBeInTheDocument()
    expect(screen.getByText(/Cours au 13 novembre 2026 · Yahoo Finance/)).toBeInTheDocument()
    expect(screen.getByText(/couvre les 31 titres du jeu de données du datathon/)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Quel compte pour/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Prendre du recul/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Prendre du recul' })).toBeInTheDocument()
    expect(calls.some((call) => call.url.includes('/api/accounts/'))).toBe(false)
  })

  it('says first whether the title suits the active profile, with the reasons', async () => {
    const calls = mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_ROBERT)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/titres/:ticker" element={<StockPage />} />
      </Routes>,
      { personaId: 'robert', route: '/titres/NVDA' },
    )

    const block = within(await screen.findByRole('region', { name: 'Pour Robert' }))
    expect(await block.findByText('Hors profil')).toHaveClass('text-destructive')
    expect(block.getByText('Hors profil pour Robert : volatilité trop élevée.')).toBeInTheDocument()
    const reasons = within(block.getByRole('list', { name: 'Raisons du verdict' })).getAllByRole('listitem')
    expect(reasons).toHaveLength(3)
    expect(reasons[0]).toHaveTextContent(
      'Bloquant : Volatilité sur 1 an de 48,6 % au-dessus du maximum de 25 % du profil de Robert.',
    )
    expect(reasons[2]).toHaveTextContent('À noter : Position maximale pour Robert : 10 % du portefeuille.')
    expect(block.getByText(/volatilité maximale 25 %, position\s+maximale 10 % par titre/)).toBeInTheDocument()
    expect(calls.some((call) => call.url.endsWith('/api/fit/NVDA?persona=robert'))).toBe(true)
    // The verdict comes before the score.
    const score = screen.getByRole('region', { name: 'Score StockLock' })
    expect(
      screen.getByRole('region', { name: 'Pour Robert' }).compareDocumentPosition(score) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('stays quiet when the verdict cannot be computed', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json({ detail: 'x' }, 503)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/NVDA?range=1M', responses: [json(NVDA_1M)] },
      { match: '/api/accounts/projection', responses: [json(stockProjection('NVDA', 'NVIDIA'))] },
    ])
    renderStock('NVDA')

    const block = within(await screen.findByRole('region', { name: 'Pour Amira' }))
    expect(await block.findByText(/Verdict de profil indisponible/, undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'NVIDIA' })).toBeInTheDocument()
  })

  it('explains an unknown ticker', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/fit/', responses: [json(FIT_NVDA_AMIRA)] },
      { match: '/api/scores/', responses: [json(SCORE_ABSENT)] },
      { match: '/api/stocks/', responses: [json({ detail: "titre inconnu 'NOPE'" }, 404)] },
    ])
    renderStock('NOPE')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ce titre est introuvable',
    )
    expect(screen.getByRole('link', { name: '← Tableau de bord' })).toBeInTheDocument()
  })
})
