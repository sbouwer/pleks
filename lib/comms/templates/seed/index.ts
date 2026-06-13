/**
 * lib/comms/templates/seed/index.ts — the centralized template seed source (ADDENDUM_70E E3)
 *
 * Data:   SYSTEM_TEMPLATE_SEEDS — every external comm, corrected (70B F-1) + standardized (70F),
 *         as typed blocks. The generator (scripts/gen-template-seed.mts) is the ONLY consumer that
 *         emits both the CD review doc and the seed SQL. NOT seeded to the DB until CD's review pass.
 * Notes:  Once the document_templates store is seeded (E3), this module becomes the seed/migration
 *         input — the store, not this, is then SSOT.
 *
 * ── DOCTRINE: POPIA-footer placement (70F §3‡ — state it so it isn't "fixed" by a later edit) ──
 *   • correspondence + data-collection (info-requests) → carry the POPIA data-rights line ({popiaSlot}).
 *   • service (rent.* / subscription.* account-state / feedback.* / WhatsApp / SMS) → NO POPIA footer.
 *   • locked legal templates (popia.* lifecycle, subscription cancellation T1–T6) → substitute their
 *     OWN Information-Regulator / retention language in-body; NO popiaSlot. POPIA's collection-notice
 *     duty (s18) + privacy policy are met at the data-collection points, not on every operational email.
 *   • statutory → never a POPIA footer (adversarial; would offer a right declined under litigation-hold).
 *
 * ── CANONICAL MERGE VOCABULARY (the seeding gate — prove against merge context OR keep normalised) ──
 *   Org name (ALL channels): {{branding.orgName}} (+ {{branding.orgPhone}} / {{branding.orgEmail}}).
 *     {{agencyName}} / {{orgName}} are RETIRED — normalised to {{branding.orgName}}.
 *   Email/letter recipient: {{recipient.salutation}} + {{recipient.legal_name}} + {{recipient.address}}
 *     (resolveRecipient SSOT, 70F §9). Agent sign-off: {{senderName}}.
 *   SMS: {{firstName}} + {{senderName}} (normalised — {{name}}/{{sender}}/{{tenantFirstName}} retired).
 *   WhatsApp: dotted Meta/send.ts tokens ({{tenant.primary_contact_name}}, {{lease.rent_amount}},
 *     {{unit.number}}, {{property.name}}, {{lease.end_date}}, {{agent.name}}) — these are the PROVEN
 *     wired context (lib/messaging/whatsapp/send.ts + Meta templates); intentionally NOT unified onto
 *     {{recipient.*}}. Each channel's vocabulary must be proven against its merge context before seeding.
 */

import type { TemplateSeed } from "./types"
import { STATUTORY_SEEDS } from "./statutory"
import { CORRESPONDENCE_SEEDS } from "./correspondence"
import { INFO_REQUEST_SEEDS } from "./info-requests"
import { SERVICE_SEEDS } from "./service"
import { SUBSCRIPTION_SEEDS } from "./subscriptions"
import { CHANNEL_SEEDS } from "./channels"

export const SYSTEM_TEMPLATE_SEEDS: TemplateSeed[] = [
  ...STATUTORY_SEEDS,
  ...CORRESPONDENCE_SEEDS,
  ...INFO_REQUEST_SEEDS,
  ...SERVICE_SEEDS,
  ...SUBSCRIPTION_SEEDS,
  ...CHANNEL_SEEDS,
]

export type { TemplateSeed }
