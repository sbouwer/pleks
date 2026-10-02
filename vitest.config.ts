/**
 * vitest.config.ts — Vitest configuration for unit tests
 *
 * Notes: Resolves @/ alias to match tsconfig paths. Pure-function tests only —
 *        no Next.js runtime, no DB, no API calls. External deps mocked per test.
 */
import { defineConfig, configDefaults } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Walker scratch probes (.handoff/<slug>/scratch/*.test.ts) are untracked, so CI never runs them: a default run
// that collected them measured a suite CI does not have and ratcheted the test floor past it (M-141). They stay
// out of every run that does not NAME one — `npx vitest run .handoff/<slug>/scratch/p.test.ts` still runs it.
const namesHandoff = process.argv.some((a) => a.replaceAll('\\', '/').includes('.handoff/'))

export default defineConfig({
  test: {
    environment: 'node',
    // DB-integration tests (*.dbtest.ts) need a live local Supabase — run them via
    // `npm run test:db` (vitest.db.config.ts), never in the pure-function runner / CI.
    exclude: [...configDefaults.exclude, '**/*.dbtest.ts', ...(namesHandoff ? [] : ['.handoff/**'])],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
