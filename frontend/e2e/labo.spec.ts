import { RUN_BATCH, RUN_LAB } from '../src/test/runs'
import { expect, nav, openAs, scene, test } from './support/app'

const lastRunsQuery = (calls: Array<{ path: string }>) => calls.filter((call) => call.path.startsWith('/api/runs?')).pop()?.path ?? ''

test.describe('Labo', () => {
  test('la console : la frise, la liste, les filtres envoyés au registre', async ({ page, api }) => {
    await openAs(page, 'amira')
    await nav(page, 'Labo').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Labo des exécutions' })).toBeVisible()
    await expect(scene(page, /Frise 3D des exécutions, la plus récente à gauche : 3 exécutions/)).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: '3 exécutions' })).toBeVisible()

    // Status: only the run that is going.
    await page.getByRole('radiogroup', { name: 'Statut' }).getByRole('radio', { name: 'En cours' }).click()
    await expect(page.getByRole('heading', { level: 2, name: '1 exécution' })).toBeVisible()
    expect(lastRunsQuery(api.calls)).toContain('status=running')
    await page.getByRole('radiogroup', { name: 'Statut' }).getByRole('radio', { name: 'Tous', exact: true }).click()

    // Pipeline and profile.
    await page.getByRole('radiogroup', { name: 'Pipeline' }).getByRole('radio', { name: 'Labo (tous)' }).click()
    await expect(page.getByRole('heading', { level: 2, name: '2 exécutions' })).toBeVisible()
    await page.getByRole('radiogroup', { name: 'Profil' }).getByRole('radio', { name: 'Robert' }).click()
    await expect(page.getByText('Aucune exécution pour ces filtres.')).toBeVisible()
    expect(lastRunsQuery(api.calls)).toMatch(/pipeline=lab&persona=robert/)
    await page.getByRole('radiogroup', { name: 'Profil' }).getByRole('radio', { name: 'Tous', exact: true }).click()
    await page.getByRole('radiogroup', { name: 'Pipeline' }).getByRole('radio', { name: 'Tous', exact: true }).click()

    // The date range is the registry's own `since`: the fixtures' runs are older than today.
    await page.getByRole('radiogroup', { name: 'Date' }).getByRole('radio', { name: "Aujourd'hui" }).click()
    await expect.poll(() => lastRunsQuery(api.calls)).toMatch(/since=\d{4}-\d{2}-\d{2}T/)
  })

  test('ouvrir une exécution, une étape, un élément généré et son aperçu', async ({ page }) => {
    await openAs(page, 'amira', '/labo')
    await page.getByRole('link', { name: /SHOP\.TO/ }).first().click()
    await expect(page).toHaveURL(new RegExp(`/labo/executions/${RUN_LAB.run_id}$`))
    await expect(page.getByRole('heading', { level: 1, name: 'SHOP.TO' })).toBeVisible()
    await expect(scene(page, /Convoyeur 3D de l’exécution SHOP\.TO.*2 étapes/)).toBeVisible()

    // The conveyor's keyboard equivalent: each stage is a button; the result is open first.
    const stages = page.getByRole('list', { name: 'Étapes de l’exécution' })
    await expect(stages.getByRole('button', { name: /Résultat/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Score de 72 sur 100.')).toBeVisible()
    await stages.getByRole('button', { name: /1\. Collecte/ }).click()
    await expect(page.getByText('Quelle source de prix pour SHOP.TO ?')).toBeVisible()
    await stages.getByRole('button', { name: /Paramètres/ }).click()
    await expect(page.getByText('fetch.window')).toBeVisible()

    // « Éléments générés » : open one and page through its rows.
    const elements = page.getByRole('list', { name: 'Éléments générés' })
    await expect(elements.getByRole('button')).toHaveCount(3)
    await elements.getByRole('button', { name: /Prix quotidiens SHOP\.TO/ }).click()
    const preview = page.getByRole('region', { name: 'Aperçu de Prix quotidiens SHOP.TO' })
    await expect(preview.getByRole('columnheader', { name: 'close' })).toBeVisible()
    await expect(preview.getByRole('cell', { name: '101,5' })).toBeVisible()
    // A file written by the score pipeline carries its path.
    await expect(elements.getByRole('button', { name: /univers\.csv/ })).toContainText('score/silver/univers/')
  })

  test('comparer deux exécutions choisies dans la liste', async ({ page }) => {
    await openAs(page, 'amira', '/labo')
    await page.getByRole('button', { name: 'Comparer SHOP.TO' }).click()
    await expect(page.getByText('Choisissez une seconde exécution à comparer.')).toBeVisible()
    await page.getByRole('button', { name: /Comparer Groupe · Les plus populaires/ }).click()
    await page.getByRole('link', { name: 'Comparer les 2 exécutions choisies' }).click()

    await expect(page).toHaveURL(/\/labo\/comparer\?a=.*&b=/)
    await expect(page.getByRole('heading', { level: 1, name: 'Comparer deux exécutions' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Exécution A.*SHOP\.TO/ })).toBeVisible()
    await expect(page.getByText(/\d+ différences entre ces deux exécutions\./)).toBeVisible()
    await expect(page.getByText('option fetch.window')).toBeVisible()
    await page.getByRole('button', { name: 'Tout afficher' }).click()
    await expect(page.getByRole('button', { name: 'Seulement les différences' })).toBeVisible()
  })

  test('un groupe : ses titres, celui qui n’a pas fini, le tableau', async ({ page }) => {
    await openAs(page, 'amira', `/labo/executions/${RUN_BATCH.run_id}`)
    await expect(page.getByRole('heading', { level: 1, name: /Groupe · Les plus populaires/ })).toBeVisible()
    await expect(scene(page, /Résultat du groupe en 3D : une colonne par titre \(3\)/)).toBeVisible()
    await expect(page.getByText(/Non terminé dans le temps imparti/)).toBeVisible()
    const grid = page.getByRole('region', { name: 'Tableau du groupe' })
    await expect(grid.getByRole('row', { name: /NVDA/ })).toContainText('Réussi')
    await expect(grid.getByRole('row', { name: /INTC/ })).toContainText('Non terminé')
    await expect(page.getByRole('link', { name: 'Relancer ce titre seul' })).toHaveAttribute('href', '/labo/lancer?pipeline=score&titres=INTC')
  })

  test('lancer le pipeline de score sur des titres choisis par la recherche, puis arriver sur son exécution', async ({ page, api }) => {
    await openAs(page, 'amira', '/labo')
    await page.getByRole('link', { name: 'Lancer une exécution' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Lancer une exécution' })).toBeVisible()
    await expect(page.getByRole('radio', { name: /Pipeline de score/ })).toBeChecked()

    await page.getByRole('radiogroup', { name: 'Type de groupe' }).getByRole('radio', { name: 'Titres choisis' }).click()
    const search = page.getByLabel('Chercher un titre à ajouter à : Titres du groupe')
    await search.fill('nvda')
    await page.getByRole('list', { name: 'Titres trouvés' }).getByRole('button', { name: /Ajouter NVDA/ }).click()
    // Typed fast, then Enter: the best match of what is typed now, never the previous answer.
    await search.fill('bit')
    await expect(page.getByRole('list', { name: 'Titres trouvés' }).getByRole('button', { name: /Ajouter BITF/ })).toBeVisible()
    await search.press('Enter')
    const group = page.getByRole('list', { name: 'Titres du groupe' })
    await expect(group.getByRole('button')).toHaveText(['NVDA', 'BITF'])
    await group.getByRole('button', { name: 'Retirer BITF' }).click()
    await search.fill('shop')
    await page.getByRole('list', { name: 'Titres trouvés' }).getByRole('button', { name: /Ajouter SHOP,/ }).click()
    await expect(page.getByText('Pipeline de score sur 2 titres — titres choisis.')).toBeVisible()

    await page.getByRole('button', { name: 'Lancer l’exécution' }).click()
    await expect(page).toHaveURL(/\/labo\/executions\//)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(scene(page, /Convoyeur 3D/)).toBeVisible()
    expect(api.started[0]).toMatchObject({ group: { kind: 'tickers', tickers: ['NVDA', 'SHOP'] } })
  })

  test('lancer un pipeline du Labo sur le portefeuille du profil', async ({ page, api }) => {
    await openAs(page, 'amira', '/labo/lancer')
    await page.getByRole('radio', { name: /1\. Score/ }).click()
    await expect(page.getByText('1. Score sur 8 titres.')).toBeVisible()
    await page.getByRole('button', { name: 'Lancer l’exécution' }).click()
    await expect(page).toHaveURL(new RegExp(`/labo/executions/${RUN_BATCH.run_id}$`))
    expect(api.started[0]).toMatchObject({ step: 'score', persona_id: 'amira', group: { kind: 'portfolio' } })
  })

  test('« Relancer » reprend le groupe et les réglages de l’exécution', async ({ page }) => {
    await openAs(page, 'amira', `/labo/executions/${RUN_BATCH.run_id}`)
    await page.getByRole('link', { name: 'Relancer', exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/labo/lancer\\?pipeline=score&depuis=${RUN_BATCH.run_id}$`))
    await expect(page.getByRole('note').filter({ hasText: 'Repris de l\'exécution' })).toContainText('Groupe · Les plus populaires')
    // The same group (a dashboard section) and the same option as the run, not the launcher's defaults.
    await expect(page.getByRole('radiogroup', { name: 'Type de groupe' }).getByRole('radio', { name: 'Section du tableau de bord' })).toBeChecked()
    await expect(page.getByRole('radiogroup', { name: 'Section' }).getByRole('radio', { name: 'Les plus populaires' })).toBeChecked()
    await expect(page.getByText('1. Score sur 3 titres.')).toBeVisible()
  })

  test('une exécution inconnue est dite introuvable, sans être redemandée en boucle', async ({ page, api }) => {
    await openAs(page, 'amira', '/labo/executions/inconnue-123')
    await expect(page.getByRole('alert')).toContainText('Cette exécution est introuvable (inconnue-123).')
    const asked = () => api.calls.filter((call) => call.path.includes('inconnue-123')).length
    const before = asked()
    // Longer than a polling period: nothing more is asked.
    await page.waitForTimeout(6000)
    expect(asked()).toBe(before)
  })
})

test.describe('Labo, pipeline de score déjà en cours', () => {
  test.use({ apiOptions: { scoreRunning: true } })

  test('un second lancement est refusé (409) avec un message clair', async ({ page }) => {
    await openAs(page, 'amira', '/labo/lancer')
    await page.getByRole('button', { name: 'Lancer l’exécution' }).click()
    await expect(page.getByRole('alert')).toContainText('Une exécution du pipeline de score est déjà en cours')
    await expect(page).toHaveURL(/\/labo\/lancer$/)
  })
})

test.describe('Labo, pipeline de score non déployé', () => {
  test.use({ apiOptions: { scoreUnconfigured: true } })

  test('le lancement est désactivé et dit pourquoi (503 côté serveur)', async ({ page }) => {
    await openAs(page, 'amira', '/labo/lancer')
    await expect(page.getByRole('note').filter({ hasText: "n'est pas déployé" })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Lancer l’exécution' })).toBeDisabled()
  })
})
