/**
 * sentry.client.config.ts — Sentry browser-side initialisation
 *
 * Notes: enabled ONLY in the production Vercel environment (DSN set + NEXT_PUBLIC_VERCEL_ENV=production) —
 *        preview/dev never emit, so they never trigger Sentry alert emails. Session replay deferred —
 *        POPIA assessment pending. Events go through /monitoring tunnel to avoid ad-blocker interference.
 */
import * as Sentry from "@sentry/nextjs"
import { scrubEvent } from "@/lib/observability/scrubbing"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0, // session replay deferred
  replaysOnErrorSampleRate: 0,

  beforeSend: scrubEvent,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_PUBLIC_VERCEL_ENV === "production",
})
