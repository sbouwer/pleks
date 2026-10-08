/**
 * instrumentation-client.ts — Sentry browser-side initialisation
 *
 * Notes: the ONLY client entry Turbopack loads. Next 16 builds with Turbopack, and @sentry/nextjs injects
 *        `sentry.client.config.ts` only on the webpack path, so under that name browser Sentry never
 *        initialised (walker F8, .handoff/sentry-scrub/01-walker.md). clientSentry.test.ts fails if that file
 *        comes back. Enabled ONLY in the production Vercel environment (DSN set +
 *        NEXT_PUBLIC_VERCEL_ENV=production) — preview/dev never emit, so they never trigger Sentry alert
 *        emails. Session replay deferred — POPIA assessment pending. Events go through the /monitoring
 *        tunnel to avoid ad-blocker interference. All three send paths are scrubbed: errors,
 *        transactions, and standalone web-vital spans (beforeSendSpan), which skip the other two.
 */
import * as Sentry from "@sentry/nextjs"
import { scrubEvent, scrubSpan, scrubTransaction } from "@/lib/observability/scrubbing"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0, // session replay deferred
  replaysOnErrorSampleRate: 0,

  beforeSend: scrubEvent,
  beforeSendTransaction: scrubTransaction,
  beforeSendSpan: scrubSpan,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN && process.env.NEXT_PUBLIC_VERCEL_ENV === "production",
})

// App Router navigation spans; Sentry v10 reads this export from instrumentation-client.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
