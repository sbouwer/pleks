/**
 * app/(applicant)/apply/co-applicant/[token]/page.tsx — a co peer's own per-link session (ADDENDUM_14R full-peer).
 *
 * Route:  /apply/co-applicant/[token]  (the invite link sent to the co-applicant; static segment wins over [slug])
 * Auth:   application_co_applicants.access_token — the token IS the email-possession proof (token-as-proof, §3); the
 *         co sees ONLY their own card (POPIA per-subject isolation, §5).
 * Data:   the co's UniformApplicant (the adapter — full peer) → the lead orchestrator's ResumeState, + the primary
 *         application's listing/org/agent for the shared portal chrome.
 * Notes:  14R Phase 2 — a co is a FULL applicant: this is a thin door into the ONE listing portal (applyPortalChrome
 *         + the shared <StepPanel>), entering at the hub / their own card (actor isLead:false). If the lead linked
 *         THIS co as their in-community spouse (by ID), we pre-fill the marriage to confirm (14M §1).
 */
import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, decryptSpouseInfo } from "@/lib/crypto/idNumber"
import { getApplicants } from "@/lib/applications/applicantAdapter"
import { formatZAR } from "@/lib/constants"
import { ApplyPortalShell, ApplyAgentCard, Eyebrow } from "../../applyPortalChrome"
import { StepPanel, type ResumeState } from "../../[slug]/applyOrchestrator"
import { buildCoResumeState } from "./buildCoResume"
import { getServerUser } from "@/lib/auth/server"

type CoListing = {
  public_slug: string | null; asking_rent_cents: number | null; available_from: string | null
  units: { unit_number: string | null; assigned_agent_id: string | null; properties: { name: string | null; suburb: string | null; city: string | null; type: string | null; managing_agent_id: string | null } | null } | null
  organisations: { name: string | null; phone: string | null; email: string | null; brand_logo_path: string | null } | null
}

