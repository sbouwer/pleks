/**
 * lib/portal/getLandlordSession.ts — Authenticate and resolve landlord portal session
 *
 * Auth:   Supabase auth (landlords.auth_user_id) — redirects to /login if not found or suspended
 * Data:   landlords + contacts via service client
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { setSentryUser } from "@/lib/observability/user-context"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface LandlordSession {
  userId: string
  landlordId: string
  orgId: string
  displayName: string
}

/**
 * Authenticates the current user as a landlord portal user.
 * Redirects to /login if not authenticated or no landlord record found.
 */
export async function getLandlordSession(): Promise<LandlordSession> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  const { data: landlord, error: landlordError } = await service
    .from("landlords")
    .select("id, org_id, portal_status, contacts(first_name, last_name, company_name)")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("getLandlordSession landlords", landlordError)

  if (!landlord) redirect("/login")
  if (landlord.portal_status === "suspended") redirect("/login")

  // Update last login timestamp (fire and forget)
  service.from("landlords").update({ portal_last_login_at: new Date().toISOString() })
    .eq("id", landlord.id)
    .then(() => { /* non-blocking */ })

  const contact = landlord.contacts as unknown as { first_name: string | null; last_name: string | null; company_name: string | null } | null
  const displayName = contact?.company_name ||
    `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() ||
    "Landlord"

  setSentryUser({ id: user.id, org_id: landlord.org_id, role: "landlord", scope_id: landlord.id })
  return {
    userId: user.id,
    landlordId: landlord.id,
    orgId: landlord.org_id,
    displayName,
  }
}
