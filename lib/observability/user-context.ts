/**
 * lib/observability/user-context.ts — Attach non-PII user identifiers to Sentry events
 *
 * Notes: Only UUIDs and role strings — no names, emails, or other PII.
 *        Called from session helpers so every error is attributed to the right
 *        org/role without any identifying information leaving the platform.
 */
import * as Sentry from "@sentry/nextjs"

interface SentryUserContext {
  id: string        // Supabase user UUID or internal entity UUID — never email/name
  org_id?: string
  role?: string
  scope_id?: string // landlord_id / tenant_id / contractor_id
}

export function setSentryUser({ id, org_id, role, scope_id }: SentryUserContext) {
  Sentry.setUser({ id })
  if (org_id) Sentry.setTag("org_id", org_id)
  if (role) Sentry.setTag("role", role)
  if (scope_id) Sentry.setTag("scope_id", scope_id)
}

export function clearSentryUser() {
  Sentry.setUser(null)
}
