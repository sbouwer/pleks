/**
 * test/db/resend-bounce-revoke.dbtest.ts — a hard bounce revokes the credential nobody received
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  NOW.md item 6 / SPEC_ITEM6_BOUNCE_REVOKE.md §5 bullets 1-5 — the behavioural half of the
 *         coverage the enumeration test (app/api/webhooks/resend/__tests__/credential-token-coverage.test.ts)
 *         cannot provide by construction: that test proves every credential-token table is WIRED
 *         OR EXCUSED, never that the wired one actually revokes on the wire. This drives REAL,
 *         Svix-signed POSTs through app/api/webhooks/resend/route.ts against a live
 *         tenant_portal_tokens row — no mocked verifier, no mocked Supabase chain.
 *
 *         TRAP: RESEND_WEBHOOK_SECRET is read at route.ts MODULE TOP LEVEL via `optionalEnv(...)`,
 *         not per-request. A static `import { POST } from ".../route"` is hoisted above any
 *         beforeAll/beforeEach that sets process.env, so the constant freezes as "" and every
 *         request 401s no matter how correctly it's signed. Fix: set the env var FIRST — at
 *         module scope, before the route is ever imported — then dynamic-`import()` it.
 *
 *         Signing is real: `svix` (the same `Webhook` class Resend's own delivery — and the route's
 *         verifier — use) signs in-process with the secret the route was frozen with.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { randomUUID, randomBytes } from "node:crypto"
import { Webhook } from "svix"
import * as Sentry from "@sentry/nextjs"
import { svc, seedEmptyOrg, seedLedgerCase, teardownOrg, forceTenantPortalTokenUpdateFailure } from "@/test/db/tier"

// ── Trap 1 — the secret must exist BEFORE route.ts is ever evaluated ─────────────────────────────
const RESEND_TEST_SECRET = "whsec_" + randomBytes(24).toString("base64")
process.env.RESEND_WEBHOOK_SECRET = RESEND_TEST_SECRET

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }))

let POST: typeof import("@/app/api/webhooks/resend/route").POST

beforeAll(async () => {
  vi.resetModules()
  ;({ POST } = await import("@/app/api/webhooks/resend/route"))
})

const db = svc()
const orgIds: string[] = []
afterAll(() => { for (const id of orgIds) teardownOrg(id) })

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}) })
afterEach(() => { vi.restoreAllMocks() })

// ── Signing (trap 2 — sign for real, do not bypass verification) ─────────────────────────────────

/** Sign a body exactly as Resend's Svix delivery would, with the secret route.ts was frozen with. */
function signedHeaders(body: string): Record<string, string> {
  const svixId = `msg_${randomUUID()}`
  const tsSeconds = Math.floor(Date.now() / 1000)
  const wh = new Webhook(RESEND_TEST_SECRET)
  const signature = wh.sign(svixId, new Date(tsSeconds * 1000), body)
  return { "svix-id": svixId, "svix-timestamp": String(tsSeconds), "svix-signature": signature }
}

async function postWebhook(payload: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const body = JSON.stringify(payload)
  const req = new NextRequest("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: { "content-type": "application/json", ...signedHeaders(body) },
    body,
  })
  const res = await POST(req)
  return { status: res.status, json: await res.json() }
}

function bouncePayload(
  emailId: string,
  type: "email.bounced" | "email.complained",
  bounceType?: "permanent" | "transient",
): Record<string, unknown> {
  return {
    type,
    created_at: new Date().toISOString(),
    data: {
      email_id: emailId,
      from: "noreply@pleks.co.za",
      to: ["tenant@example.test"],
      subject: "Your tenant portal link",
      ...(bounceType ? { bounce: { type: bounceType } } : {}),
    },
  }
}

// ── Seeding — a comm log row (+ optionally a tenant_portal_tokens row pointing at it) ────────────

async function seedCommLogWithToken(): Promise<{ tokenId: string; emailId: string }> {
  const seeded = await seedLedgerCase(db, { invoices: [] })
  orgIds.push(seeded.orgId)
  const emailId = `re_${randomUUID()}`

  const { data: log, error: logErr } = await db.from("communication_log").insert({
    org_id: seeded.orgId, tenant_id: seeded.tenantId, lease_id: seeded.leaseId,
    channel: "email", direction: "outbound", external_id: emailId,
    sent_to_email: "tenant@example.test",
  }).select("id").single()
  if (logErr) throw new Error(`seed communication_log: ${logErr.message}`)

  const { data: token, error: tokenErr } = await db.from("tenant_portal_tokens").insert({
    org_id: seeded.orgId, tenant_id: seeded.tenantId, lease_id: seeded.leaseId,
    communication_log_id: log.id as string, created_by: randomUUID(),
  }).select("id").single()
  if (tokenErr) throw new Error(`seed tenant_portal_tokens: ${tokenErr.message}`)

  return { tokenId: token.id as string, emailId }
}

