import { expect, openAs, scene, sceneTag, test } from './support/app'

test.describe('Comptes', () => {
  test('chaque vue a sa scène : immeubles du parcours, relief côte à côte, chemin des objectifs', async ({ page }) => {
    await openAs(page, 'amira', '/comptes')
    await expect(page.getByRole('heading', { level: 1, name: /Comptes enregistrés/ })).toBeVisible({ timeout: 30_000 })

    // Le parcours: one building per account, named, with its roof where a ceiling applies.
    const buildings = scene(page, /Les comptes en immeubles de trois étages/)
    await expect(buildings).toHaveAccessibleName(/REER : .*quand on retire, imposé \(impôt ou perte\) ; plafond de cotisation/)
    await expect(sceneTag(buildings, 'Non enregistré')).toBeVisible()
    await expect(sceneTag(buildings, 'Sans plafond')).toBeVisible()
    // Clicking a building opens that account's detail (the first roof is the CELI's).
    const detail = page.locator('section[aria-labelledby="parcours-detail"]').getByRole('button').first()
    await expect(detail).toHaveAttribute('aria-expanded', 'false')
    await expect(async () => {
      const roof = await sceneTag(buildings, 'Plafonné').boundingBox()
      if (!roof) throw new Error('le toit n’est pas encore étiqueté')
      await page.mouse.click(roof.x + roof.width / 2, roof.y + roof.height + 40)
      await expect(detail).toHaveAttribute('aria-expanded', 'true', { timeout: 1500 })
    }).toPass()
    // The figure of the ceiling comes with the higher levels, on the scene as in the text.
    await page.getByRole('radio', { name: 'Normale' }).click()
    await buildings.scrollIntoViewIfNeeded()
    await expect(sceneTag(buildings, /Plafond \d{4}/).first()).toBeVisible()

    // Côte à côte: the grid of properties as a relief, rows named.
    await page.getByRole('radio', { name: 'Côte à côte' }).click()
    const relief = scene(page, /Ce que chaque compte permet, en relief/)
    await expect(sceneTag(relief, 'Retrait sans impôt')).toBeVisible()
    await expect(page.getByRole('row', { name: /Réduit l'impôt de l'année de cotisation/ })).toBeVisible()

    // Par objectif: the scene follows the goal opened in the list.
    await page.getByRole('radio', { name: 'Par objectif' }).click()
    const paths = scene(page, /Le chemin d'un objectif vers les comptes/)
    await expect(paths).toHaveAccessibleName(/« Garder de l'argent disponible » mène à CELI/)
    await page.getByRole('button', { name: /Acheter une première propriété/ }).click()
    await expect(paths).toHaveAccessibleName(/« Acheter une première propriété » mène à CELI \(retrait sans impôt\), REER .*CELIAPP/)
    await expect(sceneTag(paths, /CELIAPP/)).toBeVisible()
    await expect(page.getByText(/« Acheter une première propriété » mène à/)).toBeVisible()
  })
})
