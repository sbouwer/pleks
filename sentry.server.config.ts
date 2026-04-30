/**
 * sentry.server.config.ts — Sentry Node.js server-side initialisation
 *
 * Notes: enabled only when SENTRY_DSN is set. Loaded via instrumentation.ts
 *        register() hook — do not import this file directly.
 */
import * as Sentry from "@sentry/nextjs"
import { scrubEvent } from "@/lib/observability/scrubbing"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  tracesSampleRate: 0,

  beforeSend: scrubEvent,
  enabled: !!process.env.SENTRY_DSN,
})
