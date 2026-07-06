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

export default defineConfig({
  test: {
    environment: 'node',
    // DB-integration tests (*.dbtest.ts) need a live local Supabase — run them via
    // `npm run test:db` (vitest.db.config.ts), never in the pure-function runner / CI.
    exclude: [...configDefaults.exclude, '**/*.dbtest.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