export default async function CoApplicantPage({ params }: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params
  const service = await createServiceClient()

  const { data: co, error } = await service
    .from("application_co_applicants")
    .select("id, org_id, applicant_email, stage1_consent_given, started_at, access_token_expires, declined_at, primary_application_id")
    .eq("access_token", token).is("declined_at", null).maybeSingle()
  logQueryError("co-applicant page load", error)
  if (!co) notFound()

  const appId = co.primary_application_id as string
  const expired = !!co.access_token_expires && new Date(co.access_token_expires as string) < new Date()

  // "Started application" signal for the hub: they clicked through their invite link → mark started_at once (until
  // they consent). Fire-and-forget so it never blocks render; the lead's hub poll reads this as "Started application".
  if (!expired && co.stage1_consent_given !== true && !co.started_at) {
    void service.from("application_co_applicants").update({ started_at: new Date().toISOString() }).eq("id", co.id as string)
  }

  // Listing / org / agent for the portal chrome + the lead's marital for the symmetric spouse prefill (14M §1).
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("first_name, last_name, id_number, marital_status, matrimonial_regime, spouse_info, listings(public_slug, asking_rent_cents, available_from, units(unit_number, assigned_agent_id, properties(name, suburb, city, type, managing_agent_id)), organisations(name, phone, email, brand_logo_path))")
    .eq("id", appId).maybeSingle()
  logQueryError("co-applicant page application context", appErr)

  const listing = (app?.listings as unknown as CoListing | null) ?? null
  const unit = listing?.units ?? null
  const property = unit?.properties ?? null
  const org = listing?.organisations ?? null
  const unitLabel = [unit?.unit_number, property?.name].filter(Boolean).join(" · ") || "this home"
  const leaseType: "residential" | "commercial" = property?.type === "commercial" ? "commercial" : "residential"

  // Responsible agent: the unit's assigned agent, else the property's managing agent (same rule as the lead page).
  const agentId = (unit?.assigned_agent_id ?? property?.managing_agent_id) ?? null
  let agentName: string | null = null, agentPhone: string | null = null, agentPhoto: string | null = null
  if (agentId) {
    const { data: agent, error: agentErr } = await service
      .from("user_profiles").select("full_name, first_name, last_name, phone, avatar_url").eq("id", agentId).maybeSingle()
    logQueryError("co-applicant page agent", agentErr)
    agentName = ((agent?.full_name as string | null) ?? "").trim() || [agent?.first_name, agent?.last_name].filter(Boolean).join(" ").trim() || null
    agentPhone = (agent?.phone as string | null) ?? null
    agentPhoto = (agent?.avatar_url as string | null) ?? null
  }
  const orgLogoUrl = org?.brand_logo_path ? service.storage.from("org-assets").getPublicUrl(org.brand_logo_path).data.publicUrl : null
  const stripTitle = [property?.name, unit?.unit_number ? `Unit ${unit.unit_number}` : null, property?.suburb ?? property?.city].filter(Boolean).join(" · ") || unitLabel
  const availStr = listing?.available_from ? new Date(listing.available_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "Now"
  const rentStr = listing?.asking_rent_cents != null ? formatZAR(listing.asking_rent_cents) : null

  // Source the co as a full peer via the adapter (decrypts id/dob/spouse + folds section_data); map → ResumeState.
  const applicants = await getApplicants(service, appId)
  const coUniform = applicants.find((a) => a.ref === `co_${co.id}`)
  if (!coUniform) notFound()
  // How many OTHER peers (lead + other cos) haven't finished — a load-time snapshot that holds the co's submit
  // until everyone's green (14R §4). A count, not names (POPIA-safe); the server re-checks all-green at submit.
  const peersIncomplete = applicants.filter((a) => a.ref !== coUniform.ref && a.status !== "completed").length

  // The co's own document folder (subject-isolated under co_{coId}/) → resume's docPaths.
  const docPrefix = `applications/${co.org_id}/${appId}/co_${co.id}`
  const { data: files, error: filesErr } = await service.storage.from("application-docs").list(docPrefix)
  logQueryError("co-applicant page docs", filesErr)
  const docPaths = (files ?? []).filter((f) => f.name && !f.name.startsWith(".")).map((f) => ({ name: f.name, storagePath: `${docPrefix}/${f.name}` }))

  // Symmetric prefill (14M §1): the lead declared THIS co as their in-community spouse → offer the marriage pre-filled.
  const primaryId = decryptIdNumber(app?.id_number as string | null)
  const primarySpouse = decryptSpouseInfo(app?.spouse_info as Record<string, unknown> | null) as { isCoApplicant?: boolean; idNumber?: string | null } | null
  const linkedAsSpouse = !!primarySpouse?.isCoApplicant && !!primarySpouse.idNumber && primarySpouse.idNumber === coUniform.identity.idNumber
  // The lead as the sole spouse candidate (for the "my spouse is the main applicant" option + the s15 link) — NOT a
  // hub roster entry (the co hub is self-only). email omitted: the link is by id_number.
  const spouseCandidate = primaryId
    ? { firstName: (app?.first_name as string | null) ?? "", lastName: (app?.last_name as string | null) ?? "", email: "", phone: "", idNumber: primaryId, role: "co_applicant" as const, invited: true }
    : null

  // 14R §5: the OTHER applicants as a NAME + STATUS-only roster (no financials / ID / bank leave the server) → the
  // co's read-only hub cards, so a full peer sees the lead (e.g. "Completed") + any other co's, not just themselves.
  const peerRoster = applicants
    .filter((a) => a.ref !== coUniform.ref)
    .map((a) => {
      let roleLabel = "Co-applicant"
      if (a.isLead) roleLabel = "Main applicant"
      else if (a.role === "guarantor") roleLabel = "Guarantor"
      return { id: a.ref, name: [a.identity.firstName, a.identity.lastName].filter(Boolean).join(" ") || "Applicant", roleLabel, status: a.status }
    })

  const resume: ResumeState = buildCoResumeState(coUniform, { applicationId: appId, token, docPaths, spouseCandidate, peerRoster })
  // Apply the symmetric prefill only where the co hasn't already declared their own marital status.
  if (linkedAsSpouse) {
    resume.form.maritalStatus = resume.form.maritalStatus ?? (app?.marital_status as string | null) ?? "married"
    resume.form.matrimonialRegime = resume.form.matrimonialRegime ?? (app?.matrimonial_regime as string | null) ?? "in_community"
    resume.form.spouseIsCoApplicant = resume.form.spouseIsCoApplicant ?? true
  }

  const agentCard = (
    <ApplyAgentCard
      orgName={org?.name ?? null} orgEmail={org?.email ?? null} orgPhone={org?.phone ?? null} orgLogoUrl={orgLogoUrl}
      agentName={agentName} agentPhone={agentPhone} agentPhoto={agentPhoto}
      enquirySubject={`Co-applicant query — ${unitLabel}`}
    />
  )

  return (
    <ApplyPortalShell stripTitle={stripTitle} stripDetail={rentStr ? `${rentStr}/mo · available ${availStr}` : `available ${availStr}`} begun={true}>
      {expired ? (
        <div className="flex flex-col gap-4 [@media(min-width:1024px)_and_(min-height:700px)]:max-w-2xl">
          <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-6">
            <Eyebrow>Invite expired</Eyebrow>
            <h2 className="mt-2 text-lg font-medium text-[var(--ink)]">Your invite has expired</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">Please ask the main applicant to resend your invitation link.</p>
          </div>
          {agentCard}
        </div>
      ) : (
        <StepPanel
          slug={listing?.public_slug ?? ""}
          orgId={co.org_id as string}
          listingTitle={stripTitle}
          leaseType={leaseType}
          askingRentCents={listing?.asking_rent_cents ?? 0}
          resume={resume}
          actor={{ isLead: false, coId: co.id as string, peersIncomplete }}
          verifiedEmail={(await getServerUser())?.email ?? null}
          agentCard={agentCard}
        />
      )}
    </ApplyPortalShell>
  )
}
