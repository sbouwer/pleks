/**
 * app/api/cron/consent-cleanup/route.ts — Purge stale consent verification rows
 *
 * Route:  GET /api/cron/consent-cleanup
 * Auth:   x-cron-secret header
 * Data:   consent_verifications (delete expired/invalidated/abandoned > 30 days)
 *         consent_verification_rate_limits (delete stale entries)
 * Notes:  ADDENDUM_14F. Verified rows are retained with their parent consent_log (POPIA
 *         retention). Only non-completed rows (expired/invalidated/abandoned) are purged
 *         after 30 days — they're failed attempts, not consent records.
 *         Rate-limit rows with no active lockout and no recent activity are also cleaned.
 *         Called from daily cron orchestrator.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron/auth"

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const service = await createServiceClient()
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Purge non-verified verification rows older than 30 days
  // eslint-disable-next-line pleks/require-scope-on-delete -- platform-wide retention cron; scoped by status + age (no org dimension by design)
  const { count: verifPurged, error: verifErr } = await service
    .from("consent_verifications")
    .delete({ count: "exact" })
    .in("status", ["expired", "invalidated", "abandoned"])
    .lt("created_at", cutoff30d)

  if (verifErr) {
    console.error("[consent-cleanup] verifications purge failed:", verifErr.message)
  }

  // Purge rate-limit rows with no active lockout and no recent sends
  // eslint-disable-next-line pleks/require-scope-on-delete -- platform-wide retention cron; scoped by age + lockout state (no org dimension by design)
  const { count: rlPurged, error: rlErr } = await service
    .from("consent_verification_rate_limits")
    .delete({ count: "exact" })
    .lt("updated_at", cutoff24h)
    .is("hard_lockout_until", null)
    .is("soft_lockout_until", null)

  if (rlErr) {
    console.error("[consent-cleanup] rate-limits purge failed:", rlErr.message)
  }

  return NextResponse.json({
    ok: true,
    verifPurged: verifPurged ?? 0,
    rlPurged:    rlPurged   ?? 0,
  })
}
