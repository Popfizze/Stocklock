import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
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

const flow = () => screen.getByRole('figure', { name: "Le parcours de l'argent dans chaque compte" })
const lanes = () => within(flow()).getByRole('list', { name: 'Un parcours par compte' })

/** Wording that would advise, rather than inform. */
const ADVICE = /conseillé|recommandé|devriez|meilleur|idéal|privilégiez|plus avantageux|1er choix|en premier/i

describe('AccountsPage', () => {
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('opens on the path of the money, in the simple view, without a single figure', async () => {
    renderAccounts()

    expect(await screen.findByRole('heading', { name: "Le parcours de l'argent" })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Le parcours' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Simple' })).toHaveAttribute('aria-checked', 'true')

    const [celi, reer, celiapp, taxable] = within(lanes()).getAllByRole('listitem')
    expect(celi).toHaveTextContent(/^CELI/)
    expect(celi).toHaveTextContent('Quand on retireSans impôt (Avantage fiscal)')
    expect(reer).toHaveTextContent('Imposé (Impôt ou perte)')
    expect(await within(celiapp).findByText('Amira : admissible')).toBeInTheDocument()
    expect(taxable).toHaveTextContent(/^Non enregistré/)

    // Simple: words only. The figures and explanations wait for the higher levels.
    for (const name of ["Le parcours de l'argent", 'À retenir', 'Chaque compte en détail']) {
      const section = screen.getByRole('heading', { name }).closest('section') as HTMLElement
      expect(section.textContent).not.toMatch(/\d/)
    }
    expect(screen.queryByText('Chaque retrait est imposé comme un salaire.')).not.toBeInTheDocument()
  })

  it('draws each reading view in 3D too, with the same facts in its label', async () => {
    renderAccounts()
    // Le parcours: a building per account; the ceiling's figure stays out of the Simple level.
    const buildings = await screen.findByRole('img', { name: /Les comptes en immeubles de trois étages/ })
    expect(buildings).toHaveAccessibleName(/REER : quand on verse, réduit l'impôt \(avantage fiscal\).*quand on retire, imposé \(impôt ou perte\) ; plafond de cotisation/)
    expect(buildings).toHaveAccessibleName(/Non enregistré : .*aucun plafond/)
    expect(buildings.textContent).not.toMatch(/\$/)

    await userEvent.click(screen.getByRole('radio', { name: 'Côte à côte' }))
    expect(await screen.findByRole('img', { name: /Ce que chaque compte permet, en relief.*CELI : 5 oui, 0 en partie ; REER : 4 oui, 1 en partie/ })).toBeInTheDocument()

    // Par objectif: the scene follows the goal opened in the list, and never ranks the accounts.
    await userEvent.click(screen.getByRole('radio', { name: 'Par objectif' }))
    const paths = await screen.findByRole('img', { name: /Le chemin d'un objectif vers les comptes.*sans ordre de préférence : « Garder de l'argent disponible » mène à CELI/ })
    await userEvent.click(screen.getByRole('button', { name: /Réduire l'impôt de l'année/ }))
    expect(paths).toHaveAccessibleName(/« Réduire l'impôt de l'année » mène à CELI \(aucune déduction\), REER \(cotisation déductible\), CELIAPP/)
  })

  it('adds explanations, then figures and sources, as the level of detail goes up', async () => {
    renderAccounts()
    await screen.findByRole('heading', { name: "Le parcours de l'argent" })

    await userEvent.click(screen.getByRole('radio', { name: 'Normale' }))
    expect(within(flow()).getByText('Chaque retrait est imposé comme un salaire.')).toBeInTheDocument()
    expect(within(flow()).queryByText(`Plafond 2026 : ${money(7000)}`)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Complexe' }))
    expect(within(flow()).getByText(`Plafond 2026 : ${money(7000)}`)).toBeInTheDocument()
    const facts = screen.getByRole('heading', { name: 'Le saviez-vous ?' }).closest('section') as HTMLElement
    expect(facts).toHaveTextContent(`${money(109000)}de droits CELI cumulés`)
  })

  it('keeps each account in a dropdown, with more inside at higher levels', async () => {
    renderAccounts('/comptes?niveau=normale')

    const reer = await screen.findByRole('button', { name: /^REER ?La cotisation réduit l’impôt/ })
    expect(reer).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(reer)
    expect(reer).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('À quoi il peut servir')).toBeVisible()
    expect(screen.getByText("Réduire l'impôt d'une année")).toBeVisible()
    expect(screen.getByText('Inconvénients et contraintes')).toBeVisible()
  })

  it('filters the accounts shown, keeping at least one', async () => {
    renderAccounts()
    await screen.findByRole('heading', { name: "Le parcours de l'argent" })

    const celiapp = screen.getByRole('button', { name: 'CELIAPP', pressed: true })
    await userEvent.click(celiapp)
    expect(celiapp).toHaveAttribute('aria-pressed', 'false')
    expect(within(lanes()).getAllByRole('listitem')).toHaveLength(3)
    expect(within(flow()).queryByText('CELIAPP')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'CELIAPP', level: 3 })).not.toBeInTheDocument() // its FAQ group

    for (const name of ['REER', 'Non enregistré']) await userEvent.click(screen.getByRole('button', { name, pressed: true }))
    const celi = screen.getByRole('button', { name: 'CELI', pressed: true })
    await userEvent.click(celi)
    expect(celi).toHaveAttribute('aria-pressed', 'true')
    expect(within(lanes()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('compares side by side: what each account allows and the REER–CELI arithmetic', async () => {
    renderAccounts('/comptes?vue=comparer')

    expect(await screen.findByRole('row', { name: /Réduit l'impôt de l'année de cotisation/ })).toHaveTextContent('NonOuiOuiNon')
    expect(screen.getByText("Le taux d'imposition au retrait, comparé à celui d'aujourd'hui, est…")).toBeInTheDocument()
    expect(screen.queryByText('Cas de Amira')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Selon ce que verse le placement' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Normale' }))
    expect((await screen.findByText('Cas de Amira')).closest('li')).toHaveTextContent('Plus bas')
    expect(screen.getByRole('row', { name: /Intérêts/ })).toHaveTextContent('Imposés en entier, chaque année')
  })

  it('shows the rules’ figures and charts at the profile’s rates in the complex view', async () => {
    renderAccounts('/comptes?vue=comparer&niveau=complexe')

    expect(
      await screen.findByText(/Pour Amira \(36,1 % aujourd'hui, 25,7 % prévu à la retraite\) : le REER laisse/),
    ).toBeInTheDocument()
    expect(screen.getByText(`Au taux de Amira, 1 000 $ d'intérêts coûtent ${money(361)} d'impôt, contre ${money(164)} pour des dividendes canadiens.`)).toBeInTheDocument()
    expect(screen.getByText(/Amira a cumulé 57.000 \$ de droits CELI depuis 2018/)).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /^Retenue américaine \(15/ })).toHaveTextContent('PerdueExemptéePerdueRécupérée par crédit')
  })

  it('lists goals with the accounts whose rules apply, each in a dropdown', async () => {
    renderAccounts('/comptes?vue=objectifs&niveau=normale')

    const cash = await screen.findByRole('button', { name: /Garder de l'argent disponible/ })
    await userEvent.click(cash)
    expect(screen.getByText('Retrait sans impôt, en tout temps')).toBeVisible()
    expect(screen.getByText('Retrait possible mais imposé')).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: /Acheter une première propriété/ }))
    expect(screen.getByText(/Jusqu'à 100.000 \$ par personne pour une première maison/)).toBeInTheDocument()
  })

  it('projects 15 years in figures, with more inputs at higher levels', async () => {
    const second = { ...PROJECTION, comparison: { headline: 'Avec 150 000 $ de revenu.', accounts: [] } }
    const calls = renderAccounts('/comptes?vue=chiffres', [json(PROJECTION), json(second)])

    expect(await screen.findByText(PROJECTION.comparison.headline)).toBeInTheDocument()
    expect(projectionBodies(calls)[0]).toEqual({ persona_id: 'amira', annual_contribution: 7000, years: 15, expected_return: 0.05 })
    expect(screen.queryByLabelText('Montant annuel avant impôt ($)')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dans 3 ans, après impôt' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Complexe' }))
    const legend = screen.getAllByRole('list', { name: 'Légende' })[0]
    expect(within(legend).getAllByRole('listitem')[0]).toHaveTextContent(`CELI${money(14808)}`) // fixed order, not a ranking
    const income = screen.getByLabelText('Revenu annuel ($)')
    expect(income).toHaveAttribute('placeholder', '62000')
    await userEvent.type(income, '150 000')
    expect(await screen.findByText('Avec 150 000 $ de revenu.')).toBeInTheDocument()
    const bodies = projectionBodies(calls)
    expect(bodies[bodies.length - 1]).toMatchObject({ persona_id: 'amira', income: 150000 })

    await userEvent.clear(screen.getByLabelText('Durée (années)'))
    await userEvent.type(screen.getByLabelText('Durée (années)'), '2,5')
    expect(screen.getByText('Un nombre entier d’années, de 1 à 50.')).toBeInTheDocument()
  })

  it('projects one stock picked in the figures view, its facts in dropdowns', async () => {
    const calls = renderAccounts('/comptes?vue=chiffres&niveau=normale&titre=JNJ', [json(PROJECTION), json(STOCK_PROJECTION)])

    expect(await screen.findByText(STOCK_PROJECTION.comparison.headline)).toBeInTheDocument()
    expect(projectionBodies(calls)).toContainEqual({ persona_id: 'amira', ticker: 'JNJ', annual_contribution: 7000, years: 15 })
    expect(screen.getByRole('radio', { name: 'Un titre précis' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('combobox', { name: 'Titre' })).toHaveTextContent('JNJ — Johnson & Johnson')
    expect(screen.getByRole('region', { name: 'Contrôle de profil' })).toHaveTextContent('Volatilité historique de 18 %')

    await userEvent.click(screen.getByRole('button', { name: 'Compte par compte : avantages et inconvénients' }))
    const [reer, celi, celiapp] = within(screen.getByRole('list', { name: 'Compte par compte' })).getAllByRole('listitem').filter(
      (item) => item.parentElement?.getAttribute('aria-label') === 'Compte par compte',
    )
    expect(reer).toHaveTextContent('Montant le plus élevé')
    expect(celi).toHaveTextContent('environ 40 $ perdus')
    expect(celiapp).toHaveTextContent('Non admissible')
    await userEvent.click(screen.getByRole('button', { name: 'Ce que verse ce titre' }))
    expect(screen.getByText('Oui, 15 % (sauf REER)')).toBeVisible()
  })

  it('states facts in every view, never advice', async () => {
    for (const vue of ['parcours', 'comparer', 'objectifs', 'chiffres']) {
      renderAccounts(`/comptes?vue=${vue}&niveau=complexe`)
      await screen.findByRole('heading', { name: 'Questions fréquentes' })
      // Every dropdown open: the hidden text counts too.
      const closed = document.querySelectorAll<HTMLElement>('[data-slot="accordion-trigger"][aria-expanded="false"]')
      for (const trigger of closed) fireEvent.click(trigger)
      expect(document.body.textContent).not.toMatch(ADVICE)
      cleanup()
    }
  }, 30_000)

  it('says so in French when the server cannot be reached', async () => {
    mockFetchUnreachable()
    renderWithProviders(<AccountsPage />, { route: '/comptes', personaId: 'amira' })

    await waitFor(() => expect(screen.getAllByRole('alert')[0]).toHaveTextContent('Impossible de joindre le serveur'))
  })
})
