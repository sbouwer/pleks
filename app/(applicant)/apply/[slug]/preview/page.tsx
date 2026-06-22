/**
 * app/(applicant)/apply/[slug]/preview/page.tsx — VISUAL-LAYOUT PREVIEW of the redesigned applicant
 * pre-screening page (design handoff: brief/design/project/design_handoff_application_page).
 *
 * Route:  /apply/[slug]/preview
 * Auth:   public (token-gated prefix) — preview only; service client, slug is the lookup key
 * Data:   listings (by public_slug) + units/properties + organisations + user_profiles (created_by = agent)
 * Notes:  Real data now (not placeholder). Server component renders the shell + left cards; the interactive
 *         right panel is the client <StepPanel>. Built to the real app style (brief/design/DESIGN_LANGUAGE.md):
 *         .pleks-public warm theme + FocusBackdrop, <Wordmark>, the DetailCard grammar (amber-dash header +
 *         amber baseline) + DetailStatGrid. Deposit/lease-term aren't on the listing schema, so they're not
 *         shown (no fabricated facts). Does NOT touch the live /apply flow.
 */

import { notFound } from "next/navigation"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { Wordmark } from "@/components/ui/Wordmark"
import { FocusBackdrop } from "@/components/layout/FocusBackdrop"
import "@/components/layout/focus-shell.css"
import { DetailCard, DetailStatGrid } from "@/components/detail/DetailCard"
import { Phone, Mail, MessageCircle, ShieldCheck, ImageIcon, type LucideIcon } from "lucide-react"
import { StepPanel, type ResumeState } from "./StepPanel"
import { ApplyLoginButton } from "./ApplyLoginButton"
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
type OrgRow = { name: string | null; email: string | null; phone: string | null; ppra_ffc_number: string | null }

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
    .select("first_name, last_name, applicant_email, applicant_phone, id_type, id_number, date_of_birth, employment_type, employer_name, employment_start_date, income_sources, applicant_addresses, applicant_type, company_info, email_verified_at, draft_step, draft_saved_at, org_id, stage1_consent_given")
    .eq("id", appId).maybeSingle()
  logQueryError("ApplyPreview resume app", appErr)
  if (!app || app.org_id !== listingOrgId || app.stage1_consent_given === true) return null

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
    applicationId: appId, token, step: (app.draft_step as number | null) ?? 3, savedAt: (app.draft_saved_at as string | null) ?? null,
    applicantType: (app.applicant_type as ResumeState["applicantType"]) ?? null,
    company: (app.company_info as ResumeState["company"]) ?? null,
    emailVerified: (app.email_verified_at as string | null) != null,
    form: {
      firstName: (app.first_name as string | null) ?? undefined, lastName: (app.last_name as string | null) ?? undefined,
      email: (app.applicant_email as string | null) ?? undefined, phone: (app.applicant_phone as string | null) ?? undefined,
      idType: (app.id_type as string | null) ?? "sa_id", idNumber: (app.id_number as string | null) ?? undefined,
      dob: (app.date_of_birth as string | null) ?? undefined,
      addresses: (app.applicant_addresses as PartyFormState["addresses"]) ?? undefined,
    },
    emp: {
      employment_type: (app.employment_type as string | null) ?? "",
      employer: (app.employer_name as string | null) ?? "",
      start_date: (app.employment_start_date as string | null) ?? "",
    },
    incomeSources: sources,
    coApplicants: (cos ?? []).map((c) => ({
      firstName: (c.first_name as string | null) ?? "", lastName: (c.last_name as string | null) ?? "",
      email: (c.applicant_email as string | null) ?? "", phone: (c.applicant_phone as string | null) ?? "",
      idNumber: (c.id_number as string | null) ?? "", role: (c.role as "co_applicant" | "guarantor") ?? "co_applicant", invited: true,
    })),
    docPaths,
  }
}

function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{children}</span>
}

