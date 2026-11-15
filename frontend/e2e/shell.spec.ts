import { unreachableApi } from './support/api'
import type { Page } from '@playwright/test'
import { expect, nav, openAs, scene, test } from './support/app'

test.describe('Cadre de l’application', () => {
  test('la navigation principale mène aux quatre espaces', async ({ page }) => {
    await openAs(page, 'amira')
    await expect(nav(page, 'Tableau de bord')).toHaveAttribute('aria-current', 'page')

    await nav(page, 'Mon portefeuille').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mon portefeuille' })).toBeVisible()
    await nav(page, 'Comptes').click()
    await expect(page.getByRole('heading', { level: 1, name: /Comptes enregistrés/ })).toBeVisible({ timeout: 30_000 })
    await nav(page, 'Labo').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Labo des exécutions' })).toBeVisible()
    await expect(nav(page, 'Labo')).toHaveAttribute('aria-current', 'page')
    // A title's page belongs to the dashboard.
    await page.goto('/titres/NVDA', { waitUntil: 'domcontentloaded' })
    await expect(nav(page, 'Tableau de bord')).toHaveAttribute('aria-current', 'page')
  })

  test('le menu réduit en rail le reste d’une page à l’autre et après rechargement', async ({ page }) => {
    await openAs(page, 'amira')
    const sidebar = page.locator('[data-slot="sidebar"][data-state], [data-sidebar="sidebar"]').first()
    await page.getByRole('button', { name: 'Réduire le menu', exact: true }).click()
    const deploy = page.getByRole('button', { name: 'Déployer le menu', exact: true })
    await expect(deploy).toHaveAttribute('aria-expanded', 'false')
    await expect(sidebar).toBeAttached()
    // In the rail the destinations stay reachable (icons with their name).
    await nav(page, 'Labo').click()
    await expect(page.getByRole('heading', { level: 1, name: 'Labo des exécutions' })).toBeVisible()
    await expect(deploy).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(deploy).toBeVisible()
    await deploy.click()
    await expect(page.getByRole('button', { name: 'Réduire le menu', exact: true })).toHaveAttribute('aria-expanded', 'true')
  })

  test('le thème sombre se choisit, tient au rechargement et repeint les scènes', async ({ page }) => {
    await openAs(page, 'amira')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    await page.getByRole('button', { name: 'Passer au thème sombre' }).click()
    await expect(page.locator('html')).toHaveClass(/dark/)
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(light)
    await expect(scene(page, /Le marché du jour en tuiles/)).toBeVisible()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByRole('button', { name: 'Passer au thème clair' }).click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('sans préférence enregistrée, le thème suit celui du système', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await openAs(page, 'amira')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
})

test.describe('Sur téléphone (375 px)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true })

  test('le menu s’ouvre depuis la barre du haut et se referme en naviguant', async ({ page }) => {
    await openAs(page, 'robert')
    await expect(page.getByText('Bonjour Robert')).toBeVisible()
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
    const menu = page.getByRole('dialog')
    await expect(menu.getByRole('link', { name: 'Mon portefeuille' })).toBeVisible()
    await menu.getByRole('link', { name: 'Mon portefeuille' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Mon portefeuille' })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  for (const path of ['/', '/titres/PLTR', '/portefeuille', '/comptes', '/labo', '/labo/lancer', '/labo/executions/20261114T221500Z-a1b2c3']) {
    test(`${path} tient dans la largeur de l’écran`, async ({ page }) => {
      await openAs(page, 'robert', path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
      await page.waitForTimeout(800)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, 'défilement horizontal de la page').toBeLessThanOrEqual(1)
    })
  }
})

test.describe('Sans WebGL', () => {
  test('les scènes deviennent des mosaïques à plat, avec leurs étiquettes', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return /webgl/.test(type) ? null : (original as (...args: unknown[]) => unknown).call(this, type, ...rest)
      } as typeof original
    })
    await openAs(page, 'robert', '/portefeuille')
    const blocks = scene(page, /Le portefeuille en blocs/)
    await expect(blocks.locator('svg')).toBeVisible()
    await expect(blocks.locator('canvas')).toHaveCount(0)
    await expect(blocks.locator('svg text').filter({ hasText: 'PLTR' })).toBeVisible()
    // The information never lives in the scene alone.
    await page.getByText('Tableau des titres : lire et modifier les poids au clavier').click()
    await expect(page.getByLabel('Poids de PLTR')).toHaveValue('12')
  })
})

/** Frames the page asks for in one second: a scene that moves keeps asking, a still one does not. */
async function framesPerSecond(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const counter = window as unknown as { __frames?: number }
        const from = counter.__frames ?? 0
        setTimeout(() => resolve((counter.__frames ?? 0) - from), 1000)
      }),
  )
}

