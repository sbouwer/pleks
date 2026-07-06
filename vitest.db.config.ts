/**
 * vitest.db.config.ts — DB-integration test tier (runs against a LOCAL Supabase stack)
 *
 * Notes:  Separate from vitest.config.ts (pure-function). Runs `*.dbtest.ts` files only, which hit a
 *         real Postgres via the service-role client. Requires `npx supabase start` to be up. `next/headers`
 *         is aliased to a throwing stub (DB code imports server.ts which imports it but never calls it).
 *         Sequential (fileParallelism:false) so seed/teardown per test never races another file.
 *         Invoke with `npm run test:db`; the pure-function `npm test` excludes these.
 */
import { defineConfig } from "vitest/config"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.dbtest.ts"],
    globalSetup: ["./test/db/global-setup.ts"],
    setupFiles: ["./test/db/setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "next/headers": resolve(__dirname, "test/db/next-headers-stub.ts"),
      "@": resolve(__dirname, "."),
    },
  },
})
