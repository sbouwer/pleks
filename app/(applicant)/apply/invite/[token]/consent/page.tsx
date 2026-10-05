/**
 * app/(applicant)/apply/invite/[token]/consent/page.tsx — Stage 2 POPIA credit-check consent: decides the group block
 *
 * Route:  /apply/invite/[token]/consent
 * Auth:   application_tokens.token (the invite token; the API routes re-validate it before anything is recorded)
 * Data:   application_tokens → applications.org_id → isGroupApplication (lib/screening/screeningConsent.ts)
 * Notes:  14X P5. The group block renders only for an application with more than one party, which only the server can
 *         know, so this page is a server wrapper around the client flow (Stage2Consent.tsx). An unknown or expired
 *         token renders the single-party text: the record route rejects that token anyway, and a group block not shown
 *         can only withhold a result link, never grant one (the route re-derives the flag before recording it).
 */
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { isGroupApplication } from "@/lib/screening/screeningConsent"
import { Stage2Consent } from "./Stage2Consent"

interface Props { params: Promise<{ token: string }> }

async function groupClauseFor(token: string): Promise<boolean> {
  const service = await createServiceClient()
  // The invite token is the ownership proof; the application and its org are derived from this row.
  const { data: tokenRow, error: tokenErr } = await service
    .from("application_tokens")
    // org scope (a [token] path, outside the scope rules' aperture): bounded by the invite token; org is derived from this row
    .select("application_id")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  logQueryError("consent page application_tokens", tokenErr)
  if (!tokenRow) return false
  const { data: app, error: appErr } = await service
    .from("applications")
    // org scope (a [token] path, outside the scope rules' aperture): bounded by the application the token above proves
    .select("org_id")
    .eq("id", tokenRow.application_id as string)
    .maybeSingle()
  logQueryError("consent page applications", appErr)
  if (!app) return false
  try {
    return await isGroupApplication(service, app.org_id as string, tokenRow.application_id as string)
  } catch (err) {
    console.error("[consent page] group application read failed:", err instanceof Error ? err.message : err)
    return false
  }
}

export default async function Stage2ConsentPage({ params }: Props) {
  const { token } = await params
  return <Stage2Consent groupClause={await groupClauseFor(token)} />
}
