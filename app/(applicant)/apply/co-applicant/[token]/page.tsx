/**
 * app/(applicant)/apply/co-applicant/[token]/page.tsx — a co-applicant's own per-link session (ADDENDUM_14Q §10).
 *
 * Route:  /apply/co-applicant/[token]  (the invite link sent to the co-applicant; static segment wins over [slug])
 * Auth:   application_co_applicants.access_token — the co sees ONLY their own row (POPIA per-subject isolation).
 * Data:   application_co_applicants + the primary application's listing/org/agent (so the co sees the SAME portal
 *         chrome the primary does — warm theme, brand header, listing strip, agent card) + the symmetric spouse prefill.
 * Notes:  Increment 1 — identity + marital + consent → stage1_consent_given (unlocks the J1 gate + the hub's live
 *         co-status + the 14M marital flags). Income + documents are a later increment. If the primary linked THIS
 *         co as their in-community spouse (by ID), we pre-fill the marriage for the co to confirm (14M amendment §1).
 */
import { notFound } from "next/navigation"
import Image from "next/image"
import { Phone, Mail, MessageCircle, ShieldCheck, type LucideIcon } from "lucide-react"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { decryptIdNumber, decryptSpouseInfo } from "@/lib/crypto/idNumber"
import { formatZAR } from "@/lib/constants"
import { Wordmark } from "@/components/ui/Wordmark"
import { FocusBackdrop } from "@/components/layout/FocusBackdrop"
import "@/components/layout/focus-shell.css"
import { DetailCard } from "@/components/detail/DetailCard"
import { PublicThemeProvider } from "@/app/(public)/PublicThemeProvider"
import { ApplyChromeProvider, ApplyUnitStrip } from "../../[slug]/applyChrome"
import { ApplyThemeToggle } from "../../[slug]/ApplyLoginButton"
import { CoApplicantSession, type CoPrefill, type SpouseCandidate } from "./CoApplicantSession"

type CoListing = {
  asking_rent_cents: number | null; available_from: string | null
  units: { unit_number: string | null; assigned_agent_id: string | null; properties: { name: string | null; suburb: string | null; city: string | null; managing_agent_id: string | null } | null } | null
  organisations: { name: string | null; phone: string | null; email: string | null; brand_logo_path: string | null } | null
}

function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-mute)]">{children}</span>
}
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
/** SA mobile → wa.me link (leading 0 → 27), or null. */
function waLink(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replaceAll(/\D/g, "")
  if (digits.startsWith("0")) return `https://wa.me/27${digits.slice(1)}`
  if (digits.startsWith("27")) return `https://wa.me/${digits}`
  return null
}

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
    .select("first_name, last_name, id_number, marital_status, matrimonial_regime, spouse_info, listings(asking_rent_cents, available_from, units(unit_number, assigned_agent_id, properties(name, suburb, city, managing_agent_id)), organisations(name, phone, email, brand_logo_path))")
    .eq("id", co.primary_application_id as string).maybeSingle()
  logQueryError("co-applicant page application context", appErr)

  // Listing / org / agent for the SAME portal chrome the primary applicant sees.
  const listing = (app?.listings as unknown as CoListing | null) ?? null
  const unit = listing?.units ?? null
  const property = unit?.properties ?? null
  const org = listing?.organisations ?? null
  const unitLabel = [unit?.unit_number, property?.name].filter(Boolean).join(" · ") || "this home"

  // Responsible agent: the unit's assigned agent, else the property's managing agent (same rule as the primary page).
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
  const phone = agentPhone ?? org?.phone ?? null
  const waHref = waLink(phone)
  const enquiryMailto = org?.email ? `mailto:${org.email}?subject=${encodeURIComponent("Co-applicant query — " + unitLabel)}` : null
  const stripTitle = [property?.name, unit?.unit_number ? `Unit ${unit.unit_number}` : null, property?.suburb ?? property?.city].filter(Boolean).join(" · ") || unitLabel
  const availStr = listing?.available_from ? new Date(listing.available_from).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "Now"
  const rentStr = listing?.asking_rent_cents != null ? formatZAR(listing.asking_rent_cents) : null

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

  const agentCard = (
    <DetailCard title="Your agent" headerAction={orgLogoUrl ? <Image src={orgLogoUrl} alt={org?.name ?? "Agency"} width={112} height={28} className="h-7 w-auto max-w-20 object-contain" unoptimized /> : undefined}>
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-[var(--ink)]">{org?.name ?? "Managing agency"}</p>
            {agentName && <p className="text-sm leading-snug text-[var(--ink)]">{agentName}</p>}
            <p className="text-xs text-muted-foreground">Rental agent</p>
          </div>
          {agentPhoto && (
            <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-[var(--r-button)] border border-border">
              <Image src={agentPhoto} alt={agentName ?? "Agent"} fill className="object-cover object-top" unoptimized />
            </div>
          )}
        </div>
        {(phone || waHref || enquiryMailto) && (
          <div className="space-y-1.5 border-t border-border pt-3">
            {phone && <ContactLine icon={Phone} href={`tel:${phone.replaceAll(/\s/g, "")}`}>{phone}</ContactLine>}
            {waHref && <ContactLine icon={MessageCircle} href={waHref}>WhatsApp</ContactLine>}
            {enquiryMailto && <ContactLine icon={Mail} href={enquiryMailto}>{org?.email}</ContactLine>}
          </div>
        )}
      </div>
    </DetailCard>
  )

  return (
    <PublicThemeProvider>
      <ApplyChromeProvider initial={true}>
        <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: "var(--paper)", color: "var(--ink)" }}>
          <div className="pointer-events-none fixed inset-0 overflow-hidden"><FocusBackdrop /></div>
          <div className="relative z-10 flex h-full flex-col">
            <header className="shrink-0 border-b border-[var(--rule)] bg-[var(--paper-raised)]">
              <div className="mx-auto flex max-w-[1280px] items-center px-6 py-3">
                <div className="flex shrink-0 items-center gap-3 lg:w-[300px]">
                  <Wordmark style={{ fontSize: 19 }} />
                  <span className="h-4 w-px shrink-0 bg-[var(--rule)]" />
                  <span className="hidden shrink-0 sm:inline"><Eyebrow>Rental application</Eyebrow></span>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:ml-4">
                  <ApplyUnitStrip title={stripTitle} detail={rentStr ? `${rentStr}/mo · available ${availStr}` : `available ${availStr}`} />
                  <div className="flex shrink-0 items-center gap-3 sm:gap-4">
                    <span className="hidden items-center gap-1.5 text-[var(--ink-mute)] sm:flex"><ShieldCheck className="size-3.5" /><Eyebrow>Encrypted</Eyebrow></span>
                    <ApplyThemeToggle />
                  </div>
                </div>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start">
                <div className="flex shrink-0 flex-col gap-4 lg:w-[300px]">{agentCard}</div>
                <div className="min-w-0 flex-1">
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
                </div>
              </div>
            </div>
          </div>
        </div>
      </ApplyChromeProvider>
    </PublicThemeProvider>
  )
}
