/**
 * test/db/notification-trail-immutable.dbtest.ts — the 14X notification trail is append-only, and still leaves with its application (ADDENDUM_14X §3, §5)
 *
 * Auth:   raw psql + service client vs LOCAL Supabase (npm run test:db)
 * Notes:  Probed both ways on the REAL table. Refused: any UPDATE, TRUNCATE, a direct DELETE while the application exists
 *         (even with organisations.deleted_at set), and any UPDATE/DELETE from the service client (grant revoked).
 *         Allowed: an application delete cascading its trail away (POPIA erasure, the retention purge, an agent's
 *         delete), and the real purge_org_cascade over an org whose trail pins a communication_log row — it deletes
 *         every org_id table directly and catches only FK violations, so a refusal there would abort the whole purge.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { psql, svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()
let orgId = ""
let listingId = ""
let unitId = ""

async function seedApplication(): Promise<string> {
  const { data, error } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listingId, unit_id: unitId, entity_type: "individual", applicant_type: "individual",
      first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test` })
    .select("id").single()
  if (error) throw new Error(`seed application: ${error.message}`)
  return data.id as string
}

/** One trail row for the lead, written the way the cron writes it. Returns the row id. */
async function trailRow(applicationId: string, milestone = "N1"): Promise<string> {
  const { data, error } = await db.from("screening_notification_events")
    .insert({ org_id: orgId, application_id: applicationId, subject_type: "applicant", subject_id: applicationId,
      milestone, template_key: "application.co_applicant_invited", template_version: 1, channel: "email",
      deadline_as_stated: "2026-10-19", send_ok: true })
    .select("id").single()
  if (error) throw new Error(`trail insert: ${error.message}`)
  return data.id as string
}

async function trailCount(applicationId: string): Promise<number> {
  const { count, error } = await db.from("screening_notification_events")
    .select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("application_id", applicationId)
  if (error) throw new Error(`trail count: ${error.message}`)
  return count ?? 0
}

beforeAll(async () => {
  const s = await seedLedgerCase(db, { invoices: [] })
  orgId = s.orgId
  unitId = s.unitId
  const { data: listing, error } = await db.from("listings")
    .insert({ org_id: orgId, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 }).select("id").single()
  if (error) throw new Error(`seed listing: ${error.message}`)
  listingId = listing.id as string
}, 120_000)
afterAll(() => { if (orgId) teardownOrg(orgId) })

