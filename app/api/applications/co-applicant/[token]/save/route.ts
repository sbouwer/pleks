/**
 * app/api/applications/co-applicant/[token]/save/route.ts — a co-applicant completes their OWN section.
 *
 * Route:  POST /api/applications/co-applicant/[token]/save
 * Auth:   application_co_applicants.access_token (the co-applicant's private invite link = email-possession proof).
 * Data:   application_co_applicants (identity snapshot + marital + section_data + stage1 consent) + consent_log.
 * Notes:  ADDENDUM_14Q §10 increment 1 (identity + marital + consent). Setting stage1_consent_given unlocks the J1
 *         submit gate + the hub's live co-status + the 14M marital-consistency flags 15/16. The token is the
 *         credential boundary (CD cross-cutting C) — a co can only write their OWN row. Income + documents are a
 *         later increment; this persists the section blob + promotes the queryable marital/address fields.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface Props { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  const { token } = await params
  const service = getServiceClient()
  const body = await req.json().catch(() => ({})) as {
    firstName?: string; lastName?: string; idType?: string; idNumber?: string; dob?: string
    maritalStatus?: string; matrimonialRegime?: string
    currentAddress?: unknown; spouseInfo?: unknown; sectionData?: unknown
    consent?: boolean; consentIp?: string | null
  }

  const { data: co, error } = await service
    .from("application_co_applicants")
    .select("id, org_id, primary_application_id, applicant_email, access_token_expires, declined_at")
    .eq("access_token", token).is("declined_at", null).maybeSingle()
  logQueryError("co-applicant save load", error)
  if (!co) return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 })
  if (co.access_token_expires && new Date(co.access_token_expires as string) < new Date()) {
    return NextResponse.json({ error: "This link has expired." }, { status: 401 })
  }
  if (!body.consent) return NextResponse.json({ error: "Please give consent to complete your part." }, { status: 400 })
  if (!body.firstName?.trim() || !body.idNumber?.trim()) return NextResponse.json({ error: "Your name and ID number are required." }, { status: 400 })

  const now = new Date().toISOString()
  const { error: updErr } = await service.from("application_co_applicants").update({
    first_name: body.firstName ?? null, last_name: body.lastName ?? null,
    id_type: body.idType || "sa_id", id_number: body.idNumber ?? null, date_of_birth: body.dob || null,
    marital_status: body.maritalStatus || null, matrimonial_regime: body.matrimonialRegime || null,
    current_address: body.currentAddress ?? null, spouse_info: body.spouseInfo ?? null,
    section_data: body.sectionData ?? null,
    stage1_consent_given: true, stage1_consent_given_at: now, stage1_consent_ip: body.consentIp ?? null,
  }).eq("id", co.id)
  logQueryError("co-applicant save update", updErr)
  if (updErr) return NextResponse.json({ error: "Could not save your details. Please try again." }, { status: 500 })

  // POPIA: record this co-applicant's own consent (scope covers the Step-2 AI document analysis, like the primary).
  await service.from("consent_log").insert({
    org_id: co.org_id as string,
    subject_email: co.applicant_email as string,
    consent_type: "popia_application", consent_given: true,
    ip_address: body.consentIp ?? null,
    metadata: { application_id: co.primary_application_id as string, co_applicant_id: co.id as string, scope: "stage1_prescreen_and_ai_document_analysis" },
  })

  return NextResponse.json({ ok: true })
}
