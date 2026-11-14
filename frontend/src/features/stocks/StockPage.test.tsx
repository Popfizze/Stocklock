import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { PROJECTION } from '@/test/accounts'
import { FIT_NVDA_ROBERT, FIT_PLTR_ROBERT, HYPE_PLTR_HIGH } from '@/test/persona'
import { mockStockPage } from '@/test/stockPage'
import {
  NVDA_1M,
  NVDA_1Y,
  ONE_V_1M,
  SCORE_AAPL,
  SCORE_NOT_SCORED,
  SCORE_XIU_PARTIAL,
} from '@/test/stocks'
import { StockPage } from './StockPage'

const ORIGINAL_FETCH = globalThis.fetch
const NBSP = ' '

function renderStock(ticker: string, personaId = 'amira') {
  return renderWithProviders(
    <Routes>
      <Route path="/titres/:ticker" element={<StockPage />} />
    </Routes>,
    { personaId, route: `/titres/${ticker}` },
  )
}

/** The color the chart paints its line with (ChartStyle's `--color-close`). */
function chartColor(container: HTMLElement) {
  const style = container.querySelector('[data-slot="chart"] style')?.textContent ?? ''
  return /--color-close: ([^;]+);/.exec(style)?.[1]
}

const region = (name: string) => screen.findByRole('region', { name })

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('StockPage', () => {
  it('opens with who the title is, its price, the day change, the date and the source', async () => {
    mockStockPage(NVDA_1M)
    renderStock('NVDA')

    expect(await screen.findByRole('heading', { level: 1, name: 'NVIDIA' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tableau de bord' })).toHaveAttribute('href', '/')
    expect(screen.getByText('NVDA · NASDAQ')).toBeInTheDocument()
    expect(screen.getByText('Actions · Information Technology')).toBeInTheDocument()
    // fr-CA: no-break spaces, decimal comma (text matchers see them as plain spaces).
    expect(screen.getByText('166,19 $ US').textContent).toBe(`166,19${NBSP}$${NBSP}US`)
    expect(screen.getByText('-7,54 $ US (-4,34 %)')).toHaveClass('text-destructive')
    expect(screen.getByText(/Cours au 12 novembre 2026/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Yahoo Finance (cours quotidiens, différés)' })).toHaveAttribute(
      'href',
      'https://finance.yahoo.com/',
    )
  })

  it('puts the blocks in decision order, each one a named region', async () => {
    mockStockPage(NVDA_1M)
    renderStock('NVDA')
    await screen.findByRole('heading', { level: 1, name: 'NVIDIA' })

    const names = [
      'Pour Amira',
      'Score StockLock',
      'Prendre du recul',
      'Comprendre les fluctuations',
      "L'impôt selon le compte",
      'ESG et controverses',
      'Détails',
    ]
    const blocks = names.map((name) => screen.getByRole('region', { name }))
    blocks.slice(1).forEach((block, index) => {
      expect(blocks[index].compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    })
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(names)
  })

  it('switches the chart period, says its change and colors it by the trend over that period', async () => {
    const calls = mockStockPage(NVDA_1M, {}, [
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
    expect(screen.getByText('-12,58 %')).toHaveClass('text-destructive')
    expect(screen.getByText('sur 1 mois')).toBeInTheDocument()

    await userEvent.click(within(periods).getByRole('button', { name: '1A' }))

    expect(await screen.findByLabelText('Cours de clôture sur 1 an')).toBeInTheDocument()
    expect(within(periods).getByRole('button', { name: '1A' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(periods).getByRole('button', { name: '1M' })).toHaveAttribute('aria-pressed', 'false')
    expect(calls.some((call) => call.url.endsWith('/api/stocks/NVDA?range=1Y'))).toBe(true)
    await vi.waitFor(() => expect(chartColor(container)).toBe('var(--success)'))
    expect(screen.getByText('+18,54 %')).toHaveClass('text-success')
  })

  it('says first whether the title suits the active profile, with the reasons', async () => {
    const calls = mockStockPage(NVDA_1M, { fit: json(FIT_NVDA_ROBERT) })
    renderStock('NVDA', 'robert')

    const block = within(await region('Pour Robert'))
    expect(await block.findByText('Hors profil')).toBeInTheDocument()
    expect(block.getByText('Hors profil pour Robert : volatilité trop élevée.')).toBeInTheDocument()
    const reasons = within(block.getByRole('list', { name: 'Raisons du verdict' })).getAllByRole('listitem')
    expect(reasons).toHaveLength(3)
    expect(reasons[0]).toHaveTextContent(
      'Bloquant : Volatilité sur 1 an de 48,6 % au-dessus du maximum de 25 % du profil de Robert.',
    )
    expect(reasons[2]).toHaveTextContent('À noter : Position maximale pour Robert : 10 % du portefeuille.')
    expect(block.getByText(/63 ans, tolérance au risque faible, horizon court terme/)).toBeInTheDocument()
    expect(block.getByText(/volatilité maximale 25 %, position maximale 10 % par titre/)).toBeInTheDocument()
    expect(calls.some((call) => call.url.endsWith('/api/fit/NVDA?persona=robert'))).toBe(true)
  })

  it('sums every block up in one line that leads to it, and flags what the verdict warns about', async () => {
    mockStockPage(NVDA_1M, {
      fit: json(FIT_PLTR_ROBERT),
      hype: json(HYPE_PLTR_HIGH),
      score: json(SCORE_XIU_PARTIAL),
    })
    renderStock('NVDA', 'robert')

    const brief = within(await screen.findByRole('navigation', { name: 'En bref' }))
    const score = await brief.findByRole('link', { name: /Score StockLock/ })
    expect(score).toHaveAttribute('href', '#score')
    expect(score).toHaveTextContent('61,8 / 100 · partiel')
    const hype = brief.getByRole('link', { name: /Battage/ })
    expect(hype).toHaveAttribute('href', '#prendre-du-recul')
    await vi.waitFor(() => expect(hype).toHaveTextContent('À vérifier : Élevé'))
    expect(brief.getByRole('link', { name: /Fluctuations/ })).toHaveAttribute('href', '#comprendre')
    const account = brief.getByRole('link', { name: /Après impôt, le plus élevé/ })
    expect(account).toHaveAttribute('href', '#compte')
    await vi.waitFor(() => expect(account).toHaveTextContent('REER'))
    const esg = brief.getByRole('link', { name: /Risque ESG/ })
    expect(esg).toHaveAttribute('href', '#esg')
    await vi.waitFor(() => expect(esg).toHaveTextContent('Faible'))
    expect(esg).not.toHaveTextContent('À vérifier')
  })

  it('keeps the page when the verdict cannot be computed, and offers to retry', async () => {
    mockStockPage(NVDA_1M, { fit: json({ detail: 'Yahoo Finance ne répond pas.' }, 503) })
    renderStock('NVDA')

    const block = within(await region('Pour Amira'))
    expect(await block.findByText('Verdict de profil indisponible')).toBeInTheDocument()
    expect(block.getByText('Yahoo Finance ne répond pas.')).toBeInTheDocument()
    expect(block.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'NVIDIA' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Score StockLock' })).toBeInTheDocument()
  })

  it('says the score is not computed yet while the pipeline has not run', async () => {
    mockStockPage(NVDA_1M)
    renderStock('NVDA')

    const score = within(await region('Score StockLock'))
    expect(await score.findByText('Score pas encore calculé')).toBeInTheDocument()
    expect(score.getByText(/le pipeline de score n'a pas encore été exécuté/)).toBeInTheDocument()
    expect(score.getByRole('link', { name: 'Labo' })).toHaveAttribute('href', '/labo')
    const brief = within(screen.getByRole('navigation', { name: 'En bref' }))
    expect(brief.getByRole('link', { name: /Score StockLock/ })).toHaveTextContent('Pas encore calculé')
  })

  it('says so when the table does not cover the title', async () => {
    mockStockPage(NVDA_1M, { score: json(SCORE_NOT_SCORED) })
    renderStock('NVDA')

    const score = within(await region('Score StockLock'))
    expect(await score.findByText('Score pas encore calculé')).toBeInTheDocument()
    expect(score.getByText(/il ne figure pas dans la dernière table calculée/)).toBeInTheDocument()
  })

  it('shows the score, its six sub-scores and the raw indicators behind one', async () => {
    mockStockPage(NVDA_1M, { score: json(SCORE_AAPL) })
    renderStock('NVDA')

    const score = within(await region('Score StockLock'))
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
    mockStockPage(NVDA_1M, { score: json(SCORE_XIU_PARTIAL) })
    renderStock('NVDA')

    const score = within(await region('Score StockLock'))
    expect(await score.findByText('Partiel')).toBeInTheDocument()
    expect(score.getByText(/au moins un sous-score manque, son poids est redistribué/)).toBeInTheDocument()
    expect(score.getByRole('button', { name: /Rentabilité/ })).toHaveTextContent('Non disponible')
    expect(score.getByRole('button', { name: /Momentum et risque/ })).toHaveTextContent(
      'Poids 15 % · 60 % après redistribution',
    )
  })

  it('explains what a title outside the datathon’s assets gets instead of its own account projection', async () => {
    const calls = mockStockPage(ONE_V_1M, { account: json(PROJECTION) })
    renderStock('ONE.V')

    expect(await screen.findByRole('heading', { level: 1, name: '01 Quantum Inc.' })).toBeInTheDocument()
    expect(screen.getByText('ONE.V · TSXV')).toBeInTheDocument()

    const account = within(await region("L'impôt selon le compte"))
    expect(account.getByText(/couvre les 31 titres du jeu de données du datathon ; ONE\.V n’en fait pas\s+partie/)).toBeInTheDocument()
    expect(await account.findByText(/le CELIAPP donne le montant après impôt le plus élevé/)).toBeInTheDocument()
    expect(account.getByRole('link', { name: 'Voir la projection en chiffres dans Comptes' })).toHaveAttribute(
      'href',
      '/comptes?vue=chiffres',
    )
    // The profile's general projection: no ticker in the request.
    const request = calls.find((call) => call.url.endsWith('/api/accounts/projection'))
    expect(JSON.parse(String(request?.init.body))).toEqual({
      persona_id: 'amira',
      annual_contribution: 7000,
      years: 15,
      expected_return: 0.05,
    })
    const brief = within(screen.getByRole('navigation', { name: 'En bref' }))
    expect(brief.getByRole('link', { name: /Après impôt, le plus élevé \(épargne\)/ })).toHaveTextContent('CELIAPP')
    // The other blocks cover any title.
    expect(screen.getByRole('region', { name: 'Prendre du recul' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expliquer les mouvements' })).toBeInTheDocument()
  })

  it('explains an unknown ticker', async () => {
    mockFetchByUrl([
      { match: '/api/personas', responses: [json(PERSONAS)] },
      { match: '/api/stocks/', responses: [json({ detail: "titre inconnu 'NOPE'" }, 404)] },
    ])
    renderStock('NOPE')

    expect(await screen.findByRole('alert')).toHaveTextContent('Ce titre est introuvable')
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Tableau de bord' })).toBeInTheDocument()
  })
})
