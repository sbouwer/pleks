/**
 * lib/subscriptions/purge.ts — purgeOrg() primitive (ADDENDUM_57G §11.4)
 *
 * Notes:  Called by the subscription-purge-warnings cron (cancelled-tail +
 *         dormancy tracks) and by BUILD_65 (POPIA user-initiated erasure,
 *         reason='popia_erasure'). One implementation, three callers.
 *         DB cascade runs in purge_org_cascade() (SQL SECURITY DEFINER);
 *         storage cleanup is best-effort after the cascade completes.
 *         Safety: SENTINEL_ORG_ID (…0001) and DECOY_ORG_ID (…0003) are refused.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getUserEmail } from "@/lib/auth/userEmail"
import { SENTINEL_ORG_ID } from "@/lib/subscriptions/retention"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"
import { purgeStoragePrefix, purgeOrgApplicationDocs } from "@/lib/applications/purgeDocs"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { sendPurgedConfirm } from "@/lib/subscriptions/emails"
import { fmtDateLongZA } from "@/lib/dates"

const DECOY_ORG_ID = "00000000-0000-0000-0000-000000000003" as const

// Org-scoped storage buckets whose objects are purged post-cascade (path prefix = {org_id}/), plus `application-docs`
// (prefix `applications/{org_id}/`, purgeOrgApplicationDocs). Until 2026-10-03 this list named five buckets that
// exist in no migration and not on prod (`documents`, `identity-docs`, `bank-statements`, `owner-statements`,
// `import-files` — read from `storage.buckets` that day), and omitted the one holding applicants' ID documents and
// bank statements. A name here is a claim that the bucket exists and is keyed `{org_id}/`; add one only with both.
// `screening-reports` (bureau/credit PDFs, `lib/searchworx/storage.ts`: `{org}/{ref}/{product}/…`) was missing too;
// the cascade deletes its rows, so its files were orphaned on every org purge.
const ORG_SCOPED_BUCKETS = ["inspection-photos", "screening-reports"] as const

export type PurgeReason = "cancelled_tail" | "dormancy" | "popia_erasure"

export async function purgeOrg(orgId: string, reason: PurgeReason): Promise<void> {
  if (orgId === SENTINEL_ORG_ID || orgId === DECOY_ORG_ID || orgId === PLATFORM_ORG_ID) {
    // PLATFORM_ORG_ID was missing from this list until 2026-08-23 (M-067), and the omission was
    // reachable: the dormancy RPCs did not exclude the system org either, so it would have been
    // warned at day 60 (it was 44 days old when this was found), final-warned at day 90, and handed
    // to this function — which would have purged the org that owns all platform email logging.
    // purge_org_cascade() refuses it too; this is the earlier of two deliberate layers.
    throw new Error(`purgeOrg: refusing to purge sentinel/decoy/platform org ${orgId}`)
  }

  const supabase = await createServiceClient()

  // Claim the purge slot atomically — sets organisations.deleted_at = now().
  // Returns the org id on success; returns empty if already claimed or purged.
  const { data: slot, error: slotErr } = await supabase.rpc("claim_purge_slot", {
    p_org_id: orgId,
  })
  if (slotErr) {
    console.error("purgeOrg: claim_purge_slot failed for", orgId, slotErr.message)
    throw slotErr
  }
  const slotRows = slot as Array<{ id: string }> | null
  if (!slotRows || slotRows.length === 0) {
    console.warn("purgeOrg: slot already claimed for", orgId, "— skipping duplicate purge")
    return
  }

  // Fetch contact + cancellation data BEFORE cascade (org row is anonymised after)
  const [{ data: org }, { data: adminRow }, { data: sub }] = await Promise.all([
    supabase
      .from("organisations")
      .select("name, email, phone, brand_accent_color")
      .eq("id", orgId)
      .single(),
    supabase
      .from("user_orgs")
      .select("user_id, user_profiles(full_name)")
      .eq("org_id", orgId)
      .in("role", ["owner", "agent"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("cancelled_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const profile = adminRow?.user_profiles as unknown as { full_name?: string } | null
  // Resolve the admin email BEFORE the cascade (auth.users isn't org-scoped, but capture it up front).
  const adminEmail = await getUserEmail(supabase, adminRow?.user_id as string | null)

  // Capture branding BEFORE cascade — the org row is anonymised by the cascade below.
  const orgSettings = await fetchOrgSettings(orgId)

  // DB cascade: repoint retention rows → sentinel, delete everything else, anonymise org
  const { error: cascadeErr } = await supabase.rpc("purge_org_cascade", {
    p_org_id: orgId,
    p_reason: reason,
  })
  if (cascadeErr) {
    console.error("purgeOrg: cascade failed for", orgId, cascadeErr.message)
    throw cascadeErr
  }

  // Storage purge (best-effort — DB is already clean; log errors but don't throw)
  await purgeOrgStorage(supabase, orgId)

  // Send purged_confirm email (fire-and-forget — org is already anonymised)
  if (adminEmail) {
    const now = new Date()
    const purgedDate = fmtDateLongZA(now)
    const cancelledDate = sub?.cancelled_at
      ? fmtDateLongZA(sub.cancelled_at)
      : ""
    void sendPurgedConfirm(
      {
        orgId,
        orgName: org?.name ?? "Your agency",
        adminEmail,
        adminName: profile?.full_name ?? undefined,
        recipientEmail: adminEmail,
        branding: buildBranding(orgSettings),
      },
      {
        cancelledDate,
        purgedDate,
        finalInvoiceDate: "",
      },
    )
  }
}

async function purgeOrgStorage(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  orgId: string,
): Promise<void> {
  // Recursive: inspection photos sit at `{org}/{inspection}/…`, so the old top-level list returned only folder
  // names and the remove was a no-op — the purge never deleted a photo.
  for (const bucket of ORG_SCOPED_BUCKETS) {
    try {
      if (!(await purgeStoragePrefix(supabase, bucket, orgId))) {
        console.error(`purgeOrg: storage purge incomplete in ${bucket} for org ${orgId}`)
      }
    } catch (err) {
      console.error(`purgeOrg: storage error in ${bucket} for org ${orgId}:`, err)
    }
  }
  try {
    if (!(await purgeOrgApplicationDocs(supabase, orgId))) {
      console.error(`purgeOrg: storage purge incomplete in application-docs for org ${orgId}`)
    }
  } catch (err) {
    console.error(`purgeOrg: storage error in application-docs for org ${orgId}:`, err)
  }
}
