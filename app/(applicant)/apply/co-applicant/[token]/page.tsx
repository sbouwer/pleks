/**
 * app/(applicant)/apply/co-applicant/[token]/page.tsx — a co-applicant's own per-link session (ADDENDUM_14Q §10).
 *
 * Route:  /apply/co-applicant/[token]  (the invite link sent to the co-applicant; static segment wins over [slug])
 * Auth:   application_co_applicants.access_token — the co sees ONLY their own row (POPIA per-subject isolation).
 * Data:   application_co_applicants + the primary application (for the listing label + the symmetric spouse prefill).
 * Notes:  Increment 1 — identity + marital + consent → stage1_consent_given (unlocks the J1 gate + the hub's live
 *         co-status + the 14M marital flags). Income + documents are a later increment. If the primary linked THIS
 *         co as their in-community spouse (by ID), we pre-fill the marriage for the co to confirm (14M amendment §1).
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, decryptSpouseInfo } from "@/lib/crypto/idNumber"
import { CoApplicantSession, type CoPrefill, type SpouseCandidate } from "./CoApplicantSession"

export default async function CoApplicantPage({ params }: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params
  const service = await createServiceClient()

  const { data: co, error } = await service
    .from("application_co_applicants")
    .select("id, org_id, first_name, last_name, id_type, id_number, applicant_email, applicant_phone, role, marital_status, matrimonial_regime, current_address, spouse_info, stage1_consent_given, started_at, access_token_expires, declined_at, primary_application_id")
    .eq("access_token", token).is("declined_at", null).maybeSingle()
  logQueryError("co-applicant page load", error)
  if (!co) notFound()

  const expired = !!co.access_token_expires && new Date(co.access_token_expires as string) < new Date()

  // "Started application" signal for the 14Q hub: they clicked through their invite link → mark started_at once
  // (until they consent). Fire-and-forget so it never blocks render. The hub poll reads this as "Started application".
  if (!expired && co.stage1_consent_given !== true && !co.started_at) {
    void service.from("application_co_applicants").update({ started_at: new Date().toISOString() }).eq("id", co.id as string)
  }

  const { data: app, error: appErr } = await service
    .from("applications")
    .select("first_name, last_name, id_number, marital_status, matrimonial_regime, spouse_info, listings(units(unit_number, properties(name)))")
    .eq("id", co.primary_application_id as string).maybeSingle()
  logQueryError("co-applicant page application context", appErr)

  // Unit label for context.
  const listing = app?.listings as { units?: { unit_number?: string | null; properties?: { name?: string | null } | null } | null } | null
  const unit = listing?.units
  const unitLabel = [unit?.unit_number, unit?.properties?.name].filter(Boolean).join(" · ") || "this home"

  // id_number (column) + spouse_info.idNumber are encrypted at rest → decrypt BOTH at this read boundary before any
  // matching/display (encrypted values never compare equal — random IV). primarySpouse is decrypted below.
  const coId = decryptIdNumber(co.id_number as string | null)
  const primaryId = decryptIdNumber(app?.id_number as string | null)

  // Symmetric prefill (14M §1): the primary declared THIS co as their in-community spouse → pre-fill the marriage.
  const primarySpouse = decryptSpouseInfo(app?.spouse_info as Record<string, unknown> | null) as { isCoApplicant?: boolean; idNumber?: string | null } | null
  const linkedAsSpouse = !!primarySpouse?.isCoApplicant && !!primarySpouse.idNumber && primarySpouse.idNumber === coId
  const primaryName = [app?.first_name, app?.last_name].filter(Boolean).join(" ") || "the main applicant"
  const primaryCandidate: SpouseCandidate | null = primaryId
    ? { firstName: (app?.first_name as string | null) ?? "", lastName: (app?.last_name as string | null) ?? "", email: "", idNumber: primaryId }
    : null

  // Already-saved marital (resume) takes precedence over the symmetric prefill.
  const prefill: CoPrefill = {
    maritalStatus: (co.marital_status as string | null) ?? (linkedAsSpouse ? (app?.marital_status as string | null) ?? "married" : null),
    matrimonialRegime: (co.matrimonial_regime as string | null) ?? (linkedAsSpouse ? (app?.matrimonial_regime as string | null) ?? "in_community" : null),
    spouseIsCoApplicant: linkedAsSpouse ? true : null,
    linkedAsSpouse,
  }

  return (
    <CoApplicantSession
      token={token}
      orgId={co.org_id as string}
      applicationId={co.primary_application_id as string}
      coId={co.id as string}
      expired={expired}
      alreadyDone={co.stage1_consent_given === true}
      co={{
        firstName: (co.first_name as string | null) ?? "", lastName: (co.last_name as string | null) ?? "",
        idType: (co.id_type as string | null) ?? "sa_id", idNumber: coId ?? "",
        email: (co.applicant_email as string | null) ?? "", phone: (co.applicant_phone as string | null) ?? "",
        currentAddress: (co.current_address as Record<string, unknown> | null) ?? null,
      }}
      prefill={prefill}
      primaryCandidate={primaryCandidate}
      primaryName={primaryName}
      unitLabel={unitLabel}
    />
  )
}
