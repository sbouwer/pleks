/**
 * lib/applications/applicationCredential.ts — the ONE application-credential check (ADDENDUM_14R §10 #6 + auth amendment).
 *
 * Resolving "who is this caller, and which application?" was duplicated across ≥4 routes (/submit, /submit-to-agent,
 * the co save route, /screen), each slightly different. This is the single authority. THREE credential classes:
 *   1. an authenticated SESSION (authUserId) — the STRONGEST, post-account (14R auth amendment): the logged-in
 *      applicant owns the application as lead (applications.tenant_id) or co (application_co_applicants.tenant_id),
 *      both → tenants.auth_user_id. Checked FIRST.
 *   2. the lead's application_tokens token — the pre-account FILL-phase credential.
 *   3. a co's application_co_applicants.access_token — the co's pre-account FILL-phase credential.
 * Baked in ONCE, here:
 *   • the IDOR guard — when the caller names an application (`applicationId`), the credential MUST belong to it,
 *     so one applicant can't act on another's application;
 *   • the expiry check — lead tokens via expires_at, co tokens via access_token_expires (null = no expiry).
 *
 * A valid credential here IS the proof of identity (a session is authenticated; a token was emailed to that address
 * — equivalent to what an OTP proves). Callers never trust an unvalidated token/session.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { ApplicantRef } from "./applicantAdapter"
import { logQueryError } from "@/lib/supabase/logQueryError"

export interface AppCredential { applicationId: string; subjectRef: ApplicantRef }

export async function resolveApplicationCredential(
  service: SupabaseClient,
  opts: Readonly<{ applicationId?: string; token?: string | null; ct?: string | null; authUserId?: string | null }>,
): Promise<AppCredential | null> {
  const now = new Date().toISOString()

  // Authenticated session — the strongest credential (post-account). The logged-in applicant owns the application
  // as lead or co, both resolved via tenants.auth_user_id. (The co arm uses application_co_applicants.tenant_id,
  // added in §41; inert until the migration + account-at-completion land.)
  if (opts.authUserId && opts.applicationId) {
    const { data: tens, error: tenErr } = await service.from("tenants").select("id").eq("auth_user_id", opts.authUserId)
    logQueryError("resolveApplicationCredential session tenants", tenErr)
    const tenantIds = (tens ?? []).map((t) => t.id as string)
    if (tenantIds.length > 0) {
      const { data: lead, error: leadErr } = await service.from("applications").select("id").eq("id", opts.applicationId).in("tenant_id", tenantIds).maybeSingle()
      logQueryError("resolveApplicationCredential session lead", leadErr)
      if (lead) return { applicationId: opts.applicationId, subjectRef: "primary" }
      const { data: co, error: coErr } = await service.from("application_co_applicants").select("id").eq("primary_application_id", opts.applicationId).in("tenant_id", tenantIds).maybeSingle()
      logQueryError("resolveApplicationCredential session co", coErr)
      if (co) return { applicationId: opts.applicationId, subjectRef: `co_${co.id}` }
    }
  }

  // Lead — application_tokens (always carries an expiry).
  if (opts.token) {
    let q = service.from("application_tokens").select("application_id").eq("token", opts.token).gt("expires_at", now)
    if (opts.applicationId) q = q.eq("application_id", opts.applicationId) // IDOR guard
    const { data, error } = await q.maybeSingle()
    logQueryError("resolveApplicationCredential lead", error)
    if (data) return { applicationId: data.application_id as string, subjectRef: "primary" }
  }

  // Co — application_co_applicants.access_token (expiry is JS-checked: null access_token_expires = no expiry).
  if (opts.ct) {
    let q = service.from("application_co_applicants").select("id, primary_application_id, access_token_expires").eq("access_token", opts.ct).is("declined_at", null)
    if (opts.applicationId) q = q.eq("primary_application_id", opts.applicationId) // IDOR guard
    const { data, error } = await q.maybeSingle()
    logQueryError("resolveApplicationCredential co", error)
    if (data) {
      const exp = data.access_token_expires as string | null
      if (!exp || new Date(exp) >= new Date()) return { applicationId: data.primary_application_id as string, subjectRef: `co_${data.id}` }
    }
  }

  return null
}