/** Stacked contact row — matches the supplier/contractor detail card's contact lines. */
function ContactLine({ icon: Icon, href, children }: Readonly<{ icon: LucideIcon; href?: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {href
        ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="truncate transition-colors hover:text-brand">{children}</a>
        : <span className="truncate">{children}</span>}
    </div>
  )
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
function sizeLabel(unit: UnitRow | null): string {
  const parts: string[] = []
  if (unit?.bedrooms != null) parts.push(`${unit.bedrooms} bed`)
  if (unit?.bathrooms != null) parts.push(`${unit.bathrooms} bath`)
  if (unit?.size_m2 != null) parts.push(`${unit.size_m2}m²`)
  return parts.join(" · ") || "—"
}
/** SA mobile → wa.me link (leading 0 → 27), or null. */
function waLink(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replaceAll(/\D/g, "")
  if (digits.startsWith("0")) return `https://wa.me/27${digits.slice(1)}`
  if (digits.startsWith("27")) return `https://wa.me/${digits}`
  return null
}

export default async function ApplyPreviewPage({ params, searchParams }: Readonly<{ params: Promise<{ slug: string }>; searchParams: Promise<{ app?: string; token?: string }> }>) {
  const { slug } = await params
  const { app: resumeAppId, token: resumeToken } = await searchParams
  const db = await createServiceClient()

  const { data: listing, error } = await db
    .from("listings")
    .select("org_id, asking_rent_cents, available_from, pet_friendly, listing_photos, units(unit_number, bedrooms, bathrooms, size_m2, furnished, furnishing_status, parking_bays, assigned_agent_id, properties(name, address_line1, suburb, city, managing_agent_id, type)), organisations(name, email, phone, ppra_ffc_number)")
    .eq("public_slug", slug)
    .eq("status", "active")
    .maybeSingle()
  logQueryError("ApplyPreview listings", error)
  if (!listing) notFound()

  const resume = resumeAppId && resumeToken
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
  let agentFfc: string | null = null
  if (agentId) {
    const { data: agent, error: agentErr } = await db
      .from("user_profiles")
      .select("full_name, first_name, last_name, phone, ppra_ffc_number")
      .eq("id", agentId)
      .maybeSingle()
    logQueryError("ApplyPreview user_profiles", agentErr)
    agentName = ((agent?.full_name as string | null) ?? "").trim()
      || [agent?.first_name, agent?.last_name].filter(Boolean).join(" ").trim()
      || null
    agentPhone = (agent?.phone as string | null) ?? null
    agentFfc = (agent?.ppra_ffc_number as string | null) ?? null
  }

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

  const title = [property?.address_line1, property?.suburb ?? property?.city].filter(Boolean).join(", ") || property?.name || "This property"
  const photo = (listing.listing_photos as string[] | null)?.[0] ?? null
  const phone = agentPhone ?? org?.phone ?? null
  const waHref = waLink(phone)
  const ffc = org?.ppra_ffc_number ?? null
  const enquiryMailto = org?.email
    ? `mailto:${org.email}?subject=${encodeURIComponent("Property application enquiry, address: " + title)}`
    : null

  const facts: ReadonlyArray<{ label: string; value: string; tone?: "ok" }> = [
    { label: "Rent / month", value: formatZAR(listing.asking_rent_cents) },
    { label: "Available", value: listing.available_from ? new Date(listing.available_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "Now" },
    { label: "Furnished", value: furnishLabel(unit) },
    { label: "Pets", value: listing.pet_friendly ? "Allowed" : "Not allowed", ...(listing.pet_friendly ? { tone: "ok" as const } : {}) },
    { label: "Parking", value: parkingLabel(unit?.parking_bays) },
    { label: "Size", value: sizeLabel(unit) },
  ]

  return (
    <div className="pleks-public" data-theme="light" style={{ display: "contents" }}>
      <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: "var(--paper)", color: "var(--ink)", colorScheme: "light" }}>
        {/* Same 4-layer warm backdrop as the login surface (fixed behind content) */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden"><FocusBackdrop /></div>

      <div className="relative z-10 flex h-full flex-col">
        {/* Header — backed surface; sits ABOVE the scroll area so a scrollbar can't clip it */}
        <header className="shrink-0 border-b border-[var(--rule)] bg-[var(--paper-raised)]">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-3">
            <div className="flex items-center gap-3">
              <Wordmark style={{ fontSize: 19 }} />
              <span className="h-4 w-px bg-[var(--rule)]" />
              <Eyebrow>Rental application</Eyebrow>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <span className="hidden items-center gap-1.5 text-[var(--ink-mute)] sm:flex">
                <ShieldCheck className="size-3.5" />
                <Eyebrow>Encrypted</Eyebrow>
              </span>
              <ApplyLoginButton slug={slug} loggedIn={!!gw} name={prefillName} />
            </div>
          </div>
        </header>

        {/* Content area — fills the viewport on desktop (each column scrolls internally); page-scrolls on mobile */}
        <div className="min-h-0 flex-1 overflow-y-auto [@media(min-width:1024px)_and_(min-height:700px)]:overflow-hidden">
          <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-5 px-6 py-4 [@media(min-width:1024px)_and_(min-height:700px)]:h-full [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0 [@media(min-width:1024px)_and_(min-height:700px)]:flex-row [@media(min-width:1024px)_and_(min-height:700px)]:items-stretch">
            {/* Left rail — unit card grows to fill */}
            <aside className="flex w-full flex-col gap-4 [@media(min-width:1024px)_and_(min-height:700px)]:w-[360px] [@media(min-width:1024px)_and_(min-height:700px)]:min-h-0">
              <div className="flex flex-col lg:flex-1">
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
              </div>

              <div className="shrink-0">
                <DetailCard
                  title="Your agent"
                  headerAction={ffc ? <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--amber-ink)]">FFC {ffc}</span> : undefined}
                >
                  <div>
                    <p className="text-sm font-semibold leading-snug">{org?.name ?? "Managing agency"}</p>
                    {agentName && <p className="text-xs text-muted-foreground">{agentName} · Rental agent</p>}
                    {agentFfc && <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--ink-mute)]">FFC {agentFfc}</p>}
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {phone && <ContactLine icon={Phone} href={`tel:${phone.replaceAll(/\s/g, "")}`}>{phone}</ContactLine>}
                    {waHref && <ContactLine icon={MessageCircle} href={waHref}>WhatsApp</ContactLine>}
                    {enquiryMailto && <ContactLine icon={Mail} href={enquiryMailto}>{org?.email}</ContactLine>}
                  </div>
                </DetailCard>
              </div>
            </aside>

            {/* Right door working panel (client island) */}
            <StepPanel
              slug={slug}
              orgId={listing.org_id as string}
              leaseType={leaseType}
              askingRentCents={(listing.asking_rent_cents as number) ?? 0}
              prefill={prefill}
              resume={resume}
              verifiedEmail={verifiedEmail}
            />
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
