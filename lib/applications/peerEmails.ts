/**
 * lib/applications/peerEmails.ts — joint-application fan-out emails (ADDENDUM_14R Phase 4).
 *
 * Two events email EVERY applicant on a joint application: (1) all-green — everyone's finished, ready to submit;
 * (2) submitted to the agent. Each recipient's link carries THEIR OWN credential (the lead's app token / a co's
 * access token) — never one peer's token in another's email. The org/listing context is fetched by application id
 * (same joins as submissionEmails). Sends are best-effort (void), like the existing submission notifications.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { sendApplicationReadyToSubmit, sendApplicationSubmittedToAgent, type ListingSummary, type OrgContext } from "./emails"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { APP_URL } from "@/lib/env"

export interface PeerRecipient { email: string; name: string; kind: "lead" | "co"; coToken?: string | null }

/** The lead's resume link (their app token) / a co's invite link (their access token) — the recipient's OWN door. */
export function applyLink(r: PeerRecipient, slug: string, applicationId: string, leadToken: string | null): string {
  if (r.kind === "co" && r.coToken) return `${APP_URL}/apply/co-applicant/${r.coToken}`
  return leadToken ? `${APP_URL}/apply/${slug}?app=${applicationId}&token=${encodeURIComponent(leadToken)}` : `${APP_URL}/apply/${slug}`
}

/** The recipient's OWN view-only review link (the /apply/review/[token] route, gated by their own credential). */
export function reviewLink(r: PeerRecipient, leadToken: string | null): string {
  const cred = r.kind === "co" ? r.coToken : leadToken
  return `${APP_URL}/apply/review/${cred ?? ""}`
}

interface PeerFanout { recipients: PeerRecipient[]; slug: string; leadToken: string | null; org: OrgContext; listing: ListingSummary }

/** Resolve every applicant + their credential + the org/listing context for a fan-out. null if the app is gone. */
async function resolveFanout(service: SupabaseClient, applicationId: string): Promise<PeerFanout | null> {
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("org_id, applicant_email, first_name, last_name, listings(id, public_slug, asking_rent_cents, available_from, units(unit_number, properties(name, city)))")
    .eq("id", applicationId).maybeSingle()
  logQueryError("peerEmails app", appErr)
  if (!app) return null
  const orgId = app.org_id as string
  const listingRow = app.listings as unknown as { id?: string; public_slug?: string | null; asking_rent_cents?: number | null; available_from?: string | null; units?: { unit_number?: string | null; properties?: { name?: string | null; city?: string | null } | null } | null } | null
  const unit = listingRow?.units ?? null
  const property = unit?.properties ?? null

  const { data: org, error: orgErr } = await service.from("organisations").select("name, email, phone").eq("id", orgId).maybeSingle()
  logQueryError("peerEmails org", orgErr)
  const branding = buildBranding(await fetchOrgSettings(orgId))

  const { data: leadTokenRow, error: ltErr } = await service.from("application_tokens").select("token")
    .eq("application_id", applicationId).gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("peerEmails lead token", ltErr)
  const { data: cos, error: cosErr } = await service.from("application_co_applicants")
    .select("applicant_email, first_name, last_name, access_token").eq("primary_application_id", applicationId).is("declined_at", null)
  logQueryError("peerEmails cos", cosErr)

  const recipients: PeerRecipient[] = []
  const leadEmail = app.applicant_email as string | null
  if (leadEmail) recipients.push({ email: leadEmail, name: [app.first_name, app.last_name].filter(Boolean).join(" ") || "Applicant", kind: "lead" })
  for (const c of cos ?? []) {
    const e = c.applicant_email as string | null
    if (e) recipients.push({ email: e, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Applicant", kind: "co", coToken: c.access_token as string | null })
  }

  return {
    recipients, slug: (listingRow?.public_slug as string) ?? "", leadToken: (leadTokenRow?.token as string | null) ?? null,
    org: { orgId, orgName: org?.name ?? "Pleks", orgEmail: org?.email as string | undefined, orgPhone: org?.phone as string | undefined, branding },
    listing: {
      id: (listingRow?.id as string) ?? applicationId,
      unitLabel: (unit?.unit_number as string) ?? "the unit", propertyName: (property?.name as string) ?? "the property",
      city: property?.city as string | undefined, askingRentCents: (listingRow?.asking_rent_cents as number) ?? 0,
      availableFrom: listingRow?.available_from as string | undefined,
    },
  }
}

/** Email every applicant: the application is complete and ready to submit (14R all-green). Best-effort. */
export async function notifyAllReadyToSubmit(service: SupabaseClient, applicationId: string): Promise<void> {
  const f = await resolveFanout(service, applicationId)
  if (!f) return
  for (const r of f.recipients) {
    void sendApplicationReadyToSubmit({ email: r.email, name: r.name }, f.listing, f.org, { applyUrl: applyLink(r, f.slug, applicationId, f.leadToken), applicationId })
  }
}

/** Email every applicant: the application has been submitted to the agent, with their own view-only link. */
export async function notifyAllSubmitted(service: SupabaseClient, applicationId: string): Promise<void> {
  const f = await resolveFanout(service, applicationId)
  if (!f) return
  for (const r of f.recipients) {
    void sendApplicationSubmittedToAgent({ email: r.email, name: r.name }, f.listing, f.org, { reviewUrl: reviewLink(r, f.leadToken), applicationId })
  }
}
