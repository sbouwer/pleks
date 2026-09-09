/**
 * test/db/recovery-email-drift.dbtest.ts — stale_recovery_emails reports drift, and only to service_role
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  ADDENDUM_62F §25.4. The function compares `contacts.primary_email` against the
 *         `auth.users.email` that account recovery actually resolves against (§24.1). Two of its
 *         properties can only be STATED in the migration and have to be executed to be believed.
 *
 *         1. THE ORG FILTER IS THE ONLY BOUNDARY. The function is SECURITY DEFINER, so RLS on
 *            `tenants` does not apply — `p_org_id` is all that separates one agency's tenants from
 *            another's. That is the 2026-07-06 cross-org scar's exact shape (CLAUDE.md §6), so a
 *            second org's drifted tenant is seeded and asserted absent. Without this case the
 *            function could return every org's rows and every other assertion here would still pass.
 *
 *         2. THE GRANT IS THE CONTROL. Being revoked from `authenticated` is what makes (1) safe to
 *            rely on, and a grant is invisible to supabase-js, which only ever speaks as one role.
 *            Probed through psql with `SET ROLE`, both directions: service_role executes it, and
 *            `authenticated` is refused. A test that only proved the happy path would pass just as
 *            well against a function granted to the world.
 *
 *         The unprovisioned and soft-deleted cases are here because both are *correctly* silent, and
 *         a filter that is silent for the wrong reason looks identical to one that works.
 */
import { describe, it, expect, afterAll } from "vitest"
import { svc, seedEmptyOrg, teardownOrg, seedUser, teardownUser, psql } from "@/test/db/tier"

const db = svc()
const orgIds: string[] = []
const userIds: string[] = []

afterAll(() => {
  for (const id of orgIds) teardownOrg(id)
  for (const id of userIds) teardownUser(id)
})

type DriftRow = { tenant_id: string; contact_email: string | null; recovery_email: string | null }

/**
 * Seed one tenant. `contactEmail: null` means "align with the auth user's own address"; anything
 * else diverges from it. `provisioned: false` leaves auth_user_id NULL — the §24.3 population that
 * has no recovery route yet and therefore cannot have drifted.
 */
async function seedTenant(opts: {
  contactEmail: string | null
  provisioned?: boolean
  deleted?: boolean
  orgId?: string
}) {
  const orgId = opts.orgId ?? (await seedEmptyOrg(db))
  if (!opts.orgId) orgIds.push(orgId)

  const authUserId = seedUser()
  userIds.push(authUserId)
  const authEmail = `${authUserId}@dbtest.local`

  const { data: contact, error: cErr } = await db.from("contacts")
    .insert({ org_id: orgId, first_name: "Drift", last_name: "Probe" })
    .select("id").single()
  if (cErr) throw new Error(`seed contact: ${cErr.message}`)
  const contactId = contact.id as string

  const { error: eErr } = await db.from("contact_emails").insert({
    org_id: orgId, contact_id: contactId,
    email: opts.contactEmail ?? authEmail,
    email_type: "personal", is_primary: true, is_active: true,
  })
  if (eErr) throw new Error(`seed contact_email: ${eErr.message}`)

  const { data: tenant, error: tErr } = await db.from("tenants")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      auth_user_id: opts.provisioned === false ? null : authUserId,
      deleted_at: opts.deleted ? new Date().toISOString() : null,
    })
    .select("id").single()
  if (tErr) throw new Error(`seed tenant: ${tErr.message}`)

  return { orgId, tenantId: tenant.id as string, authEmail }
}

async function drift(orgId: string): Promise<DriftRow[]> {
  const { data, error } = await db.rpc("stale_recovery_emails", { p_org_id: orgId })
  if (error) throw new Error(`rpc: ${error.message}`)
  return (data ?? []) as DriftRow[]
}

describe("stale_recovery_emails", () => {
  it("reports a tenant whose contact email has diverged from the recovery target", async () => {
    const { orgId, tenantId, authEmail } = await seedTenant({ contactEmail: "moved@example.invalid" })
    const rows = await drift(orgId)
    expect(rows).toHaveLength(1)
    expect(rows[0].tenant_id).toBe(tenantId)
    expect(rows[0].contact_email).toBe("moved@example.invalid")
    expect(rows[0].recovery_email).toBe(authEmail)
  })

  it("is silent when the two agree — the aligned case must not report, or every run is noise", async () => {
    const { orgId } = await seedTenant({ contactEmail: null })
    expect(await drift(orgId)).toHaveLength(0)
  })

  it("ignores an unprovisioned tenant — no auth user means no recovery route to have drifted", async () => {
    const { orgId } = await seedTenant({ contactEmail: "moved@example.invalid", provisioned: false })
    expect(await drift(orgId)).toHaveLength(0)
  })

  it("ignores a soft-deleted tenant", async () => {
    const { orgId } = await seedTenant({ contactEmail: "moved@example.invalid", deleted: true })
    expect(await drift(orgId)).toHaveLength(0)
  })

  // ⚠ The one that matters. SECURITY DEFINER means RLS is off; p_org_id is the whole boundary.
  it("does NOT return another org's drifted tenant — the org filter is the only isolation there is", async () => {
    const mine  = await seedTenant({ contactEmail: "mine@example.invalid" })
    const other = await seedTenant({ contactEmail: "theirs@example.invalid" })
    expect(other.orgId).not.toBe(mine.orgId)

    const rows = await drift(mine.orgId)
    expect(rows.map((r) => r.tenant_id)).toEqual([mine.tenantId])
    expect(rows.map((r) => r.tenant_id)).not.toContain(other.tenantId)
  })

  describe("the grant, both directions — invisible to supabase-js, so driven through psql", () => {
    it("service_role may execute it", () => {
      expect(() => psql(
        `SET ROLE service_role; SELECT * FROM stale_recovery_emails('00000000-0000-0000-0000-000000000000');`,
      )).not.toThrow()
    })

    it("authenticated may NOT — this is what makes the definer rights safe to grant", () => {
      expect(() => psql(
        `SET ROLE authenticated; SELECT * FROM stale_recovery_emails('00000000-0000-0000-0000-000000000000');`,
      )).toThrow()
    })

    it("anon may NOT either", () => {
      expect(() => psql(
        `SET ROLE anon; SELECT * FROM stale_recovery_emails('00000000-0000-0000-0000-000000000000');`,
      )).toThrow()
    })
  })
})
