/**
 * lib/leases/portalInviteLink.ts — generate the right portal hand-off link for an activating tenant (BUILD_69 P2)
 *
 * Data:   no DB — wraps a Supabase admin.generateLink fn; pure routing logic, unit-testable with a mock.
 * Notes:  Component A's correctness fix. An applicant is token-tracked, NOT an auth user (BUILD_69 §A), so the
 *         common case has no login → `invite` mints one. The EDGE — they already have an auth login (applied
 *         elsewhere / prior credentials) — is the latent bug: `generateLink({type:"invite"})` ERRORS on an
 *         already-registered email, so the old code recorded the step `failed` and sent NO hand-off at all.
 *         Fix is error-driven (robust, no pre-check race / honeytoken false-positive): try invite, and on the
 *         already-registered error fall back to a magic-link — an existing user is *upgraded* into the portal,
 *         not re-invited. Whichever succeeds returns its action link + the mode (for copy/telemetry).
 */

export interface GenerateLinkResult {
  data: { properties: { action_link: string } } | null
  error: { message: string; code?: string; status?: number } | null
}

export type GenerateLinkFn = (args: {
  type: "invite" | "magiclink"
  email: string
  options?: { data?: Record<string, unknown>; redirectTo?: string }
}) => Promise<GenerateLinkResult>

export interface PortalInviteLinkOpts {
  email: string
  data: Record<string, unknown>
  redirectTo: string
}

export type PortalInviteLink =
  | { actionLink: string; mode: "invite" | "magiclink" }
  | { error: string }

/** True when a generateLink error means the email already has an auth user (so `invite` is the wrong verb). */
export function isEmailAlreadyRegistered(error: GenerateLinkResult["error"]): boolean {
  if (!error) return false
  if (error.code === "email_exists") return true
  const msg = (error.message ?? "").toLowerCase()
  return msg.includes("already been registered") || msg.includes("already registered") || msg.includes("already exists")
}

/**
 * Mint the portal hand-off link: `invite` for a net-new tenant; on an already-registered email, fall back to a
 * `magiclink` (the upgrade path). Returns the link + which path was taken, or an error to surface on the step.
 */
export async function generatePortalInviteLink(
  generate: GenerateLinkFn,
  opts: PortalInviteLinkOpts,
): Promise<PortalInviteLink> {
  const options = { data: opts.data, redirectTo: opts.redirectTo }

  const invite = await generate({ type: "invite", email: opts.email, options })
  if (!invite.error && invite.data) return { actionLink: invite.data.properties.action_link, mode: "invite" }

  if (isEmailAlreadyRegistered(invite.error)) {
    const magic = await generate({ type: "magiclink", email: opts.email, options })
    if (!magic.error && magic.data) return { actionLink: magic.data.properties.action_link, mode: "magiclink" }
    return { error: magic.error?.message ?? "magic-link generation failed" }
  }

  return { error: invite.error?.message ?? "invite generation failed" }
}
