/**
 * app/api/cron/recovery-email-drift/route.ts — report tenants whose recovery email has drifted
 *
 * Route:  GET /api/cron/recovery-email-drift
 * Auth:   x-cron-secret header (requireCronAuth)
 * Data:   organisations (id) · stale_recovery_emails(p_org_id) — service_role-only RPC
 * Notes:  ADDENDUM_62F §25.4. Account recovery resolves against `auth.users.email` (§24), and the
 *         contact set reaches it exactly once, at invite time (§24.3). Nothing re-syncs it, so a
 *         confirmed contact change can leave recovery pointing at an address the tenant no longer
 *         holds. This is the DETECTOR half; the repair half needs the first-ever
 *         `admin.updateUserById` caller (§24.5 precondition (a)) and is deliberately not here.
 *
 *         Detection is STATE-based, not event-based — §25.4. A reconciler driven by
 *         `contact_change_requests` cannot see the frozen-at-invite population, because no request
 *         row describes it. That is the whole reason this compares representations instead.
 *
 *         ⚠ NO PII LEAVES THIS ROUTE. The RPC returns both addresses because the repair half will
 *         need them; this route aggregates to counts and tenant ids and never logs, returns or
 *         reports an email. A drift report naming addresses would be a POPIA surface built to
 *         monitor a POPIA surface.
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron/auth"

export const runtime = "nodejs"

type DriftRow = { tenant_id: string; contact_email: string | null; recovery_email: string | null }

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const service = await createServiceClient()

  const { data: orgs, error: orgsError } = await service.from("organisations").select("id")
  if (orgsError) {
    console.error("[recovery-email-drift] org list failed:", orgsError.message)
    return NextResponse.json({ ok: false, error: "org list failed" }, { status: 500 })
  }

  // ⚠ A SCAN THAT EXAMINED NOTHING IS NOT A CLEAN RESULT. Without this, an empty or failed org
  // list returns `diverged: 0` — indistinguishable from "checked everything, found nothing", which
  // is the shape M-123 was filed for one layer up. Report it as its own outcome instead.
  if (!orgs || orgs.length === 0) {
    Sentry.captureMessage("recovery-email-drift: scanned zero organisations", "warning")
    return NextResponse.json({ ok: false, reason: "no organisations scanned", orgsScanned: 0 })
  }

  const driftedTenantIds: string[] = []
  const failedOrgs: string[] = []

  for (const org of orgs) {
    const { data, error } = await service.rpc("stale_recovery_emails", { p_org_id: org.id })
    if (error) {
      // One org failing must not silently shrink the denominator — carry it to the response.
      console.error("[recovery-email-drift] rpc failed for an org:", error.message)
      failedOrgs.push(org.id)
      continue
    }
    for (const row of (data ?? []) as DriftRow[]) driftedTenantIds.push(row.tenant_id)
  }

  if (driftedTenantIds.length > 0) {
    Sentry.captureMessage(
      `recovery-email-drift: ${driftedTenantIds.length} tenant(s) whose recovery email has drifted from the contact set`,
      { level: "warning", extra: { tenantIds: driftedTenantIds } },
    )
  }

  return NextResponse.json({
    ok:          failedOrgs.length === 0,
    orgsScanned: orgs.length - failedOrgs.length,
    failed:      failedOrgs.length,
    diverged:    driftedTenantIds.length,
    tenantIds:   driftedTenantIds,
  })
}
