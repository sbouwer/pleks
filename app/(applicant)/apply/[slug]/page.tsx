/**
 * app/(applicant)/apply/[slug]/page.tsx — the LIVE public rental application (the redesigned wizard).
 *
 * Route:  /apply/[slug]  (the URL a listing shares; /apply/[slug]/preview now redirects here)
 * Auth:   public — service client, public_slug is the lookup key. A logged-in visitor prefills + resumes their
 *         own in-progress application and skips the email-OTP gate.
 * Data:   listings (by public_slug) + units/properties + organisations + user_profiles (the responsible agent)
 * Notes:  Server component renders the door-style shell + left cards; the interactive right panel is the client
 *         <StepPanel>. Style per brief/design/DESIGN_LANGUAGE.md (.pleks-public warm theme + FocusBackdrop +
 *         <Wordmark> + DetailCard grammar). Resumes via ?app&token, or auto-resumes a logged-in owner's draft.
 */

import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, decryptDob, decryptSpouseInfo } from "@/lib/crypto/idNumber"
import { DetailCard, DetailStatGrid } from "@/components/detail/DetailCard"
import { Image as ImageIcon } from "lucide-react"
import { StepPanel, type ResumeState } from "./applyOrchestrator"
import { ApplyLoginButton } from "./ApplyLoginButton"
import { ApplyPortalShell, ApplyAgentCard, Eyebrow } from "../applyPortalChrome"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getServerUser } from "@/lib/auth/server"
import { resolveAgentContact } from "@/lib/agent/resolveAgentContact"
import { fetchAgentContactParty } from "@/lib/actions/parties"
import type { PartyFormState } from "@/lib/parties/partyValidation"

type UnitRow = {
  unit_number: string | null
  bedrooms: number | null
  bathrooms: number | null
  size_m2: number | null
  furnished: boolean | null
  furnishing_status: string | null
  parking_bays: number | null
  assigned_agent_id: string | null
  properties: { name: string | null; address_line1: string | null; suburb: string | null; city: string | null; managing_agent_id: string | null; type: string | null } | null
}
type OrgRow = { name: string | null; email: string | null; phone: string | null; ppra_ffc_number: string | null; brand_logo_path: string | null }

// The resume link carries the token in the query string — keep it out of the Referer header sent to any
// third-party subresource on the page (the token is a bearer capability to a PII-bearing draft).
export const metadata = { referrer: "no-referrer" as const }

/** Load + validate a save-&-resume draft from ?app&token. Returns null unless the token is bound to that
 *  application, the draft belongs to THIS listing's org, and it has NOT been submitted (consent not given). */
