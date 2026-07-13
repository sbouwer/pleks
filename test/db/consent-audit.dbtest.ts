/**
 * test/db/consent-audit.dbtest.ts — the consent audit trail must actually be WRITABLE
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Every POPIA consent event the live routes write was REJECTED by Postgres for seven weeks.
 *
 *         ADDENDUM_14F added eight `consent_*` values to `auth_events_event_type_check`. Thirteen days later
 *         BUILD_AUTH_RESOLVER did a DROP + ADD on the same constraint to add the resolver types, and its new
 *         value list simply omitted all eight — a DROP+ADD must RE-STATE every value it means to keep, and this
 *         one did not. Migrations replay top-to-bottom, so the narrower list won.
 *
 *         The consequence was invisible: `/api/consent/send-code` and `/api/consent/verify-code` write those
 *         event types on every SMS round, the insert 23514'd, the route `console.error`'d it and RETURNED 200.
 *         The user saw "verified". The compliance record the write exists to create did not exist. Production
 *         confirms it: 173 rows in auth_events, ZERO of any consent_* type. Not one has ever landed.
 *
 *         No test referenced these values, so nothing could have caught it. This is that test. It asserts the
 *         thing a source review structurally cannot see — that the value the code writes is a value the column
 *         will ACCEPT — and it will fail the moment another DROP+ADD forgets to re-state them.
 */
import { describe, it, expect, afterAll } from "vitest"
import { svc, seedEmptyOrg, seedUser, teardownOrg, teardownUser } from "@/test/db/tier"

const db = svc()

/** Exactly the values the live consent routes write, plus the four the flow is specced to write. */
const CONSENT_EVENT_TYPES = [
  "consent_code_sent",
  "consent_code_verified",
  "consent_verification_failed",
  "consent_verification_locked_out",
  "consent_email_link_sent",
  "consent_email_link_verified",
  "consent_special_information_given",
  "consent_special_information_revoked",
] as const

/** The resolver types added by the DROP+ADD that dropped the consent ones — they must SURVIVE the restore. */
const RESOLVER_EVENT_TYPES = [
  "resolver_decision",
  "email_existence_check",
  "membership_claimed",
  "membership_claim_blocked_by_invariant",
] as const

describe("consent audit trail — the event types the routes write must be ACCEPTED by the column", () => {
  const orgs: string[] = []
  let userId: string

  afterAll(() => {
    for (const o of orgs.splice(0)) teardownOrg(o)
    if (userId) teardownUser(userId)
  })

  it("every consent_* event type the live routes write can actually be inserted", async () => {
    userId = seedUser()
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const rejected: string[] = []
    for (const event_type of CONSENT_EVENT_TYPES) {
      const { error } = await db.from("auth_events").insert({
        org_id: org, user_id: userId, event_type, success: true,
      })
      if (error) rejected.push(`${event_type} → ${error.code} ${error.message}`)
    }

    expect(
      rejected,
      "a consent event the routes WRITE but the column REJECTS is a POPIA record that silently never exists",
    ).toEqual([])
  }, 60_000)

  it("restoring the consent types did not drop the resolver types — a DROP+ADD must re-state everything", async () => {
    // The original defect was a DROP+ADD that kept only what its author was thinking about. The fix must not
    // repeat the mistake in the other direction, so this pins BOTH halves of the constraint at once.
    const org = await seedEmptyOrg(db)
    orgs.push(org)

    const rejected: string[] = []
    for (const event_type of RESOLVER_EVENT_TYPES) {
      const { error } = await db.from("auth_events").insert({
        org_id: org, user_id: userId, event_type, success: true,
      })
      if (error) rejected.push(`${event_type} → ${error.code} ${error.message}`)
    }

    expect(rejected, "the restore must be additive — it may not evict what it found").toEqual([])
  }, 60_000)
})
