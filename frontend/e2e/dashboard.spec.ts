import { SECTION_POPULAIRES } from '../src/test/stocks'
import { expect, openAs, test } from './support/app'

// A full section: as many cards as asked.
const full = (limit: number) => ({
  ...SECTION_POPULAIRES,
  items: Array.from({ length: limit }, (_, index) => ({ ...SECTION_POPULAIRES.items[index % SECTION_POPULAIRES.items.length], ticker: `T${index}` })),
})

test.describe('Tableau de bord compact', () => {
  test.use({
    apiOptions: {
      override: (_request, url) =>
        url.pathname === '/api/market/sections/populaires' ? { body: full(Number(url.searchParams.get('limit') ?? 24)) } : undefined,
    },
  })

  test('une section générale s’ouvre sur une rangée ; « Afficher plus » montre le reste, puis en demande d’autres', async ({ page, api }) => {
    await openAs(page, 'amira')
    const popular = page.locator('section[aria-labelledby="section-populaires"]')
    const cards = popular.getByRole('listitem')
    // One row of the grid: five cards at this width, whatever was loaded.
    await expect(cards.filter({ visible: true })).toHaveCount(5)
    await expect(popular.getByText(/Aperçu des 24 titres/)).toBeVisible()

    await popular.getByRole('button', { name: 'Afficher plus' }).click()
    await expect(cards.filter({ visible: true })).toHaveCount(24)
    await popular.getByRole('button', { name: 'Afficher plus' }).click()
    await expect(cards).toHaveCount(48)
    expect(api.calls.some((call) => call.path === '/api/market/sections/populaires?limit=48')).toBe(true)

    await popular.getByRole('button', { name: 'Afficher moins' }).click()
    await expect(cards.filter({ visible: true })).toHaveCount(5)
    // The teammate's fold still works on top of it.
    await popular.getByRole('button', { name: /Les plus populaires/ }).click()
    await expect(cards).toHaveCount(0)
  })
})