/** A comm log row with NO credential token pointed at it — bullet 4. */
async function seedCommLogWithoutToken(): Promise<{ emailId: string }> {
  const orgId = await seedEmptyOrg(db)
  orgIds.push(orgId)
  const emailId = `re_${randomUUID()}`

  const { error } = await db.from("communication_log").insert({
    org_id: orgId, channel: "email", direction: "outbound", external_id: emailId,
    sent_to_email: "nobody@example.test",
  })
  if (error) throw new Error(`seed communication_log: ${error.message}`)

  return { emailId }
}

async function tokenRevoked(tokenId: string): Promise<boolean> {
  const { data, error } = await db.from("tenant_portal_tokens").select("revoked").eq("id", tokenId).single()
  if (error) throw new Error(`read tenant_portal_tokens: ${error.message}`)
  return data.revoked as boolean
}

// ── The five behavioural tests (SPEC_ITEM6_BOUNCE_REVOKE.md §5, bullets 1-5) ─────────────────────

describe("resend webhook — bounce/complaint revokes (or doesn't) the credential token", () => {
  it("gets a real 200 through genuine Svix signature verification (trap 1/2 sanity check)", async () => {
    // Not one of the five spec bullets — proof that trap 1 is actually solved before relying on it
    // for the five below. If signing/env timing were broken, EVERY test in this file would 401, and
    // a bare status-code assertion elsewhere could not distinguish "revoked correctly" from
    // "never got past the signature gate".
    const { emailId } = await seedCommLogWithoutToken()
    const { status, json } = await postWebhook(bouncePayload(emailId, "email.bounced", "permanent"))
    expect(status).toBe(200)
    expect(json).toEqual({ ok: true })
  })

  it("1. hard bounce on a portal-link comm revokes the token", async () => {
    const { tokenId, emailId } = await seedCommLogWithToken()
    const { status, json } = await postWebhook(bouncePayload(emailId, "email.bounced", "permanent"))
    expect(status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(await tokenRevoked(tokenId)).toBe(true)
  })

  it("2. soft bounce leaves the token untouched — transient, may still deliver", async () => {
    const { tokenId, emailId } = await seedCommLogWithToken()
    const { status } = await postWebhook(bouncePayload(emailId, "email.bounced", "transient"))
    expect(status).toBe(200)
    expect(await tokenRevoked(tokenId)).toBe(false)
  })

  it("3. a complaint leaves the token untouched — it arrived, the recipient just objected", async () => {
    const { tokenId, emailId } = await seedCommLogWithToken()
    const { status } = await postWebhook(bouncePayload(emailId, "email.complained"))
    expect(status).toBe(200)
    expect(await tokenRevoked(tokenId)).toBe(false)
  })

  it("4. hard bounce on a comm with no credential token is a no-op, not an error", async () => {
    const { emailId } = await seedCommLogWithoutToken()
    const { status, json } = await postWebhook(bouncePayload(emailId, "email.bounced", "permanent"))
    expect(status).toBe(200)
    expect(json).toEqual({ ok: true })
  })

  it("5. a DB failure on the revoke still returns 200 AND captures to Sentry (the loud-failure rule)", async () => {
    const { tokenId, emailId } = await seedCommLogWithToken()

    forceTenantPortalTokenUpdateFailure(true)
    let status: number, json: unknown
    try {
      ;({ status, json } = await postWebhook(bouncePayload(emailId, "email.bounced", "permanent")))
    } finally {
      forceTenantPortalTokenUpdateFailure(false)
    }

    // The 200 alone proves nothing — a route that silently ate the error also returns 200. The
    // point of this test is the capture, so assert it explicitly rather than stopping at status.
    expect(status).toBe(200)
    expect(json).toEqual({ ok: true })

    const captureException = vi.mocked(Sentry.captureException)
    expect(captureException).toHaveBeenCalledTimes(1)
    const [err, ctx] = captureException.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain("tenant_portal_tokens")
    expect(ctx).toMatchObject({
      level: "error",
      extra: expect.objectContaining({ table: "tenant_portal_tokens" }),
    })

    // And the row genuinely wasn't revoked — this is the fact the capture is reporting.
    expect(await tokenRevoked(tokenId)).toBe(false)
  })
})
