/**
 * sentry.edge.config.ts — Sentry edge runtime initialisation (middleware, edge routes)
 *
 * Notes: edge runtime has limited Node.js APIs — Sentry's edge SDK handles this. Enabled ONLY in the
 *        production Vercel environment (DSN set + VERCEL_ENV=production) — preview/dev never emit.
 *        Loaded via instrumentation.ts register() hook when NEXT_RUNTIME === "edge".
 */
import * as Sentry from "@sentry/nextjs"
import { scrubEvent } from "@/lib/observability/scrubbing"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  tracesSampleRate: 0.1,

  beforeSend: scrubEvent,
  enabled: !!process.env.SENTRY_DSN && process.env.VERCEL_ENV === "production",
})
