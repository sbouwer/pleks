/**
 * lib/leases/leaseStartMarker.ts — "<name> is currently creating a lease for this application": the advisory
 *                                   marker an agent takes when the lease wizard opens from an application
 *
 * Auth:   none of its own — callers pass a db already behind their gate (getServerOrgMembership / gatewaySSR /
 *         requireAgentWriteAccess)
 * Data:   applications.lease_started_by / lease_started_at (005, arc 2); user_profiles.full_name for the holder,
 *         only when user_orgs shows them a live member of the same org
 * Notes:  Stéan 2026-10-09: show who is busy from the moment the wizard opens, not only when a second Create loses.
 *         ADVISORY ONLY — the lock is the claim on resulting_lease_id (applicationLink.ts) plus the unique index on
 *         leases(originating_application_id). The marker never refuses a create; it warns, and offers a take-over.
 *         A marker older than LEASE_START_HOLD_MINUTES is stale (a closed tab never releases) and anyone may take it.
 *         Not audited: it is presence, not a business state change — the lease INSERT and the claim are audited.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

const LEASE_START_HOLD_MINUTES = 30

export interface LeaseStartHolder {
  name: string | null
  startedAt: string
}

/**
 * A colleague's display name, or null when they are not a live member of `orgId` (or unreadable). The membership
 * check is the org boundary: lease_started_by is writable by any org member under the applications RLS policy and
 * its FK accepts ANY platform user, so naming whoever it holds without it would read another org's user names
 * through the service client — a cross-org name oracle (walker F1, 2026-10-09).
 */
export async function orgMemberFullName(db: SupabaseClient, orgId: string, userId: string): Promise<string | null> {
  const { data: member, error: memberError } = await db
    .from("user_orgs").select("user_id").eq("org_id", orgId).eq("user_id", userId).is("deleted_at", null).limit(1).maybeSingle()
  if (memberError) console.error("orgMemberFullName user_orgs:", memberError.message)
  if (!member) return null
  const { data, error } = await db.from("user_profiles").select("full_name").eq("id", userId).maybeSingle()
  if (error) console.error("orgMemberFullName user_profiles:", error.message)
  return (data?.full_name as string | null | undefined)?.trim() || null
}

function holdCutoffISO(now: Date): string {
  return new Date(now.getTime() - LEASE_START_HOLD_MINUTES * 60_000).toISOString()
}

/** Someone ELSE's live marker on the org's lease-less application, or null (none, mine, stale, or unreadable). */
export async function readLeaseStartHolder(
  db: SupabaseClient,
  orgId: string,
  applicationId: string,
  userId: string,
  now: Date = new Date(),
): Promise<LeaseStartHolder | null> {
  const { data: app, error } = await db
    .from("applications")
    .select("lease_started_by, lease_started_at, resulting_lease_id")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (error) {
    console.error("readLeaseStartHolder applications:", error.message)
    return null
  }
  if (!app?.lease_started_by || !app.lease_started_at || app.resulting_lease_id) return null
  if (app.lease_started_by === userId) return null
  // Parsed, not compared as text: PostgREST returns "+00:00", toISOString() writes "Z" (walker F6).
  if (Date.parse(app.lease_started_at as string) < now.getTime() - LEASE_START_HOLD_MINUTES * 60_000) return null
  return { name: await orgMemberFullName(db, orgId, app.lease_started_by as string), startedAt: app.lease_started_at as string }
}

/**
 * Take the marker when the wizard opens. Free, mine, or stale → taken. Another agent's live marker → not taken,
 * with who and since when, unless `takeOver` (the agent chose to take it from them). The conditional UPDATE is
 * atomic, so two agents opening at once cannot both take it.
 */
export async function takeLeaseStartMarker(
  db: SupabaseClient,
  orgId: string,
  applicationId: string,
  userId: string,
  opts: { takeOver?: boolean; now?: Date } = {},
): Promise<{ taken: true } | { taken: false; holder: LeaseStartHolder | null }> {
  const now = opts.now ?? new Date()
  let q = db
    .from("applications")
    .update({ lease_started_by: userId, lease_started_at: now.toISOString() })
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .is("resulting_lease_id", null)
  if (!opts.takeOver) {
    q = q.or(`lease_started_by.is.null,lease_started_by.eq.${userId},lease_started_at.lt."${holdCutoffISO(now)}"`)
  }
  const { data, error } = await q.select("id")
  if (error) {
    // Advisory: a failed marker write must not stop the agent creating the lease — the claim still guards it.
    console.error("takeLeaseStartMarker:", applicationId, error.message)
    return { taken: true }
  }
  if (data?.length) return { taken: true }
  return { taken: false, holder: await readLeaseStartHolder(db, orgId, applicationId, userId, now) }
}

/** Release MY marker (the wizard closed without creating). Someone else's, or one already cleared, is left alone. */
export async function releaseLeaseStartMarker(
  db: SupabaseClient,
  orgId: string,
  applicationId: string,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from("applications")
    .update({ lease_started_by: null, lease_started_at: null })
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .eq("lease_started_by", userId)
  if (error) console.error("releaseLeaseStartMarker:", applicationId, error.message)
}

/** "4 min ago" / "just now" — for the holder notice. */
export function startedAgoLabel(startedAt: string, now: Date = new Date()): string {
  const mins = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 60_000))
  return mins < 1 ? "just now" : `${mins} min ago`
}
