import { expect, nav, openAs, scene, test } from './support/app'

test.describe('Du tableau de bord à la fiche titre', () => {
  test('Robert cherche le titre médiatisé, lit le verdict, le score, le battage, puis prend du recul', async ({ page, api }) => {
    await openAs(page, 'robert')
    await page.getByRole('searchbox', { name: 'Rechercher un titre par nom ou symbole' }).fill('pltr')
    const results = page.getByRole('region', { name: 'Résultats de la recherche' })
    await results.getByRole('link', { name: /PLTR/ }).click()

    await expect(page).toHaveURL(/\/titres\/PLTR$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Palantir Technologies Inc.' })).toBeVisible({ timeout: 15_000 })

    // « Pour Robert » : the verdict and its reasons.
    const fit = page.getByRole('region', { name: /Pour Robert/ })
    await expect(fit.getByText('Hors profil', { exact: true })).toBeVisible()

    // Step 1: the score, its 3D construction and the same numbers as a list.
    const score = page.locator('#score')
    await expect(score.getByRole('heading', { level: 2 })).toContainText('Score')
    await expect(scene(page, /Le score en construction : six piliers/)).toBeVisible()
    await expect(score.getByText('Rentabilité', { exact: true }).first()).toBeVisible()

    // Step 4: the hype signal is high; pointing at what tempts fills the decision to examine.
    const recul = page.locator('#prendre-du-recul')
    await expect(recul.getByText(/Battage élevé/).first()).toBeVisible()
    await expect(scene(page, /Le signal de battage en champ de tuiles/)).toBeVisible()
    const why = recul.getByLabel('Pourquoi envisagez-vous cette décision ?')
    // The form is already proposed with the tempted buyer's case.
    await expect(why).not.toHaveValue('')
    await recul.getByRole('list', { name: 'Composantes du signal' }).getByRole('button').first().click()
    await expect(why).toHaveValue(/volume échangé|Le titre s’échange/i)
    await expect(recul.getByRole('radio', { name: 'Acheter' })).toBeChecked()

    await recul.getByRole('button', { name: 'Analyser ma décision' }).click()
    await expect(recul.getByText('peur de manquer la hausse')).toBeVisible()
    const sent = api.calls.find((call) => call.path === '/api/bias/stock')
    expect(sent?.body).toMatchObject({ persona_id: 'robert', ticker: 'PLTR', intent: 'buy' })

    // Step 3: which account, as towers and as numbers.
    const account = page.locator('#compte')
    await account.scrollIntoViewIfNeeded()
    await expect(scene(page, /Les comptes en tours après \d+ ans/)).toBeVisible()
    await expect(account.getByText(/donne le montant après impôt le plus élevé/)).toBeVisible()
  })

  test('Amira cherche une cryptomonnaie et ouvre sa fiche, sans score', async ({ page }) => {
    await openAs(page, 'amira')
    await page.getByRole('searchbox', { name: 'Rechercher un titre par nom ou symbole' }).fill('bit')
    const results = page.getByRole('region', { name: 'Résultats de la recherche' })
    const bitcoin = results.getByRole('link', { name: /BTC-USD/ })
    await expect(bitcoin).toContainText('Cryptomonnaie')
    await bitcoin.click()

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('region', { name: /Pour Amira/ })).toBeVisible()
    await expect(page.locator('#score').getByText(/n'a pas encore de score/)).toBeVisible()
  })

  test('une recherche sans résultat le dit, et la vider ramène les sections', async ({ page }) => {
    await openAs(page, 'amira')
    const search = page.getByRole('searchbox', { name: 'Rechercher un titre par nom ou symbole' })
    await search.fill('qqqqq')
    await expect(page.getByText('Aucun titre ne correspond à « qqqqq ».')).toBeVisible()
    await search.fill('')
    await expect(page.getByRole('heading', { level: 2, name: 'IA et semi-conducteurs' })).toBeVisible()
  })

  test('« Comprendre » : expliquer les mouvements dessine le ruban et liste les mouvements marquants', async ({ page }) => {
    await openAs(page, 'mateo', '/titres/NVDA')
    const moves = page.locator('#comprendre')
    await moves.getByRole('button', { name: 'Expliquer les mouvements' }).click({ timeout: 15_000 })
    await expect(scene(page, /La période en ruban de tuiles/)).toBeVisible()
    await expect(moves.getByRole('heading', { name: 'Mouvements marquants' })).toBeVisible()
    // The keyboard path through the ribbon: walk from one marked move to the next.
    await moves.getByRole('button', { name: 'Mouvement suivant' }).click()
    await expect(moves.getByText(/^Séance du /)).toBeVisible()
  })

  test('le score personnel suit les pondérations réglées dans « Mon portefeuille »', async ({ page }) => {
    await openAs(page, 'robert', '/titres/AAPL')
    const score = page.locator('#score')
    await expect(score.getByText('Ce score suit les pondérations de StockLock.')).toBeVisible({ timeout: 15_000 })
    await score.getByRole('link', { name: 'Régler vos propres pondérations' }).click()

    await expect(page).toHaveURL(/\/portefeuille$/)
    const desk = page.getByRole('region', { name: /Votre score, vos pondérations/ })
    await desk.getByRole('button', { name: 'Plus de poids pour Valorisation' }).click()
    await desk.getByRole('button', { name: 'Plus de poids pour Valorisation' }).click()
    await expect(desk.getByText('Valorisation :').locator('..')).toContainText('25 %')

    await nav(page, 'Tableau de bord').click()
    await page.goto('/titres/AAPL', { waitUntil: 'domcontentloaded' })
    const personal = page.locator('#score').getByText('Votre score', { exact: true }).locator('..')
    await expect(personal).toBeVisible({ timeout: 15_000 })
    // AAPL is weak on valuation (31): more weight on it lowers its score.
    await expect(personal).toContainText(/− ?[\d,]+ pts? par rapport à StockLock/)
    await expect(scene(page, /et la tour de votre score/)).toBeVisible()
  })

  test('un titre inconnu l’explique, une adresse inconnue ramène au tableau de bord', async ({ page }) => {
    await openAs(page, 'amira', '/titres/ZZZZ')
    await expect(page.getByRole('alert')).toContainText(/ZZZZ|introuvable|inconnu/i, { timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Tableau de bord/ }).first()).toBeVisible()

    await page.goto('/cette-page-n-existe-pas', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText('Bonjour Amira')).toBeVisible()
  })
})
