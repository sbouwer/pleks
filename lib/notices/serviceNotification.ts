/**
 * lib/notices/serviceNotification.ts — SMS/WhatsApp "notification of service" micro-template (R-4)
 *
 * Notes:  R-4 per-channel payload classes: email carries the FULL Demand-to-Vacate; SMS/WhatsApp carry
 *         only this short notification-of-service pointer (the full legal text is unsuited to 160-char /
 *         template channels, and a truncated legal notice is worse than a pointer). This wording is itself
 *         legal-adjacent, so it is VERSIONED and mirrored by a document_templates row
 *         (template_key='notice.service_notification', 'draft' until counsel Part F sign-off — 011 §26).
 *         The code twin here is the render source; the row is the gate + review anchor (same twin pattern
 *         as the application seed). Bump SERVICE_NOTIFICATION_VERSION and the row together on any change.
 */

/** Version of the micro-template copy below. Mirrors document_templates.version for the row. */
// v2 (CD Phase D walk): "sent", not "delivered" — this SMS is written at DISPATCH, before any delivery
// confirmation exists, so "delivered" could contradict the notice's own service log on a later bounce.
// "sent" is accurate at the moment it is uttered.
export const SERVICE_NOTIFICATION_VERSION = 2

/** The short, channel-agnostic notification-of-service body (SMS + WhatsApp). Deliberately names no
 *  statutory consequence — it is a pointer to the full notice sent to the nominated address(es). */
export function renderServiceNotificationSms(): string {
  return (
    "A legal notice regarding your tenancy has been sent to your nominated address(es). " +
    "Please check your email and postal address for the full notice, which contains important dates."
  )
}
