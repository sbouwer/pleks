/**
 * instrumentation.ts — Next.js instrumentation hook for Sentry server/edge init
 *
 * Notes: Next.js calls register() once per runtime on cold start. The conditional
 *        import pattern is required — Sentry's server and edge SDKs are separate
 *        bundles and must not be cross-imported.
 */
import * as Sentry from "@sentry/nextjs"

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config")
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config")
  }
}

export const onRequestError = Sentry.captureRequestError