async function loadResume(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  listingOrgId: string,
  appId: string,
  token: string,
): Promise<ResumeState | null> {
  const { data: tok, error: tokErr } = await db
    .from("application_tokens").select("application_id")
    .eq("token", token).eq("application_id", appId).gt("expires_at", new Date().toISOString()).maybeSingle()
  logQueryError("ApplyPreview resume token", tokErr)
  if (!tok) return null

  const { data: app, error: appErr } = await db
    .from("applications")
    .select("first_name, last_name, applicant_email, applicant_phone, id_type, id_number, date_of_birth, employment_type, employer_name, employment_start_date, employment_details, dependents_count, dependent_adults_count, dependent_minors_count, income_sources, declared_monthly_obligations_cents, expenses, applicant_addresses, applicant_type, company_info, marital_status, matrimonial_regime, spouse_info, email_verified_at, draft_step, draft_saved_at, stage1_status, org_id, submitted_at")
    .eq("id", appId).maybeSingle()
  logQueryError("ApplyPreview resume app", appErr)
  // Don't resume a SUBMITTED application (submitted_at set) — only drafts / pre-screens are editable.
  if (!app || app.org_id !== listingOrgId || app.submitted_at != null) return null

  const { data: cos, error: cosErr } = await db
    .from("application_co_applicants").select("first_name, last_name, applicant_email, applicant_phone, id_number, role")
    .eq("primary_application_id", appId)
  logQueryError("ApplyPreview resume co-applicants", cosErr)

  const prefix = `applications/${listingOrgId}/${appId}`
  const { data: files, error: filesErr } = await db.storage.from("application-docs").list(prefix)
  logQueryError("ApplyPreview resume docs", filesErr)
  const docPaths = (files ?? [])
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => ({ name: f.name, storagePath: `${prefix}/${f.name}` }))

  const sources = (app.income_sources as ResumeState["incomeSources"] | null) ?? []
  return {
    applicationId: appId, token, step: (app.draft_step as number | null) ?? 5, savedAt: (app.draft_saved_at as string | null) ?? null,
    applicantType: (app.applicant_type as ResumeState["applicantType"]) ?? null,
    company: (app.company_info as ResumeState["company"]) ?? null,
    emailVerified: (app.email_verified_at as string | null) != null,
    form: {
      firstName: (app.first_name as string | null) ?? undefined, lastName: (app.last_name as string | null) ?? undefined,
      email: (app.applicant_email as string | null) ?? undefined, phone: (app.applicant_phone as string | null) ?? undefined,
      idType: (app.id_type as string | null) ?? "sa_id", idNumber: decryptIdNumber(app.id_number as string | null) ?? undefined,
      dob: decryptDob(app.date_of_birth as string | null) ?? undefined,
      addresses: (app.applicant_addresses as PartyFormState["addresses"]) ?? undefined,
      maritalStatus: (app.marital_status as string | null) ?? undefined,
      matrimonialRegime: (app.matrimonial_regime as string | null) ?? undefined,
      ...((): Partial<PartyFormState> => {
        const s = decryptSpouseInfo(app.spouse_info as Record<string, unknown> | null) as { isCoApplicant?: boolean; firstName?: string; lastName?: string; idNumber?: string; email?: string } | null
        if (!s) return {}
        if (s.isCoApplicant) return { spouseIsCoApplicant: true, spouseEmail: s.email }
        return { spouseIsCoApplicant: false, spouseFirstName: s.firstName, spouseLastName: s.lastName, spouseIdNumber: s.idNumber, spouseEmail: s.email }
      })(),
    },
    emp: {
      employment_type: (app.employment_type as string | null) ?? "",
      employer: (app.employer_name as string | null) ?? "",
      start_date: (app.employment_start_date as string | null) ?? "",
      // branching context restored from the employment_details jsonb (nulls render as empty in the inputs).
      ...((app.employment_details as Partial<ResumeState["emp"]> | null) ?? {}),
    },
    dependents: (app.dependents_count as number | null) ?? null,
    dependentAdults: (app.dependent_adults_count as number | null) ?? null,
    dependentMinors: (app.dependent_minors_count as number | null) ?? null,
    incomeSources: sources,
    commitments: (app.expenses as ResumeState["commitments"]) ?? [],
    coApplicants: (cos ?? []).map((c) => ({
      firstName: (c.first_name as string | null) ?? "", lastName: (c.last_name as string | null) ?? "",
      email: (c.applicant_email as string | null) ?? "", phone: (c.applicant_phone as string | null) ?? "",
      idNumber: decryptIdNumber(c.id_number as string | null) ?? "", role: (c.role as "co_applicant" | "guarantor") ?? "co_applicant", invited: true,
    })),
    docPaths,
    // The filler finished their own section before this resume → the hub shows their card as Completed, not
    // "Started application". documents_submitted = section done; pre_screen_complete = they also ran the review
    // assessment (/submit advances the status). Both mean "their part is done". (Submitted apps aren't resumable.)
    selfDone: ["documents_submitted", "pre_screen_complete"].includes((app.stage1_status as string | null) ?? ""),
  }
}

/** Logged-in owner returning without the resume link: find their in-progress (unsubmitted, not-deleted)
 *  application for this listing + a still-valid token, and resume it — so they don't start a duplicate. */
async function loadOwnDraft(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  listingOrgId: string,
  listingId: string,
  email: string,
): Promise<ResumeState | null> {
  const { data: app, error: appErr } = await db
    .from("applications").select("id")
    .eq("listing_id", listingId).eq("org_id", listingOrgId).ilike("applicant_email", email)
    .is("submitted_at", null).is("deleted_at", null)
    .order("created_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("ApplyPreview own draft", appErr)
  if (!app) return null
  const { data: tok, error: tokErr } = await db
    .from("application_tokens").select("token")
    .eq("application_id", app.id as string).gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("ApplyPreview own draft token", tokErr)
  if (!tok) return null
  return loadResume(db, listingOrgId, app.id as string, tok.token as string)
}

/** True if this email already has a SUBMITTED (not deleted) application for this listing. */
async function hasSubmittedApplication(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  listingOrgId: string,
  listingId: string,
  email: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("applications").select("id")
    .eq("listing_id", listingId).eq("org_id", listingOrgId).ilike("applicant_email", email)
    .not("submitted_at", "is", null).is("deleted_at", null).limit(1).maybeSingle()
  logQueryError("ApplyPreview already-applied", error)
  return !!data
}

function furnishLabel(unit: UnitRow | null): string {
  if (unit?.furnishing_status) {
    return unit.furnishing_status.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase())
  }
  return unit?.furnished ? "Furnished" : "Unfurnished"
}
function parkingLabel(bays: number | null | undefined): string {
  if (!bays || bays <= 0) return "No parking"
  return `${bays} bay${bays > 1 ? "s" : ""}`
}
function numOrDash(n: number | null | undefined): string { return n != null ? String(n) : "—" }
function areaLabel(m2: number | null | undefined): string { return m2 != null ? `${m2} m²` : "—" }

