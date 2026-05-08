/**
 * lib/subscriptions/acceptance.ts — recordTosAcceptance() helper (Gate 2 ToS archival)
 *
 * Auth:   service-role client only — never called from client-side code
 * Data:   tos_acceptances table (append-only, immutable trigger)
 * Notes:  Hash is deterministic over identity fields only (no timestamp).
 *         Key order in canonical JSON is alphabetic and must never change —
 *         it is the verification contract for future audit recomputation.
 */
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

export type TosAcceptanceContext =
  | "signup"
  | "version_update"
  | "reactivation"
  | "ownership_transfer"

export async function recordTosAcceptance(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  userEmail: string,
  ipAddress: string | null,
  userAgent: string | null,
  context: TosAcceptanceContext = "signup",
): Promise<void> {
  // Canonical JSON with alphabetic key order — do not reorder
  const canonical = JSON.stringify({
    context,
    org_id:        orgId,
    terms_version: LEGAL_VERSIONS.terms,
    user_id:       userId,
  })
  const hash = createHash("sha256").update(canonical).digest("hex")

  const { error } = await supabase.from("tos_acceptances").insert({
    org_id:              orgId,
    user_id:             userId,
    user_email_snapshot: userEmail,
    user_id_snapshot:    userId,
    terms_version:       LEGAL_VERSIONS.terms,
    privacy_version:     LEGAL_VERSIONS.privacy,
    ip_address:          ipAddress,
    user_agent:          userAgent,
    acceptance_hash:     hash,
    context,
  })

  if (error) throw new Error(`recordTosAcceptance failed: ${error.message}`)
}
