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

  it('starts with the essentials: one tile per account, three golden rules and facts', async () => {
    renderAccounts()

    expect(await screen.findByRole('heading', { name: "Les 4 comptes en un coup d'œil" })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: "L'essentiel" })).toHaveAttribute('aria-selected', 'true')

    const celi = screen.getByRole('heading', { name: 'CELI' }).closest('li') as HTMLElement
    expect(within(celi).getByText(money(7000))).toBeInTheDocument()
    expect(within(celi).getByRole('list', { name: 'Impôt dans le CELI' })).toHaveTextContent('Au retrait :Libre d\'impôt')
    expect(within(celi).getByRole('link', { name: 'Tout savoir sur le CELI' })).toHaveAttribute(
      'href',
      '/comptes?onglet=comptes&compte=CELI',
    )
    expect(screen.getByRole('link', { name: 'Tout savoir sur le compte non enregistré' })).toBeInTheDocument()

    const rules = screen.getByRole('region', { name: "3 règles d'or" })
    expect(within(rules).getAllByRole('listitem')).toHaveLength(3)
    const facts = screen.getByRole('region', { name: 'Le saviez-vous ?' })
    expect(facts).toHaveTextContent(`${money(109000)}de droits CELI cumulés`)
    expect(facts).toHaveTextContent(`${money(100000)}de mise de fonds par personne`)
  })

  it('details one account: use cases, place in the order and its frequently asked questions', async () => {
    renderAccounts('/comptes?onglet=comptes&compte=REER')

    const reer = await screen.findByRole('article', { name: 'REER' })
    expect(screen.getByRole('tab', { name: 'REER' })).toHaveAttribute('aria-selected', 'true')
    expect(within(reer).getByText("Baisser l'impôt d'une bonne année")).toBeInTheDocument()
    expect(within(reer).getByText(/1er choix si votre taux d’imposition actuel dépasse/)).toBeInTheDocument()

    const question = within(reer).getByRole('button', { name: "Le remboursement d'impôt du REER, c'est un cadeau ?" })
    expect(question).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(question)
    expect(question).toHaveAttribute('aria-expanded', 'true')
    expect(within(reer).getByText(/Non, c'est un report/)).toBeVisible()

    await userEvent.click(screen.getByRole('tab', { name: 'CELIAPP' }))
    expect(await screen.findByRole('article', { name: 'CELIAPP' })).toHaveTextContent(money(40000))
  })

  it('recommends the profile’s order, its situation and the decision path', async () => {
    renderAccounts('/comptes?onglet=choisir')

    const order = await screen.findByRole('heading', { name: "L'ordre conseillé pour Amira" })
    const steps = within(order.closest('section') as HTMLElement).getAllByText(/^Étape \d :$/)
    expect(steps.map((step) => step.parentElement?.textContent)).toEqual([
      'Étape 1 : CELIAPP',
      'Étape 2 : REER',
      'Étape 3 : CELI',
      'Étape 4 : Non enregistré',
    ])
    expect(screen.getByText('Situation de Amira').closest('li')).toHaveTextContent('J’achète ma première maison')
    expect(screen.getByText("Un fonds d'urgence").closest('li')).toHaveTextContent('CELI')
    expect(screen.getAllByText('Votre réponse')).toHaveLength(2)
  })

  it('compares the rules with charts computed at the profile’s rates', async () => {
    renderAccounts('/comptes?onglet=comparer')

    expect(
      await screen.findByText(/Pour Amira \(36,1 % aujourd'hui, 25,7 % prévu à la retraite\) : le REER laisse/),
    ).toBeInTheDocument()
    expect(screen.getByText(`Au taux de Amira, 1 000 $ d'intérêts coûtent ${money(361)} d'impôt, contre ${money(164)} pour des dividendes canadiens.`)).toBeInTheDocument()
    expect(screen.getByText(/Amira a cumulé 57.000 \$ de droits CELI depuis 2018/)).toBeInTheDocument()
    expect(screen.getByText(/Jusqu'à 100.000 \$ par personne pour une première maison/)).toBeInTheDocument()

    expect(screen.getByRole('row', { name: /Dividendes américains/ })).toHaveTextContent('PerdueExemptéePerdueRécupérée')
    expect(screen.getByRole('row', { name: /Obligations et intérêts/ })).toHaveTextContent('Peu adapté')
  })

  it('answers frequently asked questions in dropdowns', async () => {
    renderAccounts('/comptes?onglet=faq')

    expect(await screen.findByRole('heading', { name: 'Questions fréquentes' })).toBeInTheDocument()
    for (const group of ['Les bases', 'CELI', 'REER', 'CELIAPP', 'Placements et impôt']) {
      expect(screen.getByRole('heading', { name: group, level: 3 })).toBeInTheDocument()
    }
    const question = screen.getByRole('button', { name: "Un CELI, c'est un compte d'épargne ?" })
    await userEvent.click(question)
    expect(screen.getByText(/Non, c'est une enveloppe/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'Source : ARC' })).toHaveAttribute('href', 'https://www.canada.ca/tfsa')
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
