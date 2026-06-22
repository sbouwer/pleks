/**
 * app/api/cron/expire-listings/route.ts — listing-expiry retention sweep (ADDENDUM_14M save-&-resume Phase 2).
 *
 * Route:  GET /api/cron/expire-listings
 * Auth:   x-cron-secret (withCronRun; cPanel curl) — legal-retention job, NOT tier-gated (runs regardless of
 *         the org's subscription state).
 * Data:   listings + applications + Storage (application-docs), service client.
 * Notes:  Two retention policies for SAVED-BUT-NOT-SUBMITTED drafts (stage1_consent_given not true):
 *           (A) the listing has closed (closes_at < now), OR
 *           (B) the listing has NO closes_at and the draft has been idle past the 30-day token TTL (draft_saved_at).
 *         SUBMITTED applications are NEVER touched ("Your Data, Always" — they stay fully accessible).
 *         POPIA-clean per draft: (1) flip the listing to 'expired' FIRST so /submit refuses it (closes the
 *         concurrent-submit race), (2) purge the draft's Storage docs and ONLY delete the row if the purge
 *         succeeded (storage-first — the row is the only pointer to the path; partial failure → retry next run),
 *         (3) the row DELETE re-applies the consent guard (a just-submitted row survives), and FK ON DELETE
 *         CASCADE cleans co_applicants / tokens / screening_jobs / evaluations. recordAudit logs application_id +
 *         listing_id + reason only — never name/email. Wire to a DAILY cPanel schedule.
 */
import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { withCronRun } from "@/lib/cron/withCronRun"
import { recordAudit } from "@/lib/audit/recordAudit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { purgeApplicationDocs } from "@/lib/applications/purgeDocs"

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
const RETENTION_FALLBACK_MS = 30 * 24 * 60 * 60 * 1000 // no closes_at → purge a draft idle this long (token TTL)

interface DraftRow { id: string; org_id: string; listing_id: string | null }

export const GET = withCronRun("expire_listings", handler)

async function handler(_req: NextRequest): Promise<Response> {
  const db = getServiceClient()
  const nowIso = new Date().toISOString()
  const fallbackCutoff = new Date(Date.now() - RETENTION_FALLBACK_MS).toISOString()

  // 1. Flip closed listings to 'expired' so /submit refuses them BEFORE we purge (race guard). Leave
  //    filled/already-expired alone.
  const { data: flipped, error: flipErr } = await db.from("listings")
    .update({ status: "expired", updated_at: nowIso })
    .lt("closes_at", nowIso).not("closes_at", "is", null)
    .in("status", ["active", "paused", "draft"])
    .select("id")
  logQueryError("expire-listings flip", flipErr)

  // 2. Collect unsubmitted drafts to purge — policy (A) closed listing, policy (B) idle on a no-expiry listing.
  const { data: draftsA, error: aErr } = await db.from("applications")
    .select("id, org_id, listing_id, listings!inner(closes_at)")
    .not("stage1_consent_given", "is", true)
    .lt("listings.closes_at", nowIso)
  logQueryError("expire-listings drafts A", aErr)

  const { data: draftsB, error: bErr } = await db.from("applications")
    .select("id, org_id, listing_id, listings!inner(closes_at)")
    .not("stage1_consent_given", "is", true)
    .is("listings.closes_at", null)
    .lt("draft_saved_at", fallbackCutoff)
  logQueryError("expire-listings drafts B", bErr)

  const byId = new Map<string, DraftRow>()
  for (const d of [...(draftsA ?? []), ...(draftsB ?? [])] as DraftRow[]) byId.set(d.id, d)

  let purged = 0, retried = 0
  for (const d of byId.values()) {
    const ok = await purgeApplicationDocs(db, d.org_id, d.id)
    if (!ok) { retried++; continue } // leave the row → next run retries (storage-first; don't orphan docs)
    // Re-apply the consent guard in the DELETE itself — a row submitted since we selected it survives.
    const { error: delErr } = await db.from("applications")
      .delete().eq("id", d.id).eq("org_id", d.org_id).not("stage1_consent_given", "is", true)
    if (delErr) { logQueryError("expire-listings delete", delErr); retried++; continue }
    await recordAudit(db, {
      orgId: d.org_id, actorId: null, action: "DELETE", table: "applications", recordId: d.id,
      before: { listing_id: d.listing_id, reason: "retention: unsubmitted draft on closed/expired listing" },
    })
    purged++
  }

  return Response.json({ ok: true, listingsExpired: flipped?.length ?? 0, draftsPurged: purged, draftsDeferred: retried })
}
