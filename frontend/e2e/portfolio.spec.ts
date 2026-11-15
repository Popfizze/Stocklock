import type { Locator, Page } from '@playwright/test'
import { expect, openAs, scene, sceneTag, test } from './support/app'

const blocks = (page: Page) => scene(page, /Le portefeuille en blocs/)
const table = (page: Page) => page.getByText('Tableau des titres : lire et modifier les poids au clavier')
const desk = (page: Page) => page.getByRole('region', { name: /Votre score, vos pondérations/ })

/** The centre of a tile, found from the tag the engine writes just above it. */
async function tileUnder(tag: Locator): Promise<{ x: number; y: number }> {
  await expect(tag).toBeVisible()
  // The blocks grow and glide into place: wait until the tag has stopped moving.
  let box = await tag.boundingBox()
  for (let attempt = 0; attempt < 40; attempt++) {
    await tag.page().waitForTimeout(250)
    const next = await tag.boundingBox()
    const still = box && next && Math.abs(box.x - next.x) < 0.5 && Math.abs(box.y - next.y) < 0.5
    box = next
    if (still) break
  }
  if (!box) throw new Error('étiquette sans position')
  // Well inside the block: under its top face, on its front edge.
  return { x: box.x + box.width / 2, y: box.y + box.height + 36 }
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  // Let the scene see the pointer (it draws in software here) before the button goes down.
  await page.waitForTimeout(150)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
}

