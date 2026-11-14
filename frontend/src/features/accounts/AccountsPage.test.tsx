import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/render'
import { json, mockFetchByUrl, mockFetchUnreachable, type MockResponse } from '@/test/mockFetch'
import { PERSONAS } from '@/test/personas'
import { ASSETS, PROJECTION, RULES, STOCK_PROJECTION } from '@/test/accounts'
import { AccountsPage } from './AccountsPage'
import { formatMoney } from './format'

/** formatMoney with plain spaces: Testing Library normalizes the DOM's no-break spaces, not the expected text. */
const money = (value: number) => formatMoney(value).replace(/\s/g, ' ')

const ORIGINAL_FETCH = globalThis.fetch

function renderAccounts(route = '/comptes', projections: MockResponse[] = [json(PROJECTION)]) {
  const calls = mockFetchByUrl([
    { match: '/api/personas', responses: [json(PERSONAS)] },
    { match: '/api/accounts/rules', responses: [json(RULES)] },
    { match: '/api/accounts/assets', responses: [json(ASSETS)] },
    { match: '/api/accounts/projection', responses: projections },
  ])
  renderWithProviders(<AccountsPage />, { route, personaId: 'amira' })
  return calls
}

const projectionBodies = (calls: Array<{ url: string; init: RequestInit }>) =>
  calls
    .filter((call) => call.url.endsWith('/api/accounts/projection'))
    .map((call) => JSON.parse(String(call.init.body)) as Record<string, unknown>)

describe('AccountsPage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('explains each account with the numbers of the versioned rules', async () => {
    renderAccounts()

    expect(await screen.findByRole('heading', { name: 'CELI' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Comptes enregistrés au Canada' })).toBeInTheDocument()
    expect(screen.getByText("Le parcours d'un dollar")).toBeInTheDocument()

    const celi = screen.getByRole('heading', { name: 'CELI' }).closest('[data-slot=card]') as HTMLElement
    expect(within(celi).getByText(money(7000))).toBeInTheDocument()
    expect(within(celi).getByText(`${money(109000)} au maximum`)).toBeInTheDocument()
    expect(within(celi).getByRole('link', { name: 'ARC' })).toHaveAttribute('href', 'https://www.canada.ca/tfsa')

    const celiapp = screen.getByRole('heading', { name: 'CELIAPP' }).closest('[data-slot=card]') as HTMLElement
    expect(within(celiapp).getByText(money(40000))).toBeInTheDocument()
    for (const name of ['REER', 'Non enregistré']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    }
  })

  it('compares the rules and highlights the active profile’s path', async () => {
    renderAccounts()
    await userEvent.click(await screen.findByRole('tab', { name: 'Comparer' }))

    const row = screen.getByRole('row', { name: /Dividendes américains/ })
    expect(row).toHaveTextContent('PerdueExemptéePerdueRécupérée')
    expect(await screen.findAllByText('Votre réponse')).toHaveLength(2)
    expect(screen.getByText(/Amira : 36,1 % aujourd'hui/)).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Obligations et intérêts/ })).toHaveTextContent('Peu adapté')
  })

  it('projects 15 years with the profile’s defaults, then recomputes on input', async () => {
    const second = { ...PROJECTION, recommendations: { headline: 'Avec 150 000 $ : le REER gagne.', accounts: [] } }
    const calls = renderAccounts('/comptes?onglet=projection', [json(PROJECTION), json(second)])

    expect(await screen.findByText(PROJECTION.recommendations.headline)).toBeInTheDocument()
    expect(projectionBodies(calls)[0]).toEqual({
      persona_id: 'amira',
      annual_contribution: 7000,
      years: 15,
      expected_return: 0.05,
    })
    // the legend carries each account's final value, best first
    const legend = screen.getByRole('list', { name: 'Légende' })
    expect(within(legend).getAllByRole('listitem')[0]).toHaveTextContent(`CELIAPP${money(23171)}`)
    expect(screen.getByText('Taux marginal actuel').nextSibling).toHaveTextContent('36,1 %')

    const income = screen.getByLabelText('Revenu annuel ($)')
    expect(income).toHaveAttribute('placeholder', '62000')
    await userEvent.type(income, '150 000')
    expect(await screen.findByText('Avec 150 000 $ : le REER gagne.')).toBeInTheDocument()
    const bodies = projectionBodies(calls)
    expect(bodies[bodies.length - 1]).toMatchObject({ persona_id: 'amira', income: 150000 })

    await userEvent.clear(screen.getByLabelText('Horizon (années)'))
    await userEvent.type(screen.getByLabelText('Horizon (années)'), '2,5')
    expect(screen.getByText('Un nombre entier d’années, de 1 à 50.')).toBeInTheDocument()
  })

  it('shows a stock’s account options from the URL', async () => {
    const calls = renderAccounts('/comptes?onglet=titre&titre=JNJ', [json(STOCK_PROJECTION)])

    expect(
      await screen.findByRole('heading', { name: 'Quel compte pour Johnson & Johnson (JNJ) ?' }),
    ).toBeInTheDocument()
    expect(projectionBodies(calls)).toContainEqual({
      persona_id: 'amira',
      ticker: 'JNJ',
      annual_contribution: 7000,
      years: 15,
    })
    expect(screen.getByText('Dividendes américains')).toBeInTheDocument()
    expect(screen.getByText('Oui, 15 % (sauf REER)')).toBeInTheDocument()

    const options = within(screen.getByRole('list', { name: 'Options de compte' }))
    const [reer, celi, celiapp] = options.getAllByRole('listitem').filter((item) => item.parentElement?.tagName === 'OL')
    expect(reer).toHaveTextContent('REER')
    expect(reer).toHaveTextContent('Le plus avantageux ici')
    expect(celi).toHaveTextContent('environ 40 $ perdus')
    expect(celiapp).toHaveTextContent('Non admissible')

    expect(screen.getByRole('region', { name: 'Contrôle de profil' })).toHaveTextContent('Volatilité historique de 18 %')
    expect(screen.getByRole('combobox', { name: 'Titre' })).toHaveTextContent('JNJ — Johnson & Johnson')
  })

  it('says so in French when the server cannot be reached', async () => {
    mockFetchUnreachable()
    renderWithProviders(<AccountsPage />, { route: '/comptes', personaId: 'amira' })

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Impossible de joindre le serveur'),
    )
  })
})