export default async function ApplyPreviewPage({ params, searchParams }: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ app?: string; token?: string }> }>) {
  const { slug } = await params
  const { app: resumeAppId, token: resumeToken } = await searchParams
  const db = await createServiceClient()

  const { data: listing, error } = await db
    .from("listings")
    .select("id, org_id, asking_rent_cents, available_from, pet_friendly, listing_photos, units(unit_number, bedrooms, bathrooms, size_m2, furnished, furnishing_status, parking_bays, assigned_agent_id, properties(name, address_line1, suburb, city, managing_agent_id, type)), organisations(name, email, phone, ppra_ffc_number, brand_logo_path)")
    .eq("public_slug", slug)
    .eq("status", "active")
    .maybeSingle()
  logQueryError("ApplyPreview listings", error)
  if (!listing) notFound()

  let resume = resumeAppId && resumeToken
    ? await loadResume(db, listing.org_id as string, resumeAppId, resumeToken)
    : null

  const unit = (listing.units as unknown as UnitRow | null) ?? null
  const property = unit?.properties ?? null
  const org = (listing.organisations as unknown as OrgRow | null) ?? null
  const leaseType: "residential" | "commercial" = property?.type === "commercial" ? "commercial" : "residential"

  // The agent shown to applicants is the practitioner RESPONSIBLE for the unit (unit's assigned agent,
  // else the property's managing agent) — NOT listings.created_by, which may be an admin.
  const agentId = (unit?.assigned_agent_id ?? property?.managing_agent_id) ?? null
  let agentName: string | null = null
  let agentPhone: string | null = null
  let agentPhoto: string | null = null
  if (agentId) {
    const { data: agent, error: agentErr } = await db
      .from("user_profiles")
      .select("full_name, first_name, last_name, phone, avatar_url")
      .eq("id", agentId)
      .maybeSingle()
    logQueryError("ApplyPreview user_profiles", agentErr)
    agentName = ((agent?.full_name as string | null) ?? "").trim()
      || [agent?.first_name, agent?.last_name].filter(Boolean).join(" ").trim()
      || null
    agentPhone = (agent?.phone as string | null) ?? null
    agentPhoto = (agent?.avatar_url as string | null) ?? null
  }
  // Org logo (public org-assets) for the agent card header.
  const orgLogoUrl = org?.brand_logo_path
    ? db.storage.from("org-assets").getPublicUrl(org.brand_logo_path).data.publicUrl
    : null

  // Auth-gated autofill (identity finding §3): if the visitor is logged in, prefill ONLY from their OWN
  // record (session authorises). Identity + address prefill clean; financial/employment are NOT prefilled
  // (re-confirmed in-flow). Anonymous visitors get the login door instead — never blocked.
  let prefill: Partial<PartyFormState> | null = null
  let prefillName: string | null = null
  // A logged-in visitor's account email is already confirmed (Supabase auth) — they skip the email-OTP gate.
  let verifiedEmail: string | null = null
  const gw = await gatewaySSR()
  if (gw) {
    const authEmail = (await getServerUser())?.email ?? null
    verifiedEmail = authEmail
    const resolved = await resolveAgentContact(gw.db, gw.orgId, gw.userId, authEmail)
    if (resolved.ok && resolved.contactId) {
      const fetched = await fetchAgentContactParty(resolved.contactId)
      if (fetched.ok && fetched.form) {
        const f = fetched.form
        prefill = {
          title: f.title, initials: f.initials, firstName: f.firstName, lastName: f.lastName,
          middleNames: f.middleNames, suffix: f.suffix, designation: f.designation,
          idType: f.idType ?? "sa_id", idNumber: f.idNumber, dob: f.dob, gender: f.gender,
          preferredChannel: f.preferredChannel,
          email: f.email ?? authEmail ?? undefined, phone: f.phone, addresses: f.addresses,
        }
        prefillName = [f.firstName, f.lastName].filter(Boolean).join(" ") || null
      }
    }
  }

  // No resume link, but a logged-in owner with an in-progress application here → auto-resume it (no duplicate).
  if (!resume && verifiedEmail) {
    resume = await loadOwnDraft(db, listing.org_id as string, listing.id as string, verifiedEmail)
  }

  // Logged-in applicant who already SUBMITTED to this listing → tell them up front (don't make them fill it again
  // only to be blocked on save). Only checked for a known email (logged-in); anonymous dedup happens at submit.
  const alreadyApplied = verifiedEmail
    ? await hasSubmittedApplication(db, listing.org_id as string, listing.id as string, verifiedEmail)
    : false

  const title = [property?.address_line1, property?.suburb ?? property?.city].filter(Boolean).join(", ") || property?.name || "This property"
  const photo = (listing.listing_photos as string[] | null)?.[0] ?? null

  // One short value per cell so nothing truncates in the narrow 2-col grid (bed/bath/size were one long line).
  const facts: ReadonlyArray<{ label: string; value: string; tone?: "ok" }> = [
    { label: "Rent / month", value: formatZAR(listing.asking_rent_cents) },
    { label: "Available", value: listing.available_from ? new Date(listing.available_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "Now" },
    { label: "Bedrooms", value: numOrDash(unit?.bedrooms) },
    { label: "Bathrooms", value: numOrDash(unit?.bathrooms) },
    { label: "Size", value: areaLabel(unit?.size_m2) },
    { label: "Parking", value: parkingLabel(unit?.parking_bays) },
    { label: "Furnished", value: furnishLabel(unit) },
    { label: "Pets", value: listing.pet_friendly ? "Allowed" : "Not allowed", ...(listing.pet_friendly ? { tone: "ok" as const } : {}) },
  ]

  // Full-page shell (the listing space becomes the step rail): a compact listing strip on top, then StepPanel
  // owns the rail (steps + agent) + form panel. The agent card is passed into the rail.
  const stripTitle = [property?.name, unit?.unit_number ? `Unit ${unit.unit_number}` : null, property?.suburb ?? property?.city].filter(Boolean).join(" · ") || title
  const availStr = facts[1]?.value ?? "Now"
  const agentCard = (
    <ApplyAgentCard
      orgName={org?.name ?? null} orgEmail={org?.email ?? null} orgPhone={org?.phone ?? null} orgLogoUrl={orgLogoUrl}
      agentName={agentName} agentPhone={agentPhone} agentPhoto={agentPhoto}
      enquirySubject={"Property application enquiry, address: " + title}
    />
  )

  // The home being applied for — shown in the side column BEFORE the applicant begins (it becomes the step rail
  // once they do). The fine-tuned listing card: photo hero + DetailStatGrid of the facts.
  const listingCard = (
    <DetailCard title={title}>
      <div className="flex h-full flex-col">
        <div
          className="-mx-5 -mt-5 flex min-h-[120px] flex-1 items-center justify-center bg-cover bg-center text-white/70"
          style={photo ? { backgroundImage: `url(${photo})` } : { backgroundImage: "linear-gradient(135deg,#9fb8cf 0%,#e7e0d2 55%,#c8ad84 100%)" }}
          aria-hidden
        >
          {!photo && <ImageIcon className="size-8" />}
        </div>
        <div className="-mx-5 -mb-5 border-t border-border">
          <DetailStatGrid stats={facts} />
        </div>
      </div>
    </DetailCard>
  )

  return (
    <ApplyPortalShell
      stripTitle={stripTitle}
      stripDetail={`${formatZAR(listing.asking_rent_cents)}/mo · available ${availStr}`}
      begun={!!resume}
      login={<ApplyLoginButton slug={slug} loggedIn={!!gw} name={prefillName} />}
    >
      {alreadyApplied ? (
        <div className="flex flex-col gap-4 [@media(min-width:1024px)_and_(min-height:700px)]:max-w-2xl">
          <div className="rounded-[var(--r-button)] border border-[var(--rule)] bg-[var(--paper-raised)] p-6">
            <Eyebrow>Already applied</Eyebrow>
            <h2 className="mt-2 text-lg font-medium text-[var(--ink)]">You&apos;ve already applied for this unit</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
              Your application for this listing is with the agent. There&apos;s nothing more to do — they&apos;ll be in touch about next steps. If you need to change something, contact the agent directly.
            </p>
          </div>
          {agentCard}
        </div>
      ) : (
        <StepPanel
          slug={slug}
          orgId={listing.org_id as string}
          listingTitle={stripTitle}
          listingCard={listingCard}
          leaseType={leaseType}
          askingRentCents={(listing.asking_rent_cents as number) ?? 0}
          prefill={prefill}
          resume={resume}
          verifiedEmail={verifiedEmail}
          agentCard={agentCard}
        />
      )}
    </ApplyPortalShell>
  )
}
