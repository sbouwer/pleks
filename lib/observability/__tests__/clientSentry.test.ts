/**
 * lib/observability/__tests__/clientSentry.test.ts — the browser Sentry entry is the one Turbopack loads, and
 * what it sends is scrubbed
 *
 * Notes: the probe for walker F8 (.handoff/sentry-scrub/01-walker.md). The options instrumentation-client.ts
 *        hands to Sentry.init are replayed through the REAL browser SDK's client (@sentry/browser, the package
 *        @sentry/nextjs's client entry wraps) with a recording transport, so "a thrown error reaches Sentry with a scrubbed URL" is
 *        asserted on the envelope that would leave, not on the scrubber called by hand.
 */
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { describe, it, expect, vi, beforeAll } from "vitest"
import * as SentryBrowser from "@sentry/browser"

const TOKEN = "126581d5-7b64-4508-93bd-ff4f4e4a897a"
let clientOptions: Record<string, unknown> = {}

// The integration @sentry/nextjs's client ALWAYS installs, which rewrites every frame's origin to app:// before
// beforeSend runs (walker D1). Not in the package's exports map, so it is loaded by path.
const { nextjsClientStackFrameNormalizationIntegration } = createRequire(import.meta.url)(
  join(process.cwd(), "node_modules/@sentry/nextjs/build/cjs/client/clientNormalizationIntegration.js"),
) as { nextjsClientStackFrameNormalizationIntegration: (o: Record<string, unknown>) => ReturnType<typeof SentryBrowser.dedupeIntegration> }

vi.mock("@sentry/nextjs", () => ({
  init: (o: Record<string, unknown>) => { clientOptions = o },
  captureRouterTransitionStart: () => undefined,
}))

describe("instrumentation-client.ts — browser Sentry (walker F8)", () => {
  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@o0.ingest.sentry.io/0")
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production")
    await import("@/instrumentation-client")
    vi.unstubAllEnvs()
  })

  it("no sentry.client.config.* exists — Turbopack never loads it, so browser Sentry would be dark", () => {
    for (const ext of ["ts", "js", "mjs"]) expect(existsSync(join(process.cwd(), `sentry.client.config.${ext}`))).toBe(false)
  })

  it("is enabled in production and wires all three send paths", () => {
    expect(clientOptions.enabled).toBe(true)
    expect(clientOptions.beforeSend).toBeTypeOf("function")
    expect(clientOptions.beforeSendTransaction).toBeTypeOf("function")
    expect(clientOptions.beforeSendSpan).toBeTypeOf("function")
  })

  it("a thrown error reaches the transport with its URL, breadcrumbs and message scrubbed", async () => {
    const sent: unknown[] = []
    SentryBrowser.init({
      dsn: clientOptions.dsn as string,
      beforeSend: clientOptions.beforeSend as SentryBrowser.BrowserOptions["beforeSend"],
      defaultIntegrations: false,
      integrations: [nextjsClientStackFrameNormalizationIntegration({ experimentalThirdPartyOriginStackFrames: false })],
      transport: () => ({ send: async (envelope) => { sent.push(envelope); return {} }, flush: async () => true }),
    })
    SentryBrowser.withScope(scope => {
      scope.addBreadcrumb({ category: "navigation", data: { from: "/dashboard", to: `/approve/${TOKEN}?token=${TOKEN}` } })
      const page = `https://app.pleks.co.za/approve/${TOKEN}?token=${TOKEN}`
      scope.addEventProcessor(event => ({ ...event, request: { url: page } }))
      // A browser stack whose top frame is the PAGE (an inline handler; GlobalHandlers does the same for
      // "Script error."), parsed by the SDK's own stack parser, then normalised to app:// (walkers C1, D1).
      const err = new Error(`approve failed for /approve/${TOKEN}`)
      err.stack = [
        err.message.replace(/^/, "Error: "),
        `    at onclick (${page}:1:10)`,
        "    at render (https://app.pleks.co.za/_next/static/Ab3dEf6hIj9kLm2nOp5qR/_buildManifest.js:1:20)",
        `    at load (https://app.pleks.co.za/x?next=/_next/${TOKEN}:1:30)`,
      ].join("\n")
      SentryBrowser.captureException(err)
    })
    await SentryBrowser.flush(2000)

    const wire = JSON.stringify(sent)
    expect(sent).toHaveLength(1)
    expect(wire).not.toContain(TOKEN)
    expect(wire).toContain("https://app.pleks.co.za/approve/:id")
    expect(wire).toContain("approve failed for /approve/:id")
    expect(wire).toContain("app:///_next/static/Ab3dEf6hIj9kLm2nOp5qR/_buildManifest.js")
    expect(wire).toContain('"filename":"app:///approve/:id"')
  })

  it("a standalone web-vital span's page is scrubbed (walker W4)", () => {
    const scrub = clientOptions.beforeSendSpan as (s: { data: Record<string, unknown> }) => { data: Record<string, unknown> }
    expect(scrub({ data: { transaction: `/sign-signature/${TOKEN}?step=2`, "sentry.op": "ui.webvital.inp" } }).data)
      .toEqual({ transaction: "/sign-signature/:id", "sentry.op": "ui.webvital.inp" })
  })
})
