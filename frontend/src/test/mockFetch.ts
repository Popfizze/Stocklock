import { vi } from 'vitest'

// Shape we accept in tests — matches the `Response` constructor's first
// argument (BodyInit) rather than the `body` property type, which is a
// ReadableStream that's tedious to synthesize in test code.
export interface MockResponse {
  status?: number
  body?: BodyInit | null
  headers?: HeadersInit
}

/** Replaces `fetch`: answers `responses` in order (clamping to the last) and records each call. */
export function mockFetch(responses: MockResponse[]) {
  let i = 0
  const calls: Array<{ url: string; init: RequestInit }> = []
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const r = responses[Math.min(i, responses.length - 1)]
    i++
    return new Response(r.body ?? null, {
      status: r.status ?? 200,
      headers: r.headers ?? { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return calls
}

/**
 * Like `mockFetch`, but answers each call from the FIRST route whose `match`
 * the URL contains (or matches), so pages whose queries fire in any order
 * get the right body. Each route keeps its own FIFO, clamping to its last
 * response. A call no route matches throws.
 */
export function mockFetchByUrl(routes: Array<{ match: string | RegExp; responses: MockResponse[] }>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const cursors = routes.map(() => 0)
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const urlStr = String(url)
    calls.push({ url: urlStr, init })
    const routeIndex = routes.findIndex((route) =>
      typeof route.match === 'string' ? urlStr.includes(route.match) : route.match.test(urlStr),
    )
    if (routeIndex === -1) throw new Error(`mockFetchByUrl: no route matches ${urlStr}`)
    const route = routes[routeIndex]
    const r = route.responses[Math.min(cursors[routeIndex], route.responses.length - 1)]
    cursors[routeIndex]++
    return new Response(r.body ?? null, {
      status: r.status ?? 200,
      headers: r.headers ?? { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return calls
}

/** Replaces `fetch` with one that always fails as an unreachable server does. */
export function mockFetchUnreachable() {
  globalThis.fetch = vi.fn(async () => {
    throw new TypeError('Failed to fetch')
  }) as typeof fetch
}

export const json = (body: unknown, status = 200): MockResponse => ({
  status,
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})
