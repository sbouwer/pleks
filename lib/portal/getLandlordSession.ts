import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

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

  const { data: landlord } = await service
    .from("landlords")
    .select("id, org_id, portal_status, contacts(first_name, last_name, company_name)")
    .eq("auth_user_id", user.id)
    .is("deleted_at", null)
    .single()

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

  return {
    userId: user.id,
    landlordId: landlord.id,
    orgId: landlord.org_id,
    displayName,
  }
}
