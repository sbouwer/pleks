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
 * ── DOCTRINE: neutral-decline (application declines — discrimination-exposure mitigation) ──
 *   application.declined_stage1 / declined_stage2 and the blocked-screening path are NEUTRAL
 *   "application update" notices — they state NO reason in the subject or body; the dashboard is
 *   canonical for any detail. This is the FitScore-shows-all-applicants mitigation. A fold or copy
 *   edit must NEVER flatten a decline into a reason-stating email.
 *   • EXTENSION (70H F1, legal pass): declines carry NO unstructured/free-text reason in the body.
 *     The live {{reason}} agent free-text is DROPPED on fold — a decline cannot let an agent type a
 *     discriminatory or NCA-adverse-action ground into an applicant-facing notice; the applicant is
 *     directed to the agency. Free-text reasons can't be made safe by an R3 gate on a decline.
 *
 * ── DOCTRINE: FitScore-dynamic emails are CODE-RENDERED, not seed-folded (14H §10.7 parity) ──
 *   application.screening_complete (3-way blocked/limited-data/standard branch + band-dependent
 *   subject + observedStrengths/observedConcerns/limitedVisibility arrays) and
 *   application.credit_report_delivered (NCA / POPIA special-info) stay registered + code-rendered.
 *   The seed block model (one binary cpaConditional + 3 flavours) cannot express their logic without
 *   flattening it — they are FitScore surfaces governed by the 14H web/PDF parity doctrine. Do NOT fold.
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
import { ARREARS_LADDER_SEEDS } from "./arrears-ladder"
import { APPLICATION_SEEDS } from "./applications"

export const SYSTEM_TEMPLATE_SEEDS: TemplateSeed[] = [
  ...STATUTORY_SEEDS,
  ...CORRESPONDENCE_SEEDS,
  ...INFO_REQUEST_SEEDS,
  ...SERVICE_SEEDS,
  ...SUBSCRIPTION_SEEDS,
  ...CHANNEL_SEEDS,
  ...ARREARS_LADDER_SEEDS,
  ...APPLICATION_SEEDS,
]

export type { TemplateSeed }
