/**
 * lib/auth/email-policy.ts — identity policy enforcement for I-4 and I-5
 *
 * Notes:  I-5: agent-class signups require an organisation-controlled email domain.
 *         I-4: assertEmailAvailableForRole() enforces one-email-one-active-role.
 *         The function name is isPersonalEmailDomain(), never isBusinessEmail() — we
 *         assert namespace separability, not legitimacy (§1.3 doctrine).
 */
import { createServiceClient } from "@/lib/supabase/server"
import { resolveUserMembership } from "./membership"
import type { PortalClass } from "./membership"

// ── Blocklist ─────────────────────────────────────────────────────────────────
// Hand-maintained; reviewed quarterly. Global majors + SA legacy/ISP webmail +
// common disposable providers. See §1.3 doctrine: admission is not a trust signal.

export const PERSONAL_EMAIL_DOMAINS = new Set([
  // Global majors
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.co.za", "ymail.com", "rocketmail.com",
  "outlook.com", "hotmail.com", "hotmail.co.uk", "hotmail.co.za",
  "live.com", "live.co.uk", "live.co.za", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "protonmail.com", "proton.me", "pm.me",
  "aol.com", "aol.co.uk",
  "gmx.com", "gmx.net", "gmx.co.uk",
  "mail.com", "inbox.com",
  "fastmail.com", "fastmail.fm",
  "zoho.com",
  // SA legacy / ISP webmail
  "mweb.co.za", "mweb.com", "vodamail.co.za", "telkomsa.net", "iafrica.com",
  "webmail.co.za", "absamail.co.za", "fnb.co.za",
  "tiscali.co.za", "global.co.za", "cybersmart.co.za",
  // Disposable / throwaway providers
  "tempmail.com", "10minutemail.com", "mailinator.com", "guerrillamail.com",
  "throwaway.email", "yopmail.com", "maildrop.cc", "sharklasers.com",
  "guerrillamailblock.com", "grr.la", "guerrillamail.info",
  "dispostable.com", "mailnull.com", "spamgourmet.com", "trashmail.com",
  "trashmail.me", "trashmail.net", "getairmail.com", "mailnesia.com",
  "spamfree24.org", "tempr.email", "discard.email",
])

/** Returns true when the email's domain is a known personal-email provider. */
export function isPersonalEmailDomain(email: string): boolean {
  const parts = email.toLowerCase().split("@")
  const domain = parts[1]
  if (!domain) return false
  return PERSONAL_EMAIL_DOMAINS.has(domain)
}

/**
 * Returns true when the portal class requires an organisation-controlled email.
 * Currently only agent class — tenants, landlords, and suppliers may use personal emails.
 */
export function requiresOrgDomain(portalClass: PortalClass): boolean {
  return portalClass === "agent"
}

// ── assertEmailAvailableForRole ───────────────────────────────────────────────

type AssertResult =
  | { available: true }
  | { available: false; reason: "personal_email_blocked_for_agent" }
  | { available: false; reason: "in_use_elsewhere"; existingClass: PortalClass; existingOrgName: string }

/**
 * Checks whether an email address is available for use in a new membership of the
 * given portal class. Returns an availability result — never throws on policy failures.
 *
 * Called from: createAccountAndOrg (signup), invite acceptance, admin provisioning.
 */
export async function assertEmailAvailableForRole(
  email: string,
  targetRoleClass: PortalClass,
): Promise<AssertResult> {
  // I-5: agent class requires org-domain email
  if (targetRoleClass === "agent" && isPersonalEmailDomain(email)) {
    return { available: false, reason: "personal_email_blocked_for_agent" }
  }

  // I-4: check whether email already has an active membership
  const service = await createServiceClient()
  const { data: users } = await service.auth.admin.listUsers({ perPage: 1000, page: 1 })
  const existingUser = users?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )
  if (!existingUser) return { available: true }

  let membership
  try {
    membership = await resolveUserMembership(existingUser.id)
  } catch {
    // SovereignMembershipViolation — treat as in_use_elsewhere (already broken)
    return {
      available: false,
      reason: "in_use_elsewhere",
      existingClass: "agent",
      existingOrgName: "another organisation",
    }
  }

  if (!membership) return { available: true } // user exists but has no active membership

  return {
    available: false,
    reason: "in_use_elsewhere",
    existingClass: membership.portalClass,
    existingOrgName: membership.orgName,
  }
}
