/**
 * lib/applications/submissionEmails.ts — fire the "application submitted" notifications.
 *
 * Sent ONLY when an applicant explicitly submits to the agent (sets applications.submitted_at) — NOT during the
 * pre-screen. Sends Email 1 (applicant confirmation) + Email 2 (agent notification). Re-fetches its own context
 * by application id so the submit-to-agent route stays thin. Non-blocking sends (void) — failures log, never block.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { sendApplicationReceived, sendAgentApplicationNotification } from "@/lib/applications/emails"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { getUserEmail } from "@/lib/auth/userEmail"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function sendSubmissionNotifications(
  service: SupabaseClient,
  applicationId: string,
  token: string,
): Promise<void> {
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("*, listings(id, public_slug, asking_rent_cents, available_from, units(unit_number, properties(id, name, city)), org_id)")
    .eq("id", applicationId)
    .single()
  logQueryError("submissionEmails applications", appErr)
  if (!app) return

  const listing = app.listings as Record<string, unknown> | null
  const unit = listing?.units as Record<string, unknown> | null
  const property = unit?.properties as Record<string, unknown> | null
  const orgId = app.org_id as string

  const { data: org, error: orgErr } = await service
    .from("organisations").select("name, email, phone, brand_accent_color").eq("id", orgId).single()
  logQueryError("submissionEmails organisations", orgErr)

  const { data: agentRow, error: agentErr } = await service
    .from("user_orgs").select("user_id").eq("org_id", orgId).eq("role", "agent").is("deleted_at", null).limit(1).maybeSingle()
  logQueryError("submissionEmails user_orgs", agentErr)
  const agentEmail = await getUserEmail(service, agentRow?.user_id as string | null)

  const branding = buildBranding(await fetchOrgSettings(orgId))
  const orgContext = {
    orgId, orgName: org?.name ?? "Pleks",
    orgEmail: org?.email as string | undefined, orgPhone: org?.phone as string | undefined,
    agentEmail: agentEmail ?? undefined, branding,
  }
  const bankData = app.bank_statement_extracted as Record<string, unknown> | null
  const appSummary = {
    id: applicationId,
    firstName: app.first_name as string, lastName: app.last_name as string,
    email: app.applicant_email as string, phone: app.applicant_phone as string | undefined,
    employerName: app.employer_name as string | undefined, employmentType: app.employment_type as string | undefined,
    grossMonthlyIncomeCents: app.gross_monthly_income_cents as number | undefined,
    prescreenScore: (app.prescreen_score as number | null) ?? 0, prescreenTotal: 45,
    rentToIncomePct: null,
    documentsComplete: true,
    bankStatementAvgIncomeCents: (bankData?.avg_monthly_income_cents as number | null) ?? null,
    bankStatementBounced: (bankData?.bounced_debits as number | null) ?? null,
  }
  const listingSummary = {
    id: (listing?.id as string) ?? "",
    unitLabel: (unit?.unit_number as string) ?? "",
    propertyName: (property?.name as string) ?? "",
    city: property?.city as string | undefined,
    askingRentCents: (listing?.asking_rent_cents as number) ?? 0,
    availableFrom: listing?.available_from as string | undefined,
  }

  void sendApplicationReceived(appSummary, listingSummary, orgContext, {
    slug: (listing?.public_slug as string) ?? "", accessToken: token,
  })

  if (agentEmail) {
    const { count, error: countErr } = await service
      .from("applications").select("id", { count: "exact", head: true })
      .eq("listing_id", (listing?.id as string) ?? "").not("submitted_at", "is", null)
    if (countErr) console.error("submissionEmails applications count:", countErr.message)
    void sendAgentApplicationNotification(appSummary, listingSummary, orgContext, { applicationsCount: count ?? 0 })
  }
}