test.describe('Mon portefeuille', () => {
  test('Robert : son exemple, le titre au-dessus du plafond, le poids changé au clavier, un titre retiré', async ({ page }) => {
    await openAs(page, 'robert', '/portefeuille')
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (11)' })).toBeVisible()
    await expect(blocks(page)).toHaveAccessibleName(/11 titres.*sous un plafond à 10\s%\. Au-dessus du plafond : PLTR\./)
    // The block that breaks the rule is named on the scene itself.
    await expect(sceneTag(blocks(page), 'PLTR')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Constats' })).toContainText('PLTR dépasse la position maximale du profil.')

    // Keyboard equivalent of the drag: the table of holdings.
    await table(page).click()
    const weight = page.getByLabel('Poids de PLTR')
    await expect(weight).toHaveValue('12')
    await weight.fill('8')
    await expect(page.getByText(/Total des poids saisis : 96/)).toBeVisible()
    // PLTR is back under the ceiling (the shares are renormalised: 8 of 96).
    await expect(blocks(page)).not.toHaveAccessibleName(/PLTR/)
    await expect(page.getByRole('region', { name: 'Constats' })).not.toContainText('PLTR dépasse')

    await page.getByRole('button', { name: 'Retirer KO' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (10)' })).toBeVisible()

    // Kept for the profile across a reload; « Revenir à l'exemple » undoes it.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (10)' })).toBeVisible()
    await page.getByRole('button', { name: /Revenir à l'exemple/ }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (11)' })).toBeVisible()
  })

  test('ajouter un titre par la recherche (clic), puis une suggestion', async ({ page }) => {
    await openAs(page, 'amira', '/portefeuille')
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (8)' })).toBeVisible()

    await page.getByRole('searchbox', { name: 'Ajouter un titre au portefeuille' }).fill('ry')
    const found = page.getByRole('list', { name: 'Titres à ajouter' })
    await found.getByRole('button', { name: 'Ajouter RY.TO' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (9)' })).toBeVisible()
    await expect(sceneTag(blocks(page), 'RY.TO')).toBeVisible()

    const suggestions = page.getByRole('region', { name: 'Suggestions' })
    await suggestions.getByRole('button', { name: 'Ajouter UNP au portefeuille' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (10)' })).toBeVisible()
    await expect(suggestions.getByRole('link', { name: 'UNP' })).toHaveCount(0)
  })

  test('glisser un résultat de recherche sur les blocs l’ajoute', async ({ page }) => {
    await openAs(page, 'amira', '/portefeuille')
    await page.getByRole('searchbox', { name: 'Ajouter un titre au portefeuille' }).fill('pltr')
    const result = page.getByRole('list', { name: 'Titres à ajouter' }).getByRole('listitem').filter({ hasText: 'PLTR' }).first()
    const from = await result.boundingBox()
    const onto = await page.getByTestId('portfolio-drop').boundingBox()
    if (!from || !onto) throw new Error('résultat ou scène sans position')
    // A real drag: the row is picked up by its name and dropped in the middle of the blocks.
    await drag(page, { x: from.x + 60, y: from.y + from.height / 2 }, { x: onto.x + onto.width / 2, y: onto.y + onto.height / 2 })
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (9)' })).toBeVisible()
    await expect(sceneTag(blocks(page), 'PLTR')).toBeVisible()
  })

  test('les blocs se manipulent : glisser vers le haut pèse plus, hors de la scène retire, une suggestion glissée entre', async ({ page }) => {
    await openAs(page, 'amira', '/portefeuille', {
      'stocklock.portfolio.amira': JSON.stringify([
        { ticker: 'NVDA', weight: 20 },
        { ticker: 'AAPL', weight: 20 },
        { ticker: 'RY.TO', weight: 20 },
      ]),
    })
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (3)' })).toBeVisible()
    await table(page).click()
    const nvda = page.getByLabel('Poids de NVDA')
    await expect(nvda).toHaveValue('20')

    // Up: the block grows and its weight follows.
    // (Retried: the scene is drawn in software here, and a drag started before its first frame is lost.)
    await expect(async () => {
      const start = await tileUnder(sceneTag(blocks(page), 'NVDA'))
      await drag(page, start, { x: start.x, y: start.y - 60 })
      expect(Number(await nvda.inputValue())).toBeGreaterThan(22)
    }).toPass({ timeout: 25_000 })

    // A suggestion waiting at the edge, dragged a little: it joins the portfolio.
    const waiting = sceneTag(blocks(page), '+ WM')
    await expect(waiting).toBeVisible()
    const box = await waiting.boundingBox()
    if (!box) throw new Error('suggestion sans position')
    const edge = { x: box.x + box.width / 2, y: box.y - 10 }
    await drag(page, edge, { x: edge.x + 10, y: edge.y - 50 })
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (4)' })).toBeVisible()

    // Out of the scene: the block is removed.
    const aapl = await tileUnder(sceneTag(blocks(page), 'AAPL'))
    const frame = await blocks(page).boundingBox()
    if (!frame) throw new Error('scène sans position')
    await drag(page, aapl, { x: frame.x - 40, y: aapl.y })
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (3)' })).toBeVisible()
    await expect(page.getByLabel('Poids de AAPL')).toHaveCount(0)
  })

  test('la table de mixage : le score suivi bouge tout de suite, les suggestions se reclassent', async ({ page, api }) => {
    await openAs(page, 'robert', '/portefeuille')
    const suggestions = page.getByRole('region', { name: 'Suggestions' })
    await expect(suggestions.getByRole('link').first()).toHaveText('UNP')

    const live = desk(page).getByText(/^En direct · /).locator('..')
    const liveScore = live.locator('.display')
    await expect(live).toContainText('En direct · RY.TO')
    await expect(liveScore).toHaveText('60,8')
    await expect(desk(page).getByRole('img', { name: /Table de mixage du score.*Croissance 15 %/ })).toBeVisible()

    // Three steps less on « Croissance »: UNP, strong on growth, gives way to WM.
    const less = desk(page).getByRole('button', { name: 'Moins de poids pour Croissance' })
    await less.click()
    // Read off the sensitivity curve at once, before the server has rescored anything.
    await expect(liveScore).not.toHaveText('60,8')
    await expect(live).toContainText('StockLock : 60,8')
    await less.click()
    await less.click()
    await expect(desk(page).getByText('Croissance :').locator('..')).toContainText('0 %')
    await expect(less).toBeDisabled()
    // The six weights still sum to 100.
    const weights = await desk(page).locator('li p.display').allInnerTexts()
    const shown = weights.map((text) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'))).reduce((a, b) => a + b, 0)
    // Each weight is shown as a whole percent: the six shown values are within a point of 100.
    expect(Math.abs(shown - 100)).toBeLessThanOrEqual(1)

    await expect(suggestions.getByRole('link').first()).toHaveText('WM')
    await expect(desk(page).getByRole('status')).toContainText(/passe de \d+ à \d+ car vous valorisez moins « croissance »/)
    const sent = api.calls.filter((call) => call.path === '/api/portfolio/analyze').pop()
    expect((sent?.body?.weights as Record<string, number>).croissance).toBe(0)

    // Another title can be followed; the weights are kept for the profile.
    await desk(page).getByRole('group', { name: 'Titre suivi pendant le réglage' }).getByRole('button', { name: 'PLTR' }).click()
    await expect(live).toContainText('En direct · PLTR')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(desk(page).getByText('Croissance :').locator('..')).toContainText('0 %')
    await desk(page).getByRole('button', { name: /Pondérations StockLock/ }).click()
    await expect(suggestions.getByRole('link').first()).toHaveText('UNP')
  })

  test('glisser une colonne de la table de mixage change son poids', async ({ page }) => {
    await openAs(page, 'robert', '/portefeuille')
    const mixer = desk(page).getByRole('img', { name: /Table de mixage du score/ })
    await mixer.scrollIntoViewIfNeeded()
    const column = await tileUnder(sceneTag(mixer, 'Rentabilité'))
    await drag(page, column, { x: column.x, y: column.y + 40 })
    await expect.poll(async () => Number((await desk(page).getByText('Rentabilité :').locator('..').innerText()).replace(/[^\d]/g, ''))).toBeLessThan(25)
    await expect(desk(page).getByRole('button', { name: /Pondérations StockLock/ })).toBeEnabled()
  })

  test('chaque profil ouvre son propre portefeuille', async ({ page }) => {
    await openAs(page, 'mateo', '/portefeuille')
    await expect(page.getByText('Profil de Mateo')).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Titres (9)' })).toBeVisible()
    await expect(blocks(page)).toHaveAccessibleName(/plafond à 15\s%/)
    // The excluded sector's title is out of profile for Mateo.
    await table(page).click()
    await expect(page.getByRole('row', { name: /ENB\.TO/ })).toContainText('Hors profil')
  })
})
