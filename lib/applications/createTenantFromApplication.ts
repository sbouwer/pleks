"use server"

/**
 * lib/applications/createTenantFromApplication.ts — agent-side applicant→tenant promotion (server action).
 *
 * Auth:   "use server" action, called from the client ApplicationActions (shortlist/approve). Bound to the agent's
 *         COOKIE/RLS client. (A "use server" export can't take a non-serializable client param, so the injectable
 *         core lives in promoteApplicantToTenant.ts and this thin wrapper supplies the cookie client.)
 * Notes:  the applicant's OWN account-at-completion uses the core directly with a SERVICE client (the link-account
 *         route) — agent-initiated promotion passes no authUserId (the tenant gets no auth binding until login). 14R.
 */
import { createClient } from "@/lib/supabase/server"
import { promoteApplicationToTenant } from "./promoteApplicantToTenant"

export async function createTenantFromApplication(
  applicationId: string,
  agentId: string,
): Promise<{ tenantId: string } | { error: string }> {
  return promoteApplicationToTenant(await createClient(), applicationId, agentId, null)
}
