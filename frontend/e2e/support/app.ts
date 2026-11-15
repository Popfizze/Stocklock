import { expect, test as base, type Locator, type Page } from '@playwright/test'
import { mockApi, type MockApi, type MockApiOptions } from './api'

export type PersonaId = 'amira' | 'mateo' | 'robert'

const PERSONA_KEY = 'stocklock.activePersonaId'

interface Fixtures {
  /** The mocked API of the test's page (every request answered from the fixtures). */
  api: MockApi
  /** Options of the mocked API: `test.use({ apiOptions: { scoreRunning: true } })`. */
  apiOptions: MockApiOptions
  /** Console errors and uncaught exceptions of the page; checked empty at the end of every test. */
  pageErrors: string[]
}

/** Requests the mocked API refuses on purpose, or that a test aborts: the browser logs them as errors. */
const EXPECTED = /Failed to load resource|net::ERR_/

export const test = base.extend<Fixtures>({
  apiOptions: [{}, { option: true }],
  api: [
    async ({ page, apiOptions }, use) => {
      await use(await mockApi(page, apiOptions))
    },
    { auto: true },
  ],
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() === 'error' && !EXPECTED.test(message.text())) errors.push(message.text())
      })
      page.on('pageerror', (error) => errors.push(String(error)))
      await use(errors)
      // No journey may leave a React warning or an uncaught exception behind.
      expect(errors, 'erreurs de console pendant le parcours').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Opens `path` with a profile already chosen (as a returning visitor), without going through the picker. */
export async function openAs(page: Page, persona: PersonaId, path = '/', storage: Record<string, string> = {}): Promise<void> {
  await page.addInitScript(
    ([key, id, extra]) => {
      // Only on the first load of the test: what the journey then stores must survive its reloads.
      if (window.sessionStorage.getItem('e2e.seeded')) return
      window.sessionStorage.setItem('e2e.seeded', '1')
      window.localStorage.setItem(key as string, id as string)
      for (const [name, value] of Object.entries(extra as Record<string, string>)) window.localStorage.setItem(name, value)
    },
    [PERSONA_KEY, persona, storage] as const,
  )
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

/** The 3D scene (or its flat fallback) whose accessible name matches. */
export function scene(page: Page, name: RegExp): Locator {
  return page.getByRole('img', { name })
}

/** A tag written on a scene by the engine (« NVDA », « Rentabilité »…): where its tile stands on screen. */
export function sceneTag(sceneLocator: Locator, text: string | RegExp): Locator {
  return sceneLocator.locator('span').filter({ hasText: text }).first()
}

/**
 * Counts the WebGL contexts the page opens, from its very first script: every canvas that was
 * given one. To call before the first navigation; read the count with the function it returns.
 */
export async function trackWebglContexts(page: Page): Promise<() => Promise<number>> {
  await page.addInitScript(() => {
    const store = window as unknown as { __webglCanvases: Set<HTMLCanvasElement> }
    store.__webglCanvases = new Set()
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      const context = (original as (...args: unknown[]) => unknown).call(this, type, ...rest)
      if (context && /webgl/.test(type)) store.__webglCanvases.add(this)
      return context
    } as typeof original
  })
  return () => page.evaluate(() => (window as unknown as { __webglCanvases: Set<HTMLCanvasElement> }).__webglCanvases.size)
}

/** Whether a scene's canvas has been painted (some pixel is not transparent). */
export async function isPainted(sceneLocator: Locator): Promise<boolean> {
  return sceneLocator.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (!context || canvas.width === 0 || canvas.height === 0) return false
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 3; index < data.length; index += 4) if (data[index] !== 0) return true
    return false
  })
}

/** The main navigation's link, in the sidebar. */
export function nav(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name })
}
