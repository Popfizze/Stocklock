/**
 * Build-time API base URL — read from this app's Vite env.
 *
 * A missing `VITE_API_BASE_URL` in a production build fails loudly at build
 * time via the guard in vite.config.ts, so a bundle never ships pointed at
 * the developer's laptop. Dev keeps the localhost fallback so `npm run dev`
 * works without an .env.
 *
 * The API client (src/api/client.ts) reads this directly.
 *
 * Opt-in dev proxy: with `VITE_DEV_PROXY_TARGET` set, the dev server itself serves `/api` (see
 * vite.config.ts), so the API is this page's own origin and no CORS rule is involved.
 */
const viaDevProxy = import.meta.env.DEV && Boolean(import.meta.env.VITE_DEV_PROXY_TARGET)

export const API_BASE_URL: string = viaDevProxy
  ? window.location.origin
  : import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
