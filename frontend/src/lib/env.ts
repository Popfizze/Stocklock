/**
 * Build-time API base URL — read from this app's Vite env.
 *
 * A missing `VITE_API_BASE_URL` in a production build fails loudly at build
 * time via the guard in vite.config.ts, so a bundle never ships pointed at
 * the developer's laptop. Dev keeps the localhost fallback so `npm run dev`
 * works without an .env.
 *
 * The API client (src/api/client.ts) reads this directly.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
