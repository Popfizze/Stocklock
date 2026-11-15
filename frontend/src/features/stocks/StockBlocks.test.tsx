import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders } from '@/test/render'
import { json } from '@/test/mockFetch'
import { ESG_NONE, FIT_PLTR_ROBERT, FIT_XOM_MATEO, HYPE_AAPL_LOW, HYPE_PLTR_HIGH } from '@/test/persona'
import { mockStockPage } from '@/test/stockPage'
import { BTC_1M, NVDA_1M } from '@/test/stocks'
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

const region = async (name: string) => within(await screen.findByRole('region', { name }))

/** The value next to a label of a definition list. */
const figure = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
  vi.restoreAllMocks()
})

describe('StockPage blocks', () => {
  it('shows a calm hype signal with its three components and leaves the bias form empty', async () => {
    mockStockPage(NVDA_1M)
    renderStock('NVDA')

    const recul = await region('Prendre du recul')
    expect(await recul.findByText('Battage faible')).toHaveTextContent('0 point sur 6')
    const components = within(recul.getByRole('list', { name: 'Composantes du signal' })).getAllByRole('listitem')
    expect(components).toHaveLength(3)
    expect(components[0]).toHaveTextContent('Volume échangé')
    expect(components[0]).toHaveTextContent('0 point sur 2')
    expect(components[0]).toHaveTextContent(HYPE_AAPL_LOW.components[0].message)
    expect(components[2]).toHaveTextContent('Non évalué')
    expect(figure('Rendement sur 1 mois')).toHaveTextContent('+5,40 %')
    expect(figure('Rendement sur 1 mois')).toHaveClass('text-success')
    expect(figure('Volatilité sur 1 an')).toHaveTextContent('26,2 %')
    expect(figure('Volume moyen, 3 mois')).toHaveTextContent('42,8 M')
    expect(recul.getByText(/Données au 13 novembre 2026 · Attention médiatique : non évaluée/)).toBeInTheDocument()

    // The signal as a field of tiles, one band per component.
    expect(recul.getByRole('img', { name: /Le signal de battage en champ de tuiles/ })).toHaveAccessibleName(
      /Volume échangé 0 point sur 2, Hausse sur un mois 0 point sur 2, Attention médiatique non évalué/,
    )

    const message = recul.getByLabelText('Pourquoi envisagez-vous cette décision ?')
    expect(message).toHaveValue('')
    expect(recul.getByRole('radio', { name: 'Acheter' })).not.toBeChecked()
    expect(recul.queryByRole('note')).not.toBeInTheDocument()

    // Pointing at what tempts words the intention; it stays free text.
    await userEvent.click(within(components[0]).getByRole('button', { name: 'C’est ce qui me tente' }))
    expect(recul.getByRole('note')).toHaveTextContent('Vous avez désigné « Volume échangé ».')
    expect(recul.getByRole('radio', { name: 'Acheter' })).toBeChecked()
    expect(recul.getByLabelText<HTMLTextAreaElement>('Pourquoi envisagez-vous cette décision ?').value).toMatch(
      /^Le volume échangé est à 1,2 fois sa moyenne/,
    )
    expect(within(components[0]).getByRole('button', { name: 'C’est ce qui me tente' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('spells a high hype out for the profile and proposes the tempted buyer’s case to the bias analysis', async () => {
    const calls = mockStockPage(NVDA_1M, { fit: json(FIT_PLTR_ROBERT), hype: json(HYPE_PLTR_HIGH) }, [
      { match: '/api/bias/stock', responses: [json({ detail: 'Analyse arrêtée pour le test.' }, 503)] },
    ])
    renderStock('NVDA', 'robert')

    const recul = await region('Prendre du recul')
    expect(await recul.findByText('Battage élevé')).toHaveTextContent('5 points sur 6')
    expect(figure('Volume, dernière séance')).toHaveTextContent('182,4 M')
    expect(recul.getByText('Source média :')).toBeInTheDocument()
    expect(recul.getByText(/fenêtre de 90 jours/)).toBeInTheDocument()
    expect(recul.getByText(/Le battage décrit un contexte de marché observé/)).toBeInTheDocument()
    const forRobert = within(recul.getByRole('list', { name: 'Le battage pour Robert' })).getAllByRole('listitem')
    expect(forRobert).toHaveLength(1)
    expect(forRobert[0]).toHaveTextContent('Attention : Battage élevé (5 points sur 6)')

    expect(recul.getByRole('note')).toHaveTextContent('Battage élevé sur NVDA.')
    expect(recul.getByRole('radio', { name: 'Acheter' })).toBeChecked()
    const message = `Le titre a pris 38,2${NBSP}% en un mois et on en parle partout : j’ai peur de manquer la hausse si je n’achète pas maintenant.`
    expect(recul.getByLabelText('Pourquoi envisagez-vous cette décision ?')).toHaveValue(message)

    await userEvent.click(recul.getByRole('button', { name: 'Analyser ma décision' }))
    expect(await recul.findByText(/Analyse arrêtée pour le test\./)).toBeInTheDocument()
    const request = calls.find((call) => call.url.includes('/api/bias/stock'))
    expect(JSON.parse(String(request?.init.body))).toEqual({
      persona_id: 'robert',
      ticker: 'NVDA',
      message,
      intent: 'buy',
    })
  })

  it('says why the hype signal is missing and still offers the bias analysis', async () => {
    mockStockPage(NVDA_1M, { hype: json({ detail: 'Yahoo Finance ne répond pas.' }, 503) })
    renderStock('NVDA')

    const recul = await region('Prendre du recul')
    expect(await recul.findByRole('alert')).toHaveTextContent('Signal de battage : Yahoo Finance ne répond pas.')
    expect(recul.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument()
    expect(recul.getByRole('button', { name: 'Analyser ma décision' })).toBeDisabled()
    const brief = within(screen.getByRole('navigation', { name: 'En bref' }))
    expect(brief.getByRole('link', { name: /Battage/ })).toHaveTextContent('Indisponible')
  })

  it('projects the title after tax in each account for the active profile, at the level of detail asked', async () => {
    const calls = mockStockPage(NVDA_1M)
    renderStock('NVDA')

    const account = await region("L'impôt selon le compte")
    expect(await account.findByText(/le REER donne le montant après impôt le plus élevé/)).toBeInTheDocument()
    const request = calls.find((call) => call.url.endsWith('/api/accounts/projection'))
    expect(JSON.parse(String(request?.init.body))).toEqual({
      persona_id: 'amira',
      ticker: 'NVDA',
      annual_contribution: 7000,
      years: 15,
    })
    expect(account.getByRole('link', { name: 'Voir la projection en chiffres dans Comptes' })).toHaveAttribute(
      'href',
      '/comptes?vue=chiffres&titre=NVDA',
    )

    // The accounts as towers, at once.
    expect(account.getByRole('img', { name: /Les comptes en tours après 3 ans/ })).toBeInTheDocument()

    // Simple by default; the profile checks come with the next level.
    expect(account.getByRole('radio', { name: 'Simple' })).toHaveAttribute('aria-checked', 'true')
    expect(account.queryByText(/Volatilité historique de 18 % supérieure au maximum du profil/)).not.toBeInTheDocument()
    await userEvent.click(account.getByRole('radio', { name: 'Normale' }))
    expect(account.getByText(/Volatilité historique de 18 % supérieure au maximum du profil/)).toBeInTheDocument()
  })

  it('says why the account projection failed', async () => {
    mockStockPage(NVDA_1M, { account: json({ detail: "Titre 'NVDA' absent du jeu de départ AlphaForge." }, 422) })
    renderStock('NVDA')

    const account = await region("L'impôt selon le compte")
    expect(await account.findByRole('alert')).toHaveTextContent("Titre 'NVDA' absent du jeu de départ AlphaForge.")
  })

  it('shows the ESG risk, the controversies and what they mean for an ESG profile', async () => {
    mockStockPage(NVDA_1M, { fit: json(FIT_XOM_MATEO) })
    renderStock('NVDA', 'mateo')

    const esg = await region('ESG et controverses')
    expect(await esg.findByText('Risque ESG faible (15 à 20)')).toBeInTheDocument()
    expect(esg.getByText('Controverse de niveau 3 sur 5 (significative)')).toBeInTheDocument()
    const forMateo = within(esg.getByRole('list', { name: 'Les critères ESG pour Mateo' })).getAllByRole('listitem')
    expect(forMateo.map((item) => item.textContent)).toEqual([
      'Attention : Risque ESG élevé (30 à 35) : au-dessus de 30, à vérifier pour un profil ESG.',
      'Conforme : Controverse de niveau 2 sur 5 (modérée) : sous le seuil de 4.',
    ])
    expect(esg.getByRole('link', { name: 'Apple faces EU antitrust fine over App Store rules' })).toHaveAttribute(
      'href',
      'https://finance.yahoo.com/news/apple-eu-fine',
    )
    expect(esg.getByText(/10 novembre 2026 · Reuters/)).toBeInTheDocument()
    expect(esg.getByText('mot-clé : antitrust')).toBeInTheDocument()
    expect(esg.getByText(/Source : Yahoo Finance \(filtre de titres, données ESG Sustainalytics\)/)).toBeInTheDocument()

    // The excluded sector leads the verdict, and the summary line flags the ESG block.
    const verdict = await region('Pour Mateo')
    expect(verdict.getByText('Hors profil pour Mateo : secteur « Energy » exclu.')).toBeInTheDocument()
    const brief = within(screen.getByRole('navigation', { name: 'En bref' }))
    expect(brief.getByRole('link', { name: /Risque ESG/ })).toHaveTextContent('À vérifier : Faible')
  })

  it('says so when no ESG data exists for the title', async () => {
    mockStockPage(NVDA_1M, { esg: json(ESG_NONE) })
    renderStock('NVDA')

    const esg = await region('ESG et controverses')
    expect(await esg.findByText('Données ESG non disponibles')).toBeInTheDocument()
    expect(esg.getByText(/Aucune donnée ESG chez Yahoo Finance pour XIU\.TO/)).toBeInTheDocument()
    expect(esg.getByText(/Aucune manchette récente ne contient de mot-clé de controverse/)).toBeInTheDocument()
    const brief = within(screen.getByRole('navigation', { name: 'En bref' }))
    expect(brief.getByRole('link', { name: /Risque ESG/ })).toHaveTextContent('Non disponible')
  })

  it('lists the key figures and the dividends', async () => {
    mockStockPage(NVDA_1M)
    renderStock('NVDA')
    await screen.findByRole('heading', { level: 1, name: 'NVIDIA' })

    // The year as a strip of tiles and the dividends as a timeline; the figures stay in the page.
    expect(screen.getByRole('img', { name: /Le dernier cours, 166,19\s\$\sUS, dans sa fourchette de 52 semaines, de 148,80\s\$\sUS à 243,37\s\$\sUS/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /2 dividendes en colonnes, du 5 mars 2024 au 10 septembre 2026/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

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

    const dividends = within(screen.getByRole('region', { name: 'Dividendes' })).getAllByRole('listitem')
    expect(dividends.map((item) => item.textContent)).toEqual([
      `10 septembre 2026${'0,25'}${NBSP}$${NBSP}US`,
      `5 mars 2024${'0,004'}${NBSP}$${NBSP}US`,
    ])
  })

  it('says « Aucun dividende » for an asset that pays none', async () => {
    mockStockPage(BTC_1M)
    renderStock('BTC-USD')

    expect(await screen.findByText('Aucun dividende')).toBeInTheDocument()
    expect(figure('Rendement du dividende (12 mois)')).toHaveTextContent('—')
    expect(figure('Catégorie')).toHaveTextContent('Cryptoactifs')
    // A cryptocurrency has no sector: the header keeps to its class.
    expect(screen.getByText('Cryptoactifs', { selector: 'p' })).toBeInTheDocument()
  })
})
