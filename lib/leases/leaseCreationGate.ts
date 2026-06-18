/**
 * lib/leases/leaseCreationGate.ts — guard: an agency org can't create leases until its trust/deposit banking exists
 *
 * Auth:   server-only; org-scoped (gateway/service db).
 * Data:   organisations.management_scope + bank_accounts (trust types); owner name via user_orgs → user_profiles.
 * Notes:  Self-managing orgs (management_scope='own_only') are NEVER gated — they operate no trust account
 *         (the landlord-banking path is deferred). Enforced server-side in createLease/createUploadedLease and
 *         surfaced as a disabled "Create lease" button (role-aware: the owner gets a setup link, others a
 *         "ask {owner}" prompt). "Trust set up" = any trust-type bank account (trust / ppra_trust /
 *         deposit_holding) exists for the org.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

const TRUST_ACCOUNT_TYPES = ["trust", "ppra_trust", "deposit_holding"]

export interface LeaseCreationGate {
  allowed: boolean
  /** the org owner's name, for the "ask {owner}" prompt shown to non-owners when blocked. */
  ownerName: string | null
}

/** Server message shown when the gate is closed (button tooltip + server-action error). */
export const LEASE_GATE_BLOCKED_MESSAGE =
  "Lease creation is disabled until your organisation's trust/deposit account is configured (Settings → Compliance)."

export async function getLeaseCreationGate(db: SupabaseClient, orgId: string): Promise<LeaseCreationGate> {
  const { data: org, error: orgErr } = await db
    .from("organisations").select("management_scope").eq("id", orgId).single()
  logQueryError("getLeaseCreationGate organisations", orgErr)

  // Only gate orgs that POSITIVELY manage others' properties (agency model → must hold a trust account).
  // Self-managing orgs (own_only) — and any unknown/missing scope — are never gated (fail-open; the
  // landlord-banking path is deferred).
  const managesOthers = org?.management_scope === "own_and_others" || org?.management_scope === "others_only"
  if (!managesOthers) return { allowed: true, ownerName: null }

  const { data: trust, error: trustErr } = await db
    .from("bank_accounts").select("id").eq("org_id", orgId).in("type", TRUST_ACCOUNT_TYPES).limit(1)
  logQueryError("getLeaseCreationGate bank_accounts", trustErr)
  if (trust && trust.length > 0) return { allowed: true, ownerName: null }

  return { allowed: false, ownerName: await resolveOwnerName(db, orgId) }
}

async function resolveOwnerName(db: SupabaseClient, orgId: string): Promise<string | null> {
  const { data: ownerLink, error: linkErr } = await db
    .from("user_orgs").select("user_id").eq("org_id", orgId).eq("role", "owner").is("deleted_at", null).limit(1).maybeSingle()
  logQueryError("resolveOwnerName user_orgs", linkErr)
  if (!ownerLink?.user_id) return null
  const { data: profile, error: profErr } = await db
    .from("user_profiles").select("full_name").eq("id", ownerLink.user_id).maybeSingle()
  logQueryError("resolveOwnerName user_profiles", profErr)
  return profile?.full_name?.trim() || null
}
