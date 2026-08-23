/**
 * lib/subscriptions/purgeWarningGate.ts — M-074 purge-warning delivery gate (ADDENDUM_57G §11.3)
 *
 * Auth:   service-role only (called from the subscription-purge-warnings cron).
 * Data:   reads communication_log for the 30-day warning; writes nothing here.
 * Notes:  Counsel ruling 2026-08-20 let the Day-0 cancellation notice state a MINIMUM RETENTION
 *         PERIOD instead of a deletion date, "provided the surrounding lifecycle actually delivers
 *         the eventual date". The 30-day warning IS that delivery, so it is a condition of the
 *         Day-0 disclosure being sufficient — not a courtesy send. Purging an org that never
 *         received it retroactively makes the notice it DID receive insufficient.
 *
 *         Gating on the mere EXISTENCE of a communication_log row would not do. logToDb writes a
 *         row on both outcomes ("Log to communication_log (always — even on failure)",
 *         lib/comms/send-email.ts) with a status column carrying sent|failed, later revised by the
 *         Resend webhook to delivered|opened|bounced|unsubscribed. Row-existence therefore proves
 *         an ATTEMPT, exactly the naming trap M-074 is filed under. The status is the signal.
 *
 *         The bar is "no evidence it failed", not "proof it arrived". Requiring `delivered` would
 *         hang forever anywhere the Resend webhook is not wired, and indefinite retention is ALSO
 *         a POPIA s14 failure — the opposite direction, equally real. "We never purged it because
 *         we could not warn them" is not a defence. That symmetry is why every deferral must
 *         surface to a human rather than fail closed and go quiet.
 */

/** Statuses that establish the warning left Pleks with no evidence of failure. */
const DELIVERY_ESTABLISHED = new Set(["sent", "delivered", "opened", "unsubscribed"])

/** Statuses that affirmatively establish the warning did NOT arrive. */
const DELIVERY_FAILED = new Set(["failed", "bounced"])

/**
 * Why a purge was held back. Each maps to a DIFFERENT human action, which is the whole point of
 * keeping them apart — "find this org a contact" and "investigate why mail is failing" are not the
 * same job, and collapsing them is the defect M-074 records at the call site.
 */
export type PurgeDeferralReason =
  | "no_contact"         // nothing was ever sent: the org has no resolvable admin. Find a contact.
  | "no_warning_logged"  // a contact exists but no warning was logged. Investigate the 30d step.
  | "send_failed"        // logged and affirmatively failed or bounced. Investigate delivery.
  | "not_delivered"      // logged with a status this gate does not recognise. Never purge on a status we cannot read.

export type PurgeWarningGateResult =
  | { ok: true; status: string }
  | { ok: false; reason: PurgeDeferralReason }

/**
 * The decision, as a pure function so all four directions M-074 asks for are probeable without a
 * database: warning delivered -> PROCEED; absent -> DEFER; and the no-contact deferral distinct
 * from the send-failure deferral.
 *
 * `warning` is the most recent communication_log row for the 30-day warning, or null if there is
 * none. `hasContact` says whether an admin contact is resolvable for the org TODAY — it only
 * disambiguates the null case, and is deliberately not consulted otherwise: a logged send proves a
 * contact existed at the time, whatever the org looks like now.
 */
export function classifyPurgeWarning(
  warning: { status: string | null } | null,
  hasContact: boolean,
): PurgeWarningGateResult {
  if (!warning) {
    return { ok: false, reason: hasContact ? "no_warning_logged" : "no_contact" }
  }
  const status = warning.status ?? ""
  if (DELIVERY_ESTABLISHED.has(status)) return { ok: true, status }
  if (DELIVERY_FAILED.has(status)) return { ok: false, reason: "send_failed" }
  return { ok: false, reason: "not_delivered" }
}
