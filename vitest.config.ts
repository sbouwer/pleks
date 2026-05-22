/**
 * vitest.config.ts — Vitest configuration for unit tests
 *
 * Notes: Resolves @/ alias to match tsconfig paths. Pure-function tests only —
 *        no Next.js runtime, no DB, no API calls. External deps mocked per test.
 */
import { defineConfig } from 'vitest/config'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
})
