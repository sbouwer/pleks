"use server"

/**
 * Fetches all data needed to send emails about an application.
 * Used by server actions and API routes — never call from client components.
 */

import { createServiceClient } from "@/lib/supabase/server"
import { buildBranding } from "@/lib/comms/send-email"
import { getOrgDisplayName } from "@/lib/org/displayName"

export interface AppEmailContext {
  appSummary: {
    id: string
    firstName: string
    lastName: string
    email: string
    phone?: string
    employerName?: string
    employmentType?: string
    grossMonthlyIncomeCents?: number
    prescreenScore?: number
    prescreenTotal: number
    rentToIncomePct?: number | null
    documentsComplete: boolean
    bankStatementAvgIncomeCents?: number | null
    bankStatementBounced?: number | null
  }
  listingSummary: {
    id: string
    unitLabel: string
    propertyName: string
    city?: string
    askingRentCents: number
    availableFrom?: string
  }
  orgContext: {
    orgId: string
    orgName: string
    orgEmail?: string
    orgPhone?: string
    agentEmail?: string
    branding: ReturnType<typeof buildBranding>
  }
  accessToken: string | null
  listingSlug: string | null
}

export async function buildEmailContext(applicationId: string): Promise<AppEmailContext | null> {
  const service = await createServiceClient()

  const { data: app, error } = await service
    .from("applications")
    .select("*, listings(id, public_slug, asking_rent_cents, available_from, units(unit_number, properties(name, city))), org_id")
    .eq("id", applicationId)
    .single()

  if (error || !app) {
    console.error("buildEmailContext: application not found", error?.message)
    return null
  }

  const listing = app.listings as Record<string, unknown> | null
  const unit = listing?.units as Record<string, unknown> | null
  const property = unit?.properties as Record<string, unknown> | null

  // Fetch org
  const { data: org } = await service
    .from("organisations")
    .select("name, type, trading_as, first_name, last_name, title, initials, email, phone, address_line1, city, brand_logo_url, brand_accent_color, reply_to_email")
    .eq("id", app.org_id as string)
    .single()

  // Fetch agent email
  const { data: agentRow } = await service
    .from("user_orgs")
    .select("user_profiles(email)")
    .eq("org_id", app.org_id as string)
    .eq("role", "agent")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle()

  const agentEmail = (agentRow?.user_profiles as unknown as { email: string } | null)?.email ?? undefined

  // Fetch most recent access token
  const { data: tokenRow } = await service
    .from("application_tokens")
    .select("token")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  const bankData = app.bank_statement_extracted as Record<string, unknown> | null
  const branding = buildBranding(org, undefined)

  return {
    appSummary: {
      id: applicationId,
      firstName: app.first_name as string,
      lastName: app.last_name as string,
      email: app.applicant_email as string,
      phone: app.applicant_phone as string | undefined,
      employerName: app.employer_name as string | undefined,
      employmentType: app.employment_type as string | undefined,
      grossMonthlyIncomeCents: app.gross_monthly_income_cents as number | undefined,
      prescreenScore: app.prescreen_score as number | undefined,
      prescreenTotal: 45,
      rentToIncomePct: app.prescreen_affordability_flag ? null : undefined,
      documentsComplete: true,
      bankStatementAvgIncomeCents: (bankData?.avg_monthly_income_cents as number | null) ?? null,
      bankStatementBounced: (bankData?.bounced_debits as number | null) ?? null,
    },
    listingSummary: {
      id: (listing?.id as string) ?? "",
      unitLabel: (unit?.unit_number as string) ?? "",
      propertyName: (property?.name as string) ?? "",
      city: property?.city as string | undefined,
      askingRentCents: (listing?.asking_rent_cents as number) ?? 0,
      availableFrom: listing?.available_from as string | undefined,
    },
    orgContext: {
      orgId: app.org_id as string,
      orgName: org ? getOrgDisplayName(org) : "Pleks",
      orgEmail: org?.email as string | undefined,
      orgPhone: org?.phone as string | undefined,
      agentEmail,
      branding,
    },
    accessToken: tokenRow?.token ?? null,
    listingSlug: listing?.public_slug as string | null,
  }
}