test.describe('Animations', () => {
  // The machine says « reduce motion » (as many Windows PCs do): the app animates all the same.
  test.use({ reducedMotion: 'reduce' })

  test('activées par défaut même si le système demande moins de mouvement ; l’interrupteur les réduit et le choix tient', async ({ page }) => {
    await page.addInitScript(() => {
      const counter = window as unknown as { __frames: number }
      const raf = window.requestAnimationFrame.bind(window)
      counter.__frames = 0
      window.requestAnimationFrame = (callback) => raf((time) => {
        counter.__frames++
        callback(time)
      })
    })
    await openAs(page, 'amira')
    const market = scene(page, /Le marché du jour en tuiles/)
    await expect(market.locator('canvas')).toBeVisible()
    await expect(market.locator('span').first()).toBeVisible()
    const toggle = page.getByRole('switch', { name: 'Animations' })
    await expect(toggle).toBeChecked()
    await expect(toggle).toContainText('Animations : activées')
    await expect(page.locator('html')).not.toHaveAttribute('data-motion', 'reduced')
    // The market field breathes: the scene keeps drawing.
    await expect.poll(() => framesPerSecond(page)).toBeGreaterThan(10)
    // Entrances are played.
    expect(await page.locator('.fade-up').first().evaluate((element) => getComputedStyle(element).animationName)).not.toBe('none')

    await toggle.click()
    await expect(toggle).not.toBeChecked()
    await expect(toggle).toContainText('Animations : réduites')
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
    // One still frame: the scene on screen stops at once, and the content is all there.
    await expect.poll(() => framesPerSecond(page)).toBeLessThan(3)
    expect(await page.locator('.fade-up').first().evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
    await expect(page.getByRole('heading', { level: 2, name: 'IA et semi-conducteurs' })).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('switch', { name: 'Animations' })).not.toBeChecked()
    await expect(scene(page, /Le marché du jour en tuiles/).locator('canvas')).toBeVisible()
    await page.getByRole('switch', { name: 'Animations' }).click()
    await expect(page.getByRole('switch', { name: 'Animations' })).toBeChecked()
    await expect.poll(() => framesPerSecond(page)).toBeGreaterThan(10)
  })

  test('l’interrupteur est aussi sur la page du choix du profil', async ({ page }) => {
    await page.goto('/choisir-profil', { waitUntil: 'domcontentloaded' })
    const toggle = page.getByRole('switch', { name: 'Animations' })
    await expect(toggle).toBeChecked()
    await toggle.click()
    await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced')
  })
})

test.describe('Quand l’API ne répond pas', () => {
  test('le choix du profil explique que le serveur est injoignable', async ({ page }) => {
    await unreachableApi(page)
    await page.goto('/choisir-profil', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('alert')).toContainText('Impossible de joindre le serveur')
  })
})

test.describe('Quand une partie de l’API échoue', () => {
  let fail = true
  test.use({
    apiOptions: {
      override: (_request, url) => {
        if (url.pathname === '/api/market/sections/populaires' && fail) return { status: 500, body: { detail: 'Internal Server Error' } }
        if (url.pathname === '/api/portfolio/analyze' && fail) return { status: 503, body: { detail: 'Yahoo Finance ne répond pas.' } }
        return undefined
      },
    },
  })

  test('une section en échec n’empêche pas les autres, et se relance', async ({ page }) => {
    fail = true
    await openAs(page, 'amira')
    const popular = page.locator('section[aria-labelledby="section-populaires"]')
    await expect(popular.getByRole('alert')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { level: 2, name: 'Cryptomonnaies' })).toBeVisible()
    await expect(page.getByRole('link', { name: /BTC-USD/ }).first()).toBeVisible()
    fail = false
    await popular.getByRole('button', { name: 'Réessayer' }).click()
    await expect(popular.getByRole('link', { name: /NVDA/ })).toBeVisible()
  })

  test('l’analyse du portefeuille en échec garde les titres modifiables', async ({ page }) => {
    fail = true
    await openAs(page, 'robert', '/portefeuille')
    await expect(page.getByRole('alert')).toContainText('Analyse du portefeuille indisponible', { timeout: 15_000 })
    await page.getByText('Tableau des titres : lire et modifier les poids au clavier').click()
    await expect(page.getByLabel('Poids de PLTR')).toHaveValue('12')
  })
})