describe("screening_notification_events — append-only, enforced (14X §3)", () => {
  it("all three triggers are attached and call the trail's own function", () => {
    expect(() => psql(`DO $$ BEGIN
      IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.screening_notification_events'::regclass
            AND tgname IN ('trg_screening_notification_events_immutable_u','trg_screening_notification_events_immutable_d',
                           'trg_screening_notification_events_immutable_t')
            AND tgenabled <> 'D' AND tgfoid = 'public.screening_notification_events_immutable()'::regprocedure) <> 3 THEN
        RAISE EXCEPTION 'trail immutability triggers missing';
      END IF;
    END $$;`)).not.toThrow()
  })

  it("PLANTED: a caller's temp `applications` cannot answer the guard's \"application is gone\" test (walker 03 F2)", async () => {
    const app = await seedApplication()
    const id = await trailRow(app)
    expect(() => psql(`CREATE TEMP TABLE applications (id uuid);
      DELETE FROM screening_notification_events WHERE id = '${id}';`)).toThrow(/append-only/)
    expect(await trailCount(app)).toBe(1)
  })

  it("KNOWN-GOOD: a send attempt writes a row, and a retry of the same milestone writes a SECOND row", async () => {
    const app = await seedApplication()
    await trailRow(app, "N2")
    await trailRow(app, "N2")
    expect(await trailCount(app), "a failed send is retried and the failure row stays — no unique key").toBe(2)
  })

  it("PLANTED: an UPDATE is refused — a row's outcome is fixed at the attempt", async () => {
    const app = await seedApplication()
    const id = await trailRow(app)
    expect(() => psql(`UPDATE screening_notification_events SET send_ok = false WHERE id = '${id}';`)).toThrow(/append-only/)
  })

  it("PLANTED: a direct DELETE is refused while the application and org exist", async () => {
    const app = await seedApplication()
    const id = await trailRow(app)
    expect(() => psql(`DELETE FROM screening_notification_events WHERE id = '${id}';`)).toThrow(/append-only/)
    expect(await trailCount(app)).toBe(1)
  })

  it("KNOWN-GOOD: deleting the application cascades its trail away (erasure, retention purge, agent delete)", async () => {
    const app = await seedApplication()
    await trailRow(app)
    await trailRow(app, "N2")
    expect(() => psql(`DELETE FROM applications WHERE id = '${app}';`)).not.toThrow()
    expect(await trailCount(app)).toBe(0)
  })

  it("PLANTED: TRUNCATE is refused — it fires no row trigger, so it has its own", async () => {
    const app = await seedApplication()
    await trailRow(app)
    expect(() => psql(`TRUNCATE screening_notification_events;`)).toThrow(/TRUNCATE refused/)
    expect(await trailCount(app)).toBe(1)
  })

  // Either layer refuses. The migration REVOKEs U/D/T from service_role, but global-setup.ts GRANTs ALL to it to mirror
  // hosted Supabase, so locally the trigger is what answers; the REVOKE is read back on prod after the DDL applies.
  it("PLANTED: the service client cannot UPDATE or DELETE a row", async () => {
    const app = await seedApplication()
    const id = await trailRow(app)
    const upd = await db.from("screening_notification_events").update({ send_ok: false }).eq("org_id", orgId).eq("id", id)
    expect(upd.error?.message).toMatch(/permission denied|append-only/)
    const del = await db.from("screening_notification_events").delete().eq("org_id", orgId).eq("id", id)
    expect(del.error?.message).toMatch(/permission denied|append-only/)
    expect(await trailCount(app)).toBe(1)
  })

  it("KNOWN-GOOD: the service client deleting an APPLICATION still cascades its trail (RI runs as the table owner)", async () => {
    const app = await seedApplication()
    await trailRow(app)
    const { error } = await db.from("applications").delete().eq("org_id", orgId).eq("id", app)
    expect(error).toBeNull()
    expect(await trailCount(app)).toBe(0)
  })

  it("PLANTED: organisations.deleted_at alone opens nothing — an org owner can set it without a purge (walker F2)", async () => {
    const app = await seedApplication()
    const id = await trailRow(app)
    expect(() => psql(`BEGIN; UPDATE organisations SET deleted_at = now() WHERE id = '${orgId}';
      DELETE FROM screening_notification_events WHERE id = '${id}'; COMMIT;`)).toThrow(/append-only/)
    psql(`UPDATE organisations SET deleted_at = NULL WHERE id = '${orgId}';`)
    expect(await trailCount(app)).toBe(1)
  })
})

describe("purge_org_cascade still completes over a trail (walker F3)", () => {
  it("carries its search_path in its own definition — CREATE OR REPLACE resets proconfig (walker 03 F1)", () => {
    expect(() => psql(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.purge_org_cascade(uuid, text)'::regprocedure
            AND proconfig @> ARRAY['search_path=public, pg_temp']) THEN
        RAISE EXCEPTION 'purge_org_cascade has a mutable search_path';
      END IF;
    END $$;`)).not.toThrow()
  })

  it("KNOWN-GOOD: an org with trail rows and the delivery row they pin purges whole", async () => {
    const s = await seedLedgerCase(db, { invoices: [] })
    const purgeOrg = s.orgId
    try {
      const { data: listing, error: lErr } = await db.from("listings")
        .insert({ org_id: purgeOrg, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 }).select("id").single()
      if (lErr) throw new Error(`seed listing: ${lErr.message}`)
      const { data: app, error: aErr } = await db.from("applications")
        .insert({ org_id: purgeOrg, listing_id: listing.id, unit_id: s.unitId, entity_type: "individual", applicant_type: "individual",
          first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test` })
        .select("id").single()
      if (aErr) throw new Error(`seed application: ${aErr.message}`)
      const { data: log, error: cErr } = await db.from("communication_log")
        .insert({ org_id: purgeOrg, channel: "email", direction: "outbound", subject: "invite" }).select("id").single()
      if (cErr) throw new Error(`seed communication_log: ${cErr.message}`)
      const { error: tErr } = await db.from("screening_notification_events")
        .insert({ org_id: purgeOrg, application_id: app.id, subject_type: "applicant", subject_id: app.id, milestone: "N1",
          template_key: "application.co_applicant_invited", template_version: 1, channel: "email", send_ok: true,
          communication_log_id: log.id })
      if (tErr) throw new Error(`trail insert: ${tErr.message}`)

      const { error } = await db.rpc("purge_org_cascade", { p_org_id: purgeOrg, p_reason: "14x trail probe" })
      expect(error).toBeNull()
      const { count, error: rErr } = await db.from("screening_notification_events")
        .select("id", { count: "exact", head: true }).eq("org_id", purgeOrg)
      expect(rErr).toBeNull()
      expect(count).toBe(0)
    } finally {
      teardownOrg(purgeOrg)
    }
  }, 120_000)
})
