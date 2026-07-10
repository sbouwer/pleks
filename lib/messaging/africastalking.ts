/**
 * lib/messaging/africastalking.ts — the Africa's Talking environment guard
 *
 * Notes:  AT_USERNAME doubles as an ENVIRONMENT SELECTOR: the literal username "sandbox" routes every send
 *         to api.sandbox.africastalking.com (see sendSMS + whatsapp/provider). A sandbox send returns 200
 *         and delivers nothing. That is a fail-OPEN: sendSMS would write a communication_log row with
 *         status='sent', the mandatory-comm cascade would stop retrying, and a legally-required notice
 *         would be recorded as served without ever leaving the building — the same shape as the H-1
 *         stamped-but-never-sent bug and the deemed-service floor bug.
 *
 *         An unconfigured AT (the state today — AT_USERNAME unset) fails CLOSED and is safe. Sandbox
 *         credentials in production are strictly worse than no credentials. This module refuses them.
 *
 *         Takes the RESOLVED username + sandbox flag rather than re-reading env, because the callers do not
 *         agree on how to resolve them: whatsapp/provider prefers WA_USERNAME over AT_USERNAME but derives
 *         its sandbox flag from AT_USERNAME/WA_SANDBOX, so a live WA_USERNAME can pair with a sandbox host.
 */
import * as Sentry from "@sentry/nextjs"
import { isProductionRuntime } from "@/lib/env"

/** The AT account username that selects the sandbox host. Not a placeholder — a real AT account name. */
export const AT_SANDBOX_USERNAME = "sandbox"

/** True only on Vercel production. The gate now lives in lib/env; re-exported here for existing callers. */
export { isProductionRuntime }

export type AtEnvironmentCheck = { ok: true } | { ok: false; reason: string }

/**
 * Refuse a sandbox-backed send in production.
 *
 * @param username the RESOLVED account username the send will authenticate with
 * @param sandbox  whether the caller will target the sandbox host
 */
export function checkAtEnvironment(username: string, sandbox: boolean): AtEnvironmentCheck {
  if (!isProductionRuntime()) return { ok: true }
  if (!sandbox && username !== AT_SANDBOX_USERNAME) return { ok: true }

  // Loud, not silent: this is a misconfiguration that would otherwise present as a successful send.
  Sentry.captureMessage("Africa's Talking sandbox credentials in production — send refused", {
    level: "error",
    tags: { area: "comms", kind: "at_sandbox_in_production" },
    extra: { username, sandbox },
  })
  console.error("[africastalking] refusing to send: sandbox credentials in production")
  return { ok: false, reason: "sandbox_credentials_in_production" }
}
