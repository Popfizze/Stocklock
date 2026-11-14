import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, type MockResponse } from '@/test/mockFetch'
import { PORTFOLIO_ROBERT } from '@/test/persona'
import { PERSONAS } from '@/test/personas'
import { PORTFOLIO_ROBERT_CUSTOM } from '@/test/scoring'
import { SEARCH_RY } from '@/test/stocks'
import { EXAMPLE_PORTFOLIOS } from '@/lib/example-portfolios'
import { PortfolioPage } from './PortfolioPage'
import { readPortfolio, storePortfolio } from './portfolioStore'
import { readScoreSetup } from './scoreWeights'

const ORIGINAL_FETCH = globalThis.fetch

function renderPortfolio(personaId = 'robert', analysis: MockResponse[] = [json(PORTFOLIO_ROBERT)]) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/portfolio/analyze', responses: analysis },
    { match: '/api/universe/search', responses: [json(SEARCH_RY)] },
  ])
  renderWithProviders(<PortfolioPage />, { route: '/portefeuille', personaId })
  return calls
}

const analyzeBodies = (calls: Array<{ url: string; init: RequestInit }>) =>
  calls.filter((call) => call.url.endsWith('/api/portfolio/analyze')).map((call) => JSON.parse(String(call.init.body)))

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('PortfolioPage', () => {
  it('starts from the profile’s example portfolio and analyses it', async () => {
    const calls = renderPortfolio()

    expect(screen.getByRole('heading', { level: 1, name: 'Mon portefeuille' })).toBeInTheDocument()
    expect(await screen.findByText('Profil de Robert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Titres (11)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Poids de PLTR')).toHaveValue(12)
    expect(screen.getByText(/Total des poids saisis : 100/)).toBeInTheDocument()

    // Findings, blocking first.
    const findings = within(await screen.findByRole('region', { name: 'Constats' }))
    const items = findings.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Bloquant : PLTR pèse 12,0 % du portefeuille')
    expect(items[3]).toHaveTextContent('Conforme : Concentration faible')
    expect(analyzeBodies(calls)[0]).toEqual({ persona_id: 'robert', holdings: EXAMPLE_PORTFOLIOS.robert })

    // The holdings lead as 3D blocks under the profile's ceiling, with their plain reading.
    expect(
      await screen.findByRole('img', { name: /Le portefeuille en blocs : 11 titres, hauteur selon le poids, sous un plafond à 10\s%\. Au-dessus du plafond : PLTR\./ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Glissez un bloc vers le haut ou le bas/)).toBeInTheDocument()

    // Each holding: its share, volatility and fit for the profile.
    const pltr = screen.getByRole('row', { name: /PLTR/ })
    expect(pltr).toHaveTextContent('Palantir Technologies Inc.')
    expect(pltr).toHaveTextContent('12 %')
    expect(pltr).toHaveTextContent('max. 10 %')
    expect(pltr).toHaveTextContent('51,2 %')
    expect(within(pltr).getByText('Hors profil')).toHaveAttribute(
      'title',
      'Hors profil pour Robert : volatilité trop élevée ; battage médiatique élevé.',
    )
    expect(within(screen.getByRole('row', { name: /RY\.TO/ })).getByText('Compatible')).toBeInTheDocument()
    expect(within(pltr).getByRole('link', { name: 'PLTR' })).toHaveAttribute('href', '/titres/PLTR')
  })

  it('shows the diversification: weights, largest positions against the maximum, volatility', async () => {
    renderPortfolio()

    const diversification = within(await screen.findByRole('region', { name: 'Diversification' }))
    expect(diversification.getByText('Volatilité du portefeuille').nextElementSibling).toHaveTextContent(
      '11,2 %maximum du profil : 25 %',
    )
    expect(diversification.getByText('Volatilité pondérée').nextElementSibling).toHaveTextContent('16,8 %')
    expect(diversification.getByText('Positions équivalentes').nextElementSibling).toHaveTextContent(
      '10,6Concentration faible',
    )
    const max = diversification.getByText('Position maximale du profil').nextElementSibling as HTMLElement
    expect(max).toHaveTextContent('10 %au-dessus : PLTR')
    expect(within(max).getByText('au-dessus : PLTR')).toHaveClass('text-destructive')

    const sectors = diversification.getByRole('heading', { name: 'Par secteur' }).parentElement as HTMLElement
    const sectorItems = within(sectors).getAllByRole('listitem')
    expect(sectorItems).toHaveLength(3)
    expect(sectorItems[0]).toHaveTextContent('Services financiers18 %')
    expect(sectorItems[2]).toHaveTextContent('Non classé (FNB, cryptoactifs)20 %')
    expect(diversification.getByRole('heading', { name: 'Par classe d’actifs' }).parentElement).toHaveTextContent('Actions80 %')
    expect(diversification.getByRole('heading', { name: 'Par pays' }).parentElement).toHaveTextContent('Canada64 %')
    const largest = diversification.getByRole('heading', { name: 'Plus grandes positions' }).parentElement as HTMLElement
    expect(within(largest).getByText('12 %')).toHaveClass('text-destructive')
  })

  it('suggests titles with their reasons, and adds one to the portfolio', async () => {
    renderPortfolio()

    const suggestions = within(await screen.findByRole('region', { name: 'Suggestions' }))
    expect(suggestions.getByText(/La table des scores n'existe pas encore/)).toBeInTheDocument()
    const wm = suggestions.getByRole('link', { name: 'WM' }).closest('li') as HTMLElement
    expect(wm).toHaveTextContent('Waste Management, Inc.')
    expect(wm).toHaveTextContent('Secteur « Industrials » absent du portefeuille : améliore la diversification.')
    expect(within(wm).getByText('Compatible')).toBeInTheDocument()

    await userEvent.click(within(wm).getByRole('button', { name: 'Ajouter WM au portefeuille' }))
    expect(screen.getByRole('heading', { level: 2, name: 'Titres (12)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Poids de WM')).toHaveValue(5)
    expect(readPortfolio('robert').some((holding) => holding.ticker === 'WM')).toBe(true)
  })

  it('edits a weight, removes a title and keeps the changes for the profile', async () => {
    const calls = renderPortfolio()
    await screen.findByRole('region', { name: 'Constats' })

    const weight = screen.getByLabelText('Poids de PLTR')
    await userEvent.clear(weight)
    await userEvent.type(weight, '4')
    await userEvent.click(screen.getByRole('button', { name: 'Retirer KO' }))

    expect(screen.getByRole('heading', { level: 2, name: 'Titres (10)' })).toBeInTheDocument()
    expect(screen.getByText(/Total des poids saisis : 84/)).toBeInTheDocument()
    const stored = readPortfolio('robert')
    expect(stored.find((holding) => holding.ticker === 'PLTR')?.weight).toBe(4)
    expect(stored.some((holding) => holding.ticker === 'KO')).toBe(false)
    // The analysis is asked again once the typing pauses.
    await vi.waitFor(
      () => {
        const bodies = analyzeBodies(calls)
        const last = bodies[bodies.length - 1]
        expect(last.holdings.find((holding: { ticker: string }) => holding.ticker === 'PLTR').weight).toBe(4)
        expect(last.holdings).toHaveLength(10)
      },
      { timeout: 3000 },
    )

    await userEvent.click(screen.getByRole('button', { name: /Revenir à l'exemple/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'Titres (11)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Poids de PLTR')).toHaveValue(12)
  })

  it('adds a title from the search, leaving out the ones already held', async () => {
    renderPortfolio()
    await screen.findByRole('region', { name: 'Constats' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Ajouter un titre au portefeuille' }), 'ry')
    const results = within(await screen.findByRole('list', { name: 'Titres à ajouter' }))
    // RY.TO is already in Robert's portfolio.
    expect(results.queryByRole('button', { name: 'Ajouter RY.TO' })).not.toBeInTheDocument()
    await userEvent.click(results.getByRole('button', { name: 'Ajouter RYN' }))

    expect(screen.getByLabelText('Poids de RYN')).toHaveValue(5)
    expect(screen.getByRole('searchbox', { name: 'Ajouter un titre au portefeuille' })).toHaveValue('')
  })

  it('lets the profile set its own score weights on the mixing desk, always summing to 100', async () => {
    const calls = renderPortfolio('robert', [json(PORTFOLIO_ROBERT), json(PORTFOLIO_ROBERT_CUSTOM)])

    const desk = within(await screen.findByRole('region', { name: /Votre score, vos pondérations/ }))
    expect(desk.getByRole('img', { name: /Table de mixage du score, six colonnes.*Rentabilité 25 %.*Croissance 15 %/ })).toBeInTheDocument()
    expect(desk.getByText('Pondérations StockLock : le score est celui de la table des scores.')).toBeInTheDocument()
    expect(desk.getByRole('button', { name: /Pondérations StockLock/ })).toBeDisabled()

    await userEvent.click(desk.getByRole('button', { name: 'Plus de poids pour Croissance' }))
    await userEvent.click(desk.getByRole('button', { name: 'Plus de poids pour Croissance' }))

    // Growth goes from 15 to 25; the five others give way in proportion.
    const weights = readScoreSetup('robert').weights
    expect(weights.croissance).toBe(25)
    expect(Object.values(weights).reduce((total, value) => total + value, 0)).toBeCloseTo(100, 5)
    expect(weights.rentabilite).toBeLessThan(25)
    expect(desk.getByText('Croissance :').parentElement).toHaveTextContent('25 %')

    // The analysis is asked again with these weights, and the line says what changed.
    await vi.waitFor(
      () => {
        const bodies = analyzeBodies(calls)
        expect(bodies[bodies.length - 1].weights.croissance).toBeCloseTo(25, 1)
      },
      { timeout: 3000 },
    )
    expect(await desk.findByText(/UNP passe de 69 à 75 car vous valorisez davantage « croissance »\./)).toBeInTheDocument()

    // Suggestions follow, with how the weights moved their rank.
    const suggestions = within(screen.getByRole('region', { name: 'Suggestions' }))
    expect(await suggestions.findByText('Vos pondérations le font passer du 22e au 9e rang (+13 places).')).toBeInTheDocument()

    // Back to StockLock's weights.
    await userEvent.click(desk.getByRole('button', { name: /Pondérations StockLock/ }))
    expect(readScoreSetup('robert').weights.croissance).toBe(15)
    expect(window.localStorage.getItem('stocklock.scoreWeights.robert')).toBeNull()
  })

  it('switches an indicator off inside its factor', async () => {
    const calls = renderPortfolio()

    const desk = within(await screen.findByRole('region', { name: /Votre score, vos pondérations/ }))
    const momentum = desk.getByRole('button', { name: 'Rendement 12 mois sauf le dernier' })
    expect(momentum).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(momentum)

    expect(momentum).toHaveAttribute('aria-pressed', 'false')
    expect(readScoreSetup('robert').excluded).toEqual(['momentum_12_1'])
    await vi.waitFor(
      () => {
        const bodies = analyzeBodies(calls)
        expect(bodies[bodies.length - 1].factors).toEqual({ excluded_indicators: ['momentum_12_1'] })
      },
      { timeout: 3000 },
    )
  })

  it('offers the suggestions as blocks waiting at the edge of the scene', async () => {
    renderPortfolio()

    expect(await screen.findByRole('img', { name: /Suggestions en attente : WM\./ })).toBeInTheDocument()
    expect(screen.getByText(/hors de la scène pour le\s+retirer ; les blocs bas au bord sont des suggestions/)).toBeInTheDocument()
  })

  it('opens each profile on its own holdings', async () => {
    storePortfolio('amira', [{ ticker: 'NVDA', weight: 60 }, { ticker: 'BTC-USD', weight: 40 }])
    const calls = renderPortfolio('amira')

    expect(await screen.findByText('Profil de Amira')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Titres (2)' })).toBeInTheDocument()
    expect(screen.getByLabelText('Poids de BTC-USD')).toHaveValue(40)
    await screen.findByRole('region', { name: 'Constats' })
    expect(analyzeBodies(calls)[0].persona_id).toBe('amira')
  })

  it('explains an analysis that fails and keeps the holdings editable', async () => {
    renderPortfolio('robert', [json({ detail: 'Yahoo Finance indisponible : limite de débit' }, 503)])

    expect(await screen.findByRole('alert', undefined, { timeout: 4000 })).toHaveTextContent(
      'Analyse du portefeuille indisponible : Yahoo Finance indisponible : limite de débit',
    )
    expect(screen.getByLabelText('Poids de PLTR')).toHaveValue(12)
  })
})
