/**
 * lib/comms/templates/seed/applications.ts — application-family seeds (ADDENDUM_70E E3 / 70H legal pass)
 *
 * Data:   the 9 RESIDENTIAL static-prose application emails, transcribed from live production
 *         (lib/applications/emails.tsx) and run through the 70H neutral-decline legal pass.
 * Notes:  Legal-pass resolutions applied:
 *           F1 (BLOCKING) — declines (declined_stage1/2) carry NO {{reason}} free-text; neutral
 *             else-text only + "contact the agency"; commsClass correspondence + locked:true.
 *           F4 — shortlisted screening-consent chain (Searchworx / POPIA consent / R399) verbatim.
 *           F5 — canonical tokens ({{recipient.salutation}}, {{branding.orgName}}); no "via Pleks".
 *           F6 — agent_notify + review_reminder = service (no popiaSlot); review_reminder pending
 *             list → callout placeholder.
 *         ⚠ F3 (must reconcile before seed): declines state "12 months" applicant-data retention —
 *           this contradicts the 90-day rejected-applicant purge intent + hardcodes a figure.
 *           Tokenise ({{applicantRetentionPeriod}}) or confirm vs the POPIA register before seeding.
 *         HELD (NOT folded here): the 6 director templates (70H F2 — folding normalises them onto
 *           EmailLayout = a visible brand change to surety directors; pending Stéan's sign-off).
 *         NOT folded (code-rendered, 14H §10.7): screening_complete, credit_report_delivered.
 *         NOT seeded.
 */

import type { TemplateSeed } from "./types"

