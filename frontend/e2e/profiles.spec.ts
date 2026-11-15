import { expect, nav, openAs, scene, test, type PersonaId, sceneTag } from './support/app'

/** What each profile must find first on its dashboard: its own sections, read with its own limits. */
const PROFILES: Array<{ id: PersonaId; name: string; firstSection: string; reason: RegExp; maxPosition: string }> = [
  { id: 'amira', name: 'Amira', firstSection: 'IA et semi-conducteurs', reason: /Préférence « IA »/, maxPosition: '25 %' },
  { id: 'mateo', name: 'Mateo', firstSection: 'Faible risque ESG', reason: /Préférence « ESG » de Mateo/, maxPosition: '15 %' },
  { id: 'robert', name: 'Robert', firstSection: 'Dividendes réguliers', reason: /revenu de retraite/, maxPosition: '10 %' },
]

test.describe('Choisir un profil', () => {
  test('sans profil, toute page ramène au choix du profil', async ({ page }) => {
    await page.goto('/portefeuille', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/choisir-profil$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Choisir un profil' })).toBeVisible()
    // One card per profile, each with its 3D sculpture and its plain reading.
    for (const { name } of PROFILES) {
      await expect(page.getByRole('button', { name: `Choisir le profil ${name}` })).toBeVisible()
      await expect(scene(page, new RegExp(`Profil de ${name} en tuiles`))).toBeVisible()
    }
    // The sculptures carry their figures: the risk level on the tallest tile, the horizon at the foot.
    const amira = scene(page, /Profil de Amira en tuiles.*risque élevée, horizon long terme/)
    await expect(sceneTag(amira, 'Risque : élevée')).toBeVisible()
    await expect(sceneTag(amira, 'Horizon : long terme')).toBeVisible()
    await expect(sceneTag(scene(page, /Profil de Robert en tuiles/), 'Risque : faible')).toBeVisible()
  })

  for (const profile of PROFILES) {
    test(`${profile.name} : son tableau de bord commence par ses sections et ses verdicts`, async ({ page, api }) => {
      await page.goto('/choisir-profil', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: `Choisir le profil ${profile.name}` }).click()

      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByText(`Bonjour ${profile.name}`)).toBeVisible()
      // The profile's own section is the first one, and says why it is there.
      const sections = page.locator('section[aria-labelledby^="section-"]')
      await expect(sections.first().getByRole('heading', { level: 2 })).toContainText(profile.firstSection)
      await expect(sections.first().getByText(profile.reason)).toBeVisible()
      // Every card carries the profile's verdict.
      await expect(sections.first().getByText(/^(Compatible|À surveiller|Hors profil)$/).first()).toBeVisible()
      // The profile's limits are in the KPI strip.
      await expect(page.getByText('Position max.').locator('..')).toContainText(profile.maxPosition)
      // The sections were asked for this profile, and the verdicts too.
      expect(api.calls.some((call) => call.path === `/api/market/sections?persona=${profile.id}`)).toBe(true)
      expect(api.calls.some((call) => call.path === '/api/fit' && call.body?.persona_id === profile.id)).toBe(true)
    })
  }

  test('le choix se fait aussi au clavier', async ({ page }) => {
    await page.goto('/choisir-profil', { waitUntil: 'domcontentloaded' })
    const mateo = page.getByRole('button', { name: 'Choisir le profil Mateo' })
    await mateo.focus()
    await expect(mateo).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByText('Bonjour Mateo')).toBeVisible()
  })

  test('Robert voit le titre médiatisé marqué « Battage élevé » et hors profil', async ({ page }) => {
    await openAs(page, 'robert')
    const card = page.getByRole('link', { name: /PLTR/ }).first()
    await expect(card).toContainText('Hors profil')
    await expect(card).toContainText('Battage élevé')
  })

  test('Mateo voit le titre du secteur exclu « Hors profil »', async ({ page }) => {
    await openAs(page, 'mateo')
    await expect(page.getByRole('link', { name: /XOM/ }).first()).toContainText('Hors profil')
  })

  test('changer de profil depuis le menu, puis revenir au choix', async ({ page }) => {
    await openAs(page, 'amira')
    await expect(page.getByText('Bonjour Amira')).toBeVisible()

    await page.getByRole('button', { name: 'Profil actif : Amira' }).click()
    await page.getByRole('menuitemradio', { name: /Robert/ }).click()
    await expect(page.getByText('Bonjour Robert')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Dividendes réguliers' })).toBeVisible()
    // The new profile is kept across pages and reloads.
    await nav(page, 'Mon portefeuille').click()
    await expect(page.getByText('Profil de Robert')).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Profil de Robert')).toBeVisible()

    await page.getByRole('button', { name: 'Profil actif : Robert' }).click()
    await page.getByRole('menuitem', { name: 'Changer de profil' }).click()
    await expect(page).toHaveURL(/\/choisir-profil$/)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/choisir-profil$/)
  })
})
