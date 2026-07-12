"use server"

/**
 * lib/applications/createTenantFromApplication.ts — agent-side applicant→tenant promotion (server action).
 *
 * Auth:   requireAgentWriteAccess("promote_applicant") — promotion creates a net-new tenant, so it is
 *         auth + subscription-lockdown gated. The agent's org and identity come from the SESSION, never from
 *         the caller: the org scopes the application lookup (F-2 — a foreign applicationId resolves to
 *         not-found) and the session user is the audit actor.
 * Notes:  runs on the SERVICE client (gw.db) with the explicit org filter as the boundary — the old cookie-
 *         client path was RLS-unreliable (banned by pleks/no-cookie-client-from). The applicant's OWN
 *         account-at-completion uses the core directly with a service client + a token (the link-account
 *         route), passing no expectedOrgId because the token itself authorises that specific application. 14R.
 */
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { promoteApplicationToTenant } from "./promoteApplicantToTenant"

export async function createTenantFromApplication(
  applicationId: string,
): Promise<{ tenantId: string } | { error: string }> {
  let gw
  try {
    gw = await requireAgentWriteAccess("promote_applicant")
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Not authorised" }
  }
  return promoteApplicationToTenant(gw.db, applicationId, gw.userId, null, gw.orgId)
}
