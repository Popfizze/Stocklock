/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Fail the build (not just the runtime) when a production bundle is
  // produced without an API base URL. Catches missing env vars at deploy
  // time, before a broken bundle ships and users see a blank screen.
  // The runtime fallback in `src/lib/env.ts` covers dev (`npm run dev`)
  // where Vite tree-shakes the dev branch in.
  if (command === 'build' && mode !== 'development' && !env.VITE_API_BASE_URL) {
    throw new Error(
      'VITE_API_BASE_URL must be set for production builds. ' +
        'Set it in your hosting platform (Vercel/Netlify/etc.) or in ' +
        '.env.production before running `npm run build`.',
    )
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: parseInt(env.VITE_DEV_PORT || '5173', 10),
      host: env.VITE_DEV_HOST || 'localhost',
      // Opt-in: `VITE_DEV_PROXY_TARGET=https://…` serves the API under this dev server's own `/api`
      // (same origin, so no CORS), to work on a local frontend against a deployed API. Off by default;
      // when set, `src/lib/env.ts` points the client at this server instead of `VITE_API_BASE_URL`.
      proxy: env.VITE_DEV_PROXY_TARGET
        ? { '/api': { target: env.VITE_DEV_PROXY_TARGET, changeOrigin: true, secure: true } }
        : undefined,
    },
    test: {
      // jsdom so React component tests can poke at document/window without
      // a real browser. The `globals: true` opt lets test files use
      // `describe`/`it`/`expect` without importing from 'vitest' first.
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      // Measured when asked (`npm test -- --coverage`, as CI does), never
      // enforced: no thresholds. Scope is the app's own source.
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/test/**'],
        reporter: ['text-summary'],
      },
    },
  }
})