export const APPLICATION_SEEDS: TemplateSeed[] = [
  {
    key: "application.received",
    channel: "email",
    commsClass: "correspondence",
    name: "Application Received",
    description: "Applicant confirmation that their rental application was received.",
    category: "applications",
    subject: "Application received — {{unitLabel}}, {{propertyName}}",
    mergeFields: ["{{recipient.salutation}}", "{{unitLabel}}", "{{propertyName}}", "{{applicationRef}}", "{{firstName}}", "{{lastName}}", "{{rentDisplay}}", "{{statusUrl}}", "{{branding.orgName}}"],
    legalReviewRef: "ADDENDUM_70H A1 (live: emails.tsx:71)",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "Thank you for applying for **{{unitLabel}}** at {{propertyName}}. Your application reference is {{applicationRef}}." },
      { type: "heading", text: "What you applied for" },
      { type: "dataBox", rows: [
        { label: "Property", value: "{{unitLabel}} — {{propertyName}}" },
        { label: "Rent", value: "{{rentDisplay}}/month" },
      ] },
      { type: "heading", text: "What happens next" },
      { type: "paragraph", text: "Your application will be reviewed within 48 hours. You'll receive an email when a decision has been made." },
      { type: "cta", label: "Check your application status", href: "{{statusUrl}}" },
      { type: "popiaSlot" },
    ],
  },
  {
    key: "application.agent_notify",
    channel: "email",
    commsClass: "service",
    name: "New Application (Agent Notification)",
    description: "Internal notification to the agent of a new application (service-class digest).",
    category: "applications",
    subject: "New application — {{firstName}} {{lastName}} for {{unitLabel}}, {{propertyName}}",
    mergeFields: ["{{firstName}}", "{{lastName}}", "{{unitLabel}}", "{{propertyName}}", "{{applicantEmail}}", "{{reviewUrl}}", "{{applicationsCount}}"],
    legalReviewRef: "ADDENDUM_70H A2 (live: emails.tsx:117)",
    body: [
      { type: "paragraph", text: "New application received for **{{unitLabel}}** at {{propertyName}}." },
      { type: "dataBox", rows: [
        { label: "Name", value: "{{firstName}} {{lastName}}" },
        { label: "Email", value: "{{applicantEmail}}" },
      ] },
      { type: "callout", tone: "info", text: "The full applicant detail — employment, income, pre-screen score, rent-to-income, documents, and any bank-statement highlights — renders here per application." },
      { type: "cta", label: "Review application", href: "{{reviewUrl}}" },
      { type: "paragraph", text: "You now have {{applicationsCount}} application(s) for this listing." },
    ],
  },
  {
    key: "application.review_reminder",
    channel: "email",
    commsClass: "service",
    name: "Application Review Reminder",
    description: "Cron reminder to the agent of applications awaiting review (service-class digest).",
    category: "applications",
    subject: "Reminder: {{pendingCount}} application(s) awaiting review",
    mergeFields: ["{{pendingCount}}", "{{applicationsUrl}}"],
    legalReviewRef: "ADDENDUM_70H A3 (live: emails.tsx:163)",
    body: [
      { type: "paragraph", text: "You have {{pendingCount}} application(s) awaiting your review:" },
      { type: "callout", tone: "info", text: "Each pending application — name · listing · score/45 · applied date — renders here per reminder." },
      { type: "cta", label: "Review applications", href: "{{applicationsUrl}}" },
      { type: "paragraph", text: "Timely reviews help you secure the best tenants." },
    ],
  },
  {
    key: "application.shortlisted",
    channel: "email",
    commsClass: "correspondence",
    name: "Application Shortlisted",
    description: "Applicant shortlisted — next step is screening consent + fee. Screening-consent chain (F4, verbatim).",
    category: "applications",
    subject: "Great news — you've been shortlisted for {{unitLabel}}, {{propertyName}}",
    mergeFields: ["{{recipient.salutation}}", "{{unitLabel}}", "{{propertyName}}", "{{branding.orgName}}", "{{inviteUrl}}", "{{orgPhone}}", "{{orgEmail}}"],
    legalReviewRef: "ADDENDUM_70H A4 (live: emails.tsx:192) — F4 consent chain",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "Great news — your application for **{{unitLabel}}** at {{propertyName}} has been shortlisted." },
      { type: "heading", text: "Next step: Tenant screening" },
      { type: "paragraph", text: "To complete your application we need to run a credit and background check. This requires:" },
      { type: "list", ordered: true, items: [
        "Your consent (POPIA requirement)",
        "A screening fee of R399",
      ] },
      { type: "paragraph", text: "The screening is conducted by Searchworx, an independent credit bureau. Results are shared with {{branding.orgName}} only." },
      { type: "cta", label: "Continue to screening", href: "{{inviteUrl}}" },
      { type: "paragraph", text: "This link expires in 7 days." },
      { type: "popiaSlot" },
    ],
  },
  {
    key: "application.declined_stage1",
    channel: "email",
    commsClass: "correspondence",
    locked: true,
    name: "Application Update — Stage 1 Decline",
    description: "Neutral Stage-1 decline. NEUTRAL-DECLINE doctrine: no reason in subject or body (F1 — {{reason}} dropped).",
    category: "applications",
    subject: "Application update — {{unitLabel}}, {{propertyName}}",
    mergeFields: ["{{recipient.salutation}}", "{{unitLabel}}", "{{propertyName}}", "{{branding.orgName}}", "{{orgEmail}}"],
    legalReviewRef: "ADDENDUM_70H A5 (live: emails.tsx:226) — F1 reason dropped · ⚠ F3 retention",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "Thank you for your application for **{{unitLabel}}** at {{propertyName}}." },
      { type: "paragraph", text: "After careful consideration, we have decided not to proceed with your application at this time." },
      { type: "paragraph", text: "This decision does not reflect on you personally — the agent received multiple applications and had to make a selection. If you have any questions, please contact {{branding.orgName}}." },
      { type: "heading", text: "Your data" },
      // ⚠ F3: "12 months" is a hardcoded retention figure that contradicts the 90-day rejected-applicant purge intent. Reconcile vs the POPIA register (tokenise) BEFORE seeding.
      { type: "paragraph", text: "Your personal information will be retained for 12 months in accordance with POPIA. To request earlier deletion, contact {{branding.orgName}} at {{orgEmail}}." },
      { type: "paragraph", text: "We wish you well in finding your next home." },
    ],
  },
  {
    key: "application.payment_received",
    channel: "email",
    commsClass: "service",
    name: "Screening Payment Received",
    description: "Applicant confirmation that the screening fee was received and screening is in progress.",
    category: "applications",
    subject: "Payment received — screening in progress",
    mergeFields: ["{{recipient.salutation}}", "{{amountDisplay}}", "{{paymentRef}}", "{{paidDate}}", "{{statusUrl}}"],
    legalReviewRef: "ADDENDUM_70H A6 (live: emails.tsx:258)",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "Your payment of {{amountDisplay}} has been received. Your tenant screening is now in progress." },
      { type: "dataBox", rows: [
        { label: "Reference", value: "{{paymentRef}}" },
        { label: "Amount", value: "{{amountDisplay}}" },
        { label: "Date", value: "{{paidDate}}" },
      ] },
      { type: "heading", text: "What happens next" },
      { type: "paragraph", text: "The screening typically takes 1–2 business days. You'll receive an email when results are available." },
      { type: "cta", label: "Check your application status", href: "{{statusUrl}}" },
    ],
  },
  {
    key: "application.approved",
    channel: "email",
    commsClass: "correspondence",
    name: "Application Approved",
    description: "Applicant approved — next steps to lease signing.",
    category: "applications",
    subject: "Congratulations — your application has been approved!",
    mergeFields: ["{{recipient.salutation}}", "{{unitLabel}}", "{{propertyName}}", "{{branding.orgName}}", "{{orgPhone}}", "{{orgEmail}}"],
    legalReviewRef: "ADDENDUM_70H A7 (live: emails.tsx:406)",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "Congratulations! Your application for **{{unitLabel}}** at {{propertyName}} has been approved." },
      { type: "heading", text: "Next steps" },
      { type: "paragraph", text: "{{branding.orgName}} will contact you to arrange:" },
      { type: "list", items: [
        "Lease signing",
        "Deposit payment",
        "Move-in date and key collection",
      ] },
      { type: "paragraph", text: "We look forward to welcoming you as a tenant." },
      { type: "popiaSlot" },
    ],
  },
  {
    key: "application.co_applicant_invited",
    channel: "email",
    commsClass: "correspondence",
    name: "Co-Applicant Invited",
    description: "Co-applicant invited to complete their portion of a joint application (consent + credit check).",
    category: "applications",
    subject: "You've been invited to a joint rental application — {{unitLabel}}, {{propertyName}}",
    mergeFields: ["{{recipient.salutation}}", "{{primaryApplicantName}}", "{{unitLabel}}", "{{propertyName}}", "{{inviteUrl}}", "{{branding.orgName}}", "{{orgPhone}}"],
    legalReviewRef: "ADDENDUM_70H A8 (live: emails.tsx:437)",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "{{primaryApplicantName}} has included you as a co-applicant on their rental application for **{{unitLabel}}** at {{propertyName}}." },
      { type: "heading", text: "What you need to do" },
      { type: "paragraph", text: "Click the button below to complete your portion of the joint application. This includes your personal details, income, and consent to a credit check." },
      { type: "cta", label: "Complete your co-applicant details", href: "{{inviteUrl}}" },
      { type: "paragraph", text: "This link is personal to you — do not share it." },
      { type: "popiaSlot" },
    ],
  },
  {
    key: "application.declined_stage2",
    channel: "email",
    commsClass: "correspondence",
    locked: true,
    name: "Application Update — Stage 2 Decline",
    description: "Neutral post-screening decline. NEUTRAL-DECLINE doctrine: no reason in subject or body (F1 — {{reason}} dropped; higher NCA/POPIA stakes post-screening).",
    category: "applications",
    subject: "Application update — {{unitLabel}}, {{propertyName}}",
    mergeFields: ["{{recipient.salutation}}", "{{unitLabel}}", "{{propertyName}}", "{{branding.orgName}}", "{{orgEmail}}"],
    legalReviewRef: "ADDENDUM_70H A9 (live: emails.tsx:526) — F1 reason dropped · ⚠ F3 retention",
    body: [
      { type: "salutation", text: "{{recipient.salutation}}" },
      { type: "paragraph", text: "Thank you for your application for **{{unitLabel}}** at {{propertyName}}." },
      { type: "paragraph", text: "After completing the full screening evaluation, we have decided not to proceed with your application. If you have any questions, please contact {{branding.orgName}}." },
      { type: "paragraph", text: "The screening fee of R399 is non-refundable as communicated at the time of payment." },
      { type: "heading", text: "Your data" },
      // ⚠ F3: "12 months" hardcoded — contradicts the 90-day rejected-applicant purge intent. Reconcile vs the POPIA register (tokenise) BEFORE seeding.
      { type: "paragraph", text: "Your personal information will be retained for 12 months in accordance with POPIA. To request earlier deletion, contact {{branding.orgName}} at {{orgEmail}}." },
      { type: "paragraph", text: "We wish you well in finding your next home." },
    ],
  },
]
