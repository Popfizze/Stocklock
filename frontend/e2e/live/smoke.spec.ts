import { expect, test } from '@playwright/test'

/**
 * Optional smoke checks against a deployed API (read-only: nothing is started, nothing is written).
 * They run only with `E2E_API_BASE_URL` set; the dev server then proxies `/api` to it, so the page
 * and the API share an origin and no CORS rule is involved (see e2e/README.md).
 */
const LIVE_API = process.env.E2E_API_BASE_URL

test.skip(!LIVE_API, 'E2E_API_BASE_URL n’est pas défini : vérifications sur l’API déployée ignorées.')

const PERSONA_KEY = 'stocklock.activePersonaId'

test.describe('API déployée (lecture seule)', () => {
  test('l’API répond, et dit quelles origines elle accepte', async ({ request }) => {
    const direct = await request.get(`${LIVE_API}/api/personas`, { headers: { Origin: 'http://localhost:5173' } })
    expect(direct.ok()).toBe(true)
    const personas = (await direct.json()) as Array<{ id: string }>
    expect(personas.map((persona) => persona.id).sort()).toEqual(['amira', 'mateo', 'robert'])
    // Informative: which origin the API allows for a browser that would call it directly.
    test.info().annotations.push({
      type: 'CORS',
      description: `access-control-allow-origin pour http://localhost:5173 : ${direct.headers()['access-control-allow-origin'] ?? 'absent (appel direct refusé par le navigateur ; le proxy du serveur de développement est nécessaire)'}`,
    })
  })

  test('choisir un profil ouvre son tableau de bord sur des données réelles', async ({ page }) => {
    await page.goto('/choisir-profil', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Choisir le profil Amira' }).click()
    await expect(page.getByText('Bonjour Amira')).toBeVisible()
    const first = page.locator('section[aria-labelledby^="section-"]').first()
    await expect(first.getByRole('link').first()).toBeVisible({ timeout: 60_000 })
    await expect(first.getByText(/^(Compatible|À surveiller|Hors profil)$/).first()).toBeVisible({ timeout: 60_000 })
  })

  test('la recherche trouve un titre et sa fiche s’ouvre avec le verdict du profil', async ({ page }) => {
    await page.addInitScript(([key]) => window.localStorage.setItem(key, 'robert'), [PERSONA_KEY])
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('searchbox', { name: 'Rechercher un titre par nom ou symbole' }).fill('nvda')
    await page.getByRole('region', { name: 'Résultats de la recherche' }).getByRole('link', { name: /^NVDA\b/ }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/NVIDIA/i, { timeout: 60_000 })
    await expect(page.getByRole('region', { name: /Pour Robert/ }).getByText(/^(Compatible|À surveiller|Hors profil)$/)).toBeVisible({ timeout: 60_000 })
  })

  test('le portefeuille d’exemple est analysé', async ({ page }) => {
    await page.addInitScript(([key]) => window.localStorage.setItem(key, 'mateo'), [PERSONA_KEY])
    await page.goto('/portefeuille', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('region', { name: 'Diversification' })).toBeVisible({ timeout: 80_000 })
    await expect(page.getByRole('img', { name: /Le portefeuille en blocs/ })).toBeVisible()
  })

  test('le Labo liste les exécutions du registre', async ({ page }) => {
    await page.addInitScript(([key]) => window.localStorage.setItem(key, 'amira'), [PERSONA_KEY])
    await page.goto('/labo', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 2, name: /\d+ exécutions?/ })).toBeVisible({ timeout: 60_000 })
  })
})
