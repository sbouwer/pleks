/**
 * sentry.server.config.ts — Sentry Node.js server-side initialisation
 *
 * Notes: enabled ONLY in the production Vercel environment (DSN set + VERCEL_ENV=production) — preview and
 *        development never emit, so they never trigger Sentry alert emails. Loaded via instrumentation.ts
 *        register() hook — do not import this file directly.
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
