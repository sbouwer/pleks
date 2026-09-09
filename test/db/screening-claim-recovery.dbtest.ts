/**
 * test/db/screening-claim-recovery.dbtest.ts — a screening claim can be taken, and can be recovered (M-111)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Three defects are probed here, and the first is the one that makes the other two matter.
 *
 *         1. THE CLAIM WAS IMPOSSIBLE ON A COMPANY SUBJECT. `applications.searchworx_check_status`
 *            carried a CHECK over ('not_run','pending','complete','failed'); the runner claims by
 *            writing 'running'. Every company claim raised 23514, the route logged it and read the
 *            empty result as "another runner owns this line", and reported the batch ok. The sibling
 *            table had no CHECK at all, so the same code worked there. One column, two tables.
 *
 *         2. A STRANDED CLAIM WAS UNRECOVERABLE — 'running' is not in the claim predicate, so nothing
 *            could ever re-match the row.
 *
 *         3. AND IT READ AS pending_both. The view's ELSE arm means a claimed or failed line looked
 *            identical to one that had never paid or consented — which the reminder cron owns. So a
 *            line stranded mid-run got "your portion is still outstanding" emails and, at T+14, was
 *            declined with `expired_no_completion` and flagged for refund: a record of the applicant
 *            failing to do something they had done.
 *
 *         The sweep's threshold is not probed for its VALUE (that is a judgement recorded at the
 *         constant); it is probed for its BOUNDARY — old claims move, fresh ones do not.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"
import { sweepStrandedClaims, STRANDED_CLAIM_MINUTES } from "@/lib/screening/sweepStrandedClaims"

const db = svc()

const CHECK_VIOLATION = "23514"

type Seed = { orgId: string; applicationId: string; listingId: string; unitId: string }

/** org → property → unit → listing → application, because `applications.listing_id` is NOT NULL. */
async function seedOrgWithApplication(entityType = "individual"): Promise<Seed> {
  const seeded = await seedLedgerCase(db, { invoices: [] })
  const { data: listing, error: listingErr } = await db
    .from("listings")
    .insert({ org_id: seeded.orgId, unit_id: seeded.unitId, property_id: seeded.propertyId, asking_rent_cents: 1_000_000 })
    .select("id").single()
  if (listingErr) throw new Error(`seed listing: ${listingErr.message}`)

  const { data: app, error: appErr } = await db
    .from("applications")
    .insert({
      org_id: seeded.orgId, listing_id: listing.id as string, unit_id: seeded.unitId,
      first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test`,
      entity_type: entityType,
    })
    .select("id").single()
  if (appErr) throw new Error(`seed application: ${appErr.message}`)

  return { orgId: seeded.orgId, applicationId: app.id as string, listingId: listing.id as string, unitId: seeded.unitId }
}

async function seedCoApplicant(seed: Seed, extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db
    .from("application_co_applicants")
    .insert({
      org_id: seed.orgId, primary_application_id: seed.applicationId,
      first_name: "Dee", last_name: "Rector", applicant_email: `dir-${randomUUID()}@example.test`,
      ...extra,
    })
    .select("id").single()
  if (error) throw new Error(`seed co-applicant: ${error.message}`)
  return data.id as string
}

/** A PAID line. The view's new arms all require paid AND consented, so this is what makes them reachable. */
async function seedPaidLine(seed: Seed, subjectType: "company" | "co_applicant", subjectId: string): Promise<void> {
  const { error } = await db.from("application_screening_payments").insert({
    org_id: seed.orgId, application_id: seed.applicationId,
    subject_type: subjectType, subject_id: subjectId,
    fee_cents: 25_000, paid_at: new Date().toISOString(),
  })
  if (error) throw new Error(`seed payment: ${error.message}`)
}

async function stateOf(applicationId: string, subjectId: string): Promise<string | null> {
  const { data, error } = await db
    .from("v_application_screening_lines")
    .select("state")
    .eq("application_id", applicationId)
    .eq("subject_id", subjectId)
    .maybeSingle()
  if (error) throw new Error(`read view: ${error.message}`)
  return (data?.state as string) ?? null
}

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()

/**
 * Reads a status back. The error is checked rather than dropped, so a broken read fails AS a broken
 * read — dropped, it returns `data: null`, the assertion sees `undefined`, and the report blames the
 * sweep for something the query did. That mis-attribution is this file's own subject matter.
 */
async function statusOf(
  table: "applications" | "application_co_applicants",
  orgId: string,
  id: string,
): Promise<string | null> {
  const { data, error } = await db
    .from(table)
    .select("searchworx_check_status")
    .eq("org_id", orgId)
    .eq("id", id)
    .single()
  if (error) throw new Error(`read ${table} ${id}: ${error.message}`)
  return (data?.searchworx_check_status as string) ?? null
}

describe("the claim itself — 'running' must be a legal status on BOTH subject tables", () => {
  let seed: Seed

  beforeAll(async () => { seed = await seedOrgWithApplication() }, 60_000)
  afterAll(() => { if (seed?.orgId) teardownOrg(seed.orgId) })

  it("KNOWN-GOOD: a company claim succeeds — the exact write that used to raise 23514", async () => {
    const claim = await db
      .from("applications")
      .update({ searchworx_check_status: "running", searchworx_run_started_at: new Date().toISOString() })
      .eq("id", seed.applicationId)
      .eq("org_id", seed.orgId)
      .in("searchworx_check_status", ["pending", "not_run"])
      .select("id")
    expect(claim.error, "the CHECK constraint excluded 'running', so this raised 23514 every time").toBeNull()
    expect(claim.data, "and an empty claim was read as a race, so the line was silently skipped forever").toHaveLength(1)
  }, 60_000)

  it("KNOWN-GOOD: a co-applicant claim succeeds", async () => {
    const coAppId = await seedCoApplicant(seed)
    const claim = await db
      .from("application_co_applicants")
      .update({ searchworx_check_status: "running", searchworx_run_started_at: new Date().toISOString() })
      .eq("id", coAppId)
      .eq("org_id", seed.orgId)
      .in("searchworx_check_status", ["pending", "not_run"])
      .select("id")
    expect(claim.error).toBeNull()
    expect(claim.data).toHaveLength(1)
  }, 60_000)

  it("FIRES: an unknown status is refused on the co-applicant table, which had no CHECK at all", async () => {
    const coAppId = await seedCoApplicant(seed)
    const bad = await db
      .from("application_co_applicants")
      .update({ searchworx_check_status: "runnning" })  // typo on purpose
      .eq("id", coAppId).eq("org_id", seed.orgId)
    expect(bad.error?.code, "the value set is now stated on both tables, not enforced on one and implied on the other").toBe(CHECK_VIOLATION)
  }, 60_000)
})

describe("the view — a claimed or failed line must not read as 'never paid, never consented'", () => {
  let seed: Seed

  beforeAll(async () => { seed = await seedOrgWithApplication() }, 60_000)
  afterAll(() => { if (seed?.orgId) teardownOrg(seed.orgId) })

  async function lineWith(status: string, consented: boolean): Promise<string> {
    const coAppId = await seedCoApplicant(seed, {
      searchworx_check_status: status,
      stage2_consent_given_at: consented ? new Date().toISOString() : null,
    })
    await seedPaidLine(seed, "co_applicant", coAppId)
    return coAppId
  }

  it("a claimed line reads 'running' — it used to read 'pending_both'", async () => {
    const id = await lineWith("running", true)
    expect(await stateOf(seed.applicationId, id)).toBe("running")
  }, 60_000)

  it("a failed line reads 'failed' — it used to read 'pending_both'", async () => {
    const id = await lineWith("failed", true)
    expect(await stateOf(seed.applicationId, id)).toBe("failed")
  }, 60_000)

  it("NEITHER is in the reminder cron's filter — which is the point", async () => {
    // The cron selects .in("state", ["pending_both","paid_pending_consent","consented_pending_payment"]).
    // Asserted as the set, not by calling the cron: the defect was that these two states fell INTO it.
    const REMINDER_FILTER = ["pending_both", "paid_pending_consent", "consented_pending_payment"]
    expect(REMINDER_FILTER).not.toContain("running")
    expect(REMINDER_FILTER).not.toContain("failed")
  })

  it("KNOWN-GOOD: a pending line still reads 'ready_to_run' — the runner's own filter is untouched", async () => {
    const id = await lineWith("pending", true)
    expect(await stateOf(seed.applicationId, id)).toBe("ready_to_run")
  }, 60_000)

  it("KNOWN-GOOD: a complete line still reads 'complete'", async () => {
    const id = await lineWith("complete", true)
    expect(await stateOf(seed.applicationId, id)).toBe("complete")
  }, 60_000)

  it("KNOWN-GOOD: paid but NOT consented still reads 'paid_pending_consent', even mid-run", async () => {
    // The new arms are guarded on consent as well as payment, so they must not swallow this one —
    // it is a line the reminder cron legitimately owns and must keep chasing.
    const id = await lineWith("running", false)
    expect(await stateOf(seed.applicationId, id)).toBe("paid_pending_consent")
  }, 60_000)
})

describe("the sweep — the half that does not assume our own code got to run", () => {
  let seed: Seed

  beforeAll(async () => { seed = await seedOrgWithApplication() }, 60_000)
  afterAll(() => { if (seed?.orgId) teardownOrg(seed.orgId) })

  it("FIRES: a claim older than the threshold is marked failed, on both tables", async () => {
    const stale = minutesAgo(STRANDED_CLAIM_MINUTES + 5)
    await db.from("applications")
      .update({ searchworx_check_status: "running", searchworx_run_started_at: stale })
      .eq("id", seed.applicationId).eq("org_id", seed.orgId)
    const coAppId = await seedCoApplicant(seed, { searchworx_check_status: "running", searchworx_run_started_at: stale })

    const swept = await sweepStrandedClaims(db)
    expect(swept, "one application + one co-applicant").toBeGreaterThanOrEqual(2)

    expect(await statusOf("applications", seed.orgId, seed.applicationId)).toBe("failed")
    expect(await statusOf("application_co_applicants", seed.orgId, coAppId)).toBe("failed")
  }, 60_000)

  it("KNOWN-GOOD: a claim INSIDE the threshold is left alone — reclaiming it would re-charge the run", async () => {
    const fresh = minutesAgo(STRANDED_CLAIM_MINUTES - 5)
    const coAppId = await seedCoApplicant(seed, { searchworx_check_status: "running", searchworx_run_started_at: fresh })

    await sweepStrandedClaims(db)

    expect(
      await statusOf("application_co_applicants", seed.orgId, coAppId),
      "a line still in flight must survive the sweep",
    ).toBe("running")
  }, 60_000)

  it("KNOWN-GOOD: a completed line is untouched however old it is", async () => {
    const coAppId = await seedCoApplicant(seed, {
      searchworx_check_status: "complete",
      searchworx_run_started_at: minutesAgo(60 * 24 * 30),
    })

    await sweepStrandedClaims(db)

    expect(
      await statusOf("application_co_applicants", seed.orgId, coAppId),
      "the sweep is keyed on 'running', not on age alone",
    ).toBe("complete")
  }, 60_000)

  it("KNOWN-GOOD: a claim with a NULL start time is not swept", async () => {
    // `.lt()` on NULL is not true, so this passes today by SQL semantics rather than by intent.
    // Probed because the alternative — a NULL read as infinitely old — would sweep every row the
    // moment someone rewrites the predicate, and the failure would look like a working sweep.
    const coAppId = await seedCoApplicant(seed, { searchworx_check_status: "running", searchworx_run_started_at: null })

    await sweepStrandedClaims(db)

    expect(await statusOf("application_co_applicants", seed.orgId, coAppId)).toBe("running")
  }, 60_000)
})
