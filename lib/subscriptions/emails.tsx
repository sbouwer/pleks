/**
 * lib/subscriptions/emails.tsx — Subscription lifecycle transactional emails
 *
 * Data:   Called from cron routes and PayFast webhook; no DB access here.
 * Notes:  Covers trial, dunning, dormancy, cancellation-tail, and purge warnings.
 */

import { EmailLayout, EmailButton, EmailSectionHeading } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import { sendPlatformEmail } from "./sendWithRetry"
import {
  CancelledConfirmEmail,  CANCELLED_CONFIRM_SUBJECT,
  PurgeWarning30dEmail,   PURGE_WARNING_30D_SUBJECT,
  PurgeWarningFinalEmail, PURGE_WARNING_FINAL_SUBJECT,
  PurgedConfirmEmail,     PURGED_CONFIRM_SUBJECT,
} from "@/lib/comms/templates/agent/subscriptions/cancellation"
import { fmtDateLongZA } from "@/lib/dates"
import { APP_URL } from "@/lib/env"
import { absoluteUrl } from "@/lib/routing/absoluteUrl"

interface PurgeWarningData {
  cancelledDate:   string
  purgeEligibleAt: string
  daysUntilPurge:  number
  exportUrl:       string
  settingsUrl:     string
}

// A one-line `formatDate(iso)` wrapper over fmtDateLongZA lived here, re-exported at the foot of the
// file for "purge step callers". Removing the re-export (see the note there) left the wrapper with no
// caller inside the module either — it existed only to be re-exported. Both went 2026-08-21; anything
// needing this formatting imports fmtDateLongZA from @/lib/dates, the SSOT.

// Pleks → customer system emails are always Pleks-branded (never the agency brand) — branding follows the
// sender→recipient relationship. Overrides whatever branding the billing crons build; the recipient's name
// still personalises the body.
const PLEKS_BRANDING: OrgBranding = { orgName: "Pleks", accentColor: "#E8A838" }

const S = {
  body: { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 8px" },
  strong: { fontWeight: 600 as const, color: "#18181b" },
} as const

interface OrgContact {
  orgId: string
  orgName: string
  adminEmail: string
  adminName?: string
  branding: OrgBranding
}

export async function sendTrialExpired(org: OrgContact, prevTier: string) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.trial_expired",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks trial has ended",
    emailElement: (
      <EmailLayout preview="Your Pleks trial has ended — your account has reverted to the Owner tier" branding={PLEKS_BRANDING}>
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your free trial of the <strong style={S.strong}>{prevTier}</strong> tier has ended.
          Your account has been reverted to the <strong style={S.strong}>Owner</strong> tier.
        </p>
        <EmailSectionHeading>What this means</EmailSectionHeading>
        <p style={S.body}>
          Features available only on higher tiers — such as multi-unit portfolio management,
          advanced arrears sequences, and team access — are no longer available.
          Your existing data is safe and fully intact.
        </p>
        <EmailSectionHeading>Upgrade to keep your features</EmailSectionHeading>
        <p style={S.body}>
          Subscribe to a paid plan to continue where you left off.
          Your trial data, properties, and leases are waiting.
        </p>
        <EmailButton href={absoluteUrl("/settings/subscription")} accentColor={PLEKS_BRANDING.accentColor}>
          View plans and upgrade →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Your Pleks trial has ended. Your account has reverted to the Owner tier.`,
  })
}

export async function sendTrialEndingSoon(org: OrgContact, trialEndsAt: string) {
  const endsDate = fmtDateLongZA(trialEndsAt)

  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.trial_ending_soon",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks trial ends in 2 days",
    emailElement: (
      <EmailLayout preview={`Your Pleks trial ends on ${endsDate} — upgrade to keep your features`} branding={PLEKS_BRANDING}>
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your free trial ends on <strong style={S.strong}>{endsDate}</strong>.
          After that, your account will revert to the Owner tier and advanced features will be unavailable.
        </p>
        <EmailButton href={absoluteUrl("/settings/subscription")} accentColor={PLEKS_BRANDING.accentColor}>
          Upgrade before your trial ends →
        </EmailButton>
        <p style={{ fontSize: 13, color: "#71717a", margin: "12px 0 0" }}>
          No action needed to stay on the free Owner tier. Only upgrade if you want to keep
          the features you&apos;ve been trialling.
        </p>
      </EmailLayout>
    ),
    bodyPreview: `Your Pleks trial ends on ${endsDate}. Upgrade to keep your features.`,
  })
}

export async function sendFoundingExpiryWarning(org: OrgContact, expiresAt: string) {
  const expiresDate = fmtDateLongZA(expiresAt)

  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.founding_expiry_warning",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your founding agent pricing expires soon",
    emailElement: (
      <EmailLayout preview={`Your founding agent pricing expires on ${expiresDate}`} branding={PLEKS_BRANDING}>
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Thank you for being a founding agent. Your founding pricing expires on{" "}
          <strong style={S.strong}>{expiresDate}</strong>.
        </p>
        <p style={S.body}>
          After this date, your subscription will automatically move to the standard rate
          for your current plan. No action is required — your service will continue uninterrupted.
        </p>
        <EmailSectionHeading>Your current plan</EmailSectionHeading>
        <p style={S.body}>
          You can review your current plan and pricing on the billing page.
        </p>
        <EmailButton href={absoluteUrl("/settings/subscription")} accentColor={PLEKS_BRANDING.accentColor}>
          View your billing →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Your founding agent pricing expires on ${expiresDate}.`,
  })
}

export async function sendSubscriptionActivated(
  org: OrgContact,
  tier: string,
  billingCycle: "monthly" | "annual"
) {
  const tierLabel: Record<string, string> = {
    steward: "Steward", portfolio: "Portfolio", firm: "Firm",
  }
  const cycleLabel = billingCycle === "annual" ? "annual" : "monthly"

  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.activated",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: `Welcome to Pleks ${tierLabel[tier] ?? tier}`,
    emailElement: (
      <EmailLayout preview={`Your Pleks ${tierLabel[tier] ?? tier} subscription is active`} branding={PLEKS_BRANDING}>
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your <strong style={S.strong}>Pleks {tierLabel[tier] ?? tier}</strong> subscription
          is now active on a <strong style={S.strong}>{cycleLabel}</strong> billing cycle.
          All features for your plan are immediately available.
        </p>
        <EmailSectionHeading>What&apos;s next</EmailSectionHeading>
        <p style={S.body}>Head to your dashboard to explore everything your plan includes.</p>
        <EmailButton href={APP_URL} accentColor={PLEKS_BRANDING.accentColor}>
          Go to your dashboard →
        </EmailButton>
        <p style={{ fontSize: 13, color: "#71717a", margin: "12px 0 0" }}>
          Questions? Reply to this email or contact us via the app.
        </p>
      </EmailLayout>
    ),
    bodyPreview: `Your Pleks ${tierLabel[tier] ?? tier} (${cycleLabel}) subscription is now active.`,
  })
}

// ── Dunning step emails (ADDENDUM_57G §11.1) ─────────────────────────────────

export async function sendPastDueFirst(org: OrgContact) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.past_due_first",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Action required: your Pleks payment didn't go through",
    emailElement: (
      <EmailLayout
        preview="Your last payment didn't go through — PayFast will retry over the next few days"
        branding={PLEKS_BRANDING}
        footerVariant="past_due_warning"
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your last Pleks subscription payment didn&apos;t go through. PayFast will retry
          automatically over the next few days — no action is needed right now.
        </p>
        <p style={S.body}>
          If payment is still outstanding after 14 days, your account will be paused.
          Your data remains fully intact and accessible throughout.
        </p>
        <EmailButton href={absoluteUrl("/settings/subscription")} accentColor={PLEKS_BRANDING.accentColor}>
          Review payment details →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: "Your last Pleks subscription payment didn't go through. PayFast will retry automatically.",
  })
}

export async function sendPastDueDay7(org: OrgContact) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.past_due_day7",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Reminder: Pleks payment still outstanding — 7 days",
    emailElement: (
      <EmailLayout
        preview="Your Pleks payment is now 7 days overdue — account pauses in 7 days if unresolved"
        branding={PLEKS_BRANDING}
        footerVariant="past_due_warning"
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your Pleks subscription payment is now <strong style={S.strong}>7 days overdue</strong>.
          If it isn&apos;t resolved in the next 7 days, your account will be paused automatically.
        </p>
        <p style={S.body}>
          While paused, you can still read all existing data and export records — but creating
          new leases, onboarding tenants, and running credit checks will be unavailable.
        </p>
        <EmailButton href={absoluteUrl("/settings/subscription")} accentColor={PLEKS_BRANDING.accentColor}>
          Update payment details →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: "Your Pleks payment is 7 days overdue. Account pauses in 7 days if unresolved.",
  })
}

export async function sendPausedAuto(org: OrgContact) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.paused_auto",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks account has been paused",
    emailElement: (
      <EmailLayout
        preview="Your Pleks account is paused — existing data is safe, new onboarding is unavailable"
        branding={PLEKS_BRANDING}
        footerVariant="paused_resume_cta"
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your Pleks subscription payment has been outstanding for 14 days, so your account
          has been <strong style={S.strong}>paused automatically</strong>.
        </p>
        <EmailSectionHeading>What this means</EmailSectionHeading>
        <p style={S.body}>
          Your data — all properties, leases, tenants, inspections, and financial records —
          is fully intact. Your tenants and landlords will continue to receive their scheduled
          notifications. You can read everything and export at any time.
        </p>
        <p style={S.body}>
          Creating new leases, onboarding new tenants, and running credit checks are unavailable
          until payment is resolved.
        </p>
        <EmailButton href={absoluteUrl("/settings/subscription")} accentColor={PLEKS_BRANDING.accentColor}>
          Resolve payment and resume →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: "Your Pleks account has been paused after 14 days of outstanding payment. All data is safe.",
  })
}

// ── Dormancy step emails (ADDENDUM_57G §11.2) ─────────────────────────────────

export async function sendDormancyWarning(org: OrgContact, purgeDateStr: string) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "dormancy.warning",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks account is scheduled for deletion",
    emailElement: (
      <EmailLayout
        preview={`Your inactive Pleks account is scheduled for deletion on ${purgeDateStr}`}
        branding={PLEKS_BRANDING}
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your Pleks account has had no activity and no data for over 60 days. To keep our
          systems clean, inactive empty accounts are scheduled for deletion after a 30-day notice period.
        </p>
        <p style={S.body}>
          <strong style={S.strong}>Your account will be deleted on {purgeDateStr}</strong>{" "}
          unless you log in before then.
        </p>
        <p style={S.body}>
          If you&apos;d like to keep your account, simply log in — that&apos;s all it takes.
        </p>
        <EmailButton href={absoluteUrl("/login")} accentColor={PLEKS_BRANDING.accentColor}>
          Log in to keep your account →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Your inactive Pleks account is scheduled for deletion on ${purgeDateStr}. Log in to keep it.`,
  })
}

export async function sendDormancyFinal(org: OrgContact, purgeDateStr: string) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "dormancy.final",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Final notice: your Pleks account is deleted tomorrow",
    emailElement: (
      <EmailLayout
        preview={`Final notice: your Pleks account is deleted tomorrow (${purgeDateStr})`}
        branding={PLEKS_BRANDING}
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          This is your final notice. Your inactive Pleks account will be{" "}
          <strong style={S.strong}>permanently deleted tomorrow — {purgeDateStr}</strong>.
        </p>
        <p style={S.body}>
          Log in today to keep your account. If you don&apos;t, the account will be closed
          and cannot be recovered.
        </p>
        <EmailButton href={absoluteUrl("/login")} accentColor={PLEKS_BRANDING.accentColor}>
          Log in now →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Final notice: your inactive Pleks account is deleted tomorrow (${purgeDateStr}).`,
  })
}

// ── Purge-warning step emails (ADDENDUM_57G §11.3) ────────────────────────────

export async function sendPurgeWarning30d(org: OrgContact, data: PurgeWarningData) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.purge_warning_30d",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: PURGE_WARNING_30D_SUBJECT,
    emailElement: (
      <PurgeWarning30dEmail
        branding={PLEKS_BRANDING}
        orgName={org.orgName}
        recipientName={org.adminName ?? org.orgName}
        appUrl={APP_URL}
        cancelledDate={data.cancelledDate}
        purgeEligibleAt={data.purgeEligibleAt}
        daysUntilPurge={data.daysUntilPurge}
      />
    ),
    bodyPreview: `Final month: your Operational data is scheduled for deletion on ${data.purgeEligibleAt}.`,
  })
}

export async function sendPurgeWarningFinal(org: OrgContact, data: PurgeWarningData) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.purge_warning_final",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: PURGE_WARNING_FINAL_SUBJECT,
    emailElement: (
      <PurgeWarningFinalEmail
        branding={PLEKS_BRANDING}
        orgName={org.orgName}
        recipientName={org.adminName ?? org.orgName}
        appUrl={APP_URL}
        cancelledDate={data.cancelledDate}
        purgeEligibleAt={data.purgeEligibleAt}
        daysUntilPurge={data.daysUntilPurge}
      />
    ),
    bodyPreview: `Final notice: Operational data deletion is tomorrow — ${data.purgeEligibleAt}.`,
  })
}

export async function sendPurgedConfirm(
  org: OrgContact & { recipientEmail: string },
  data: { cancelledDate: string; purgedDate: string; finalInvoiceDate: string },
) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.purged_confirm",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: PURGED_CONFIRM_SUBJECT,
    emailElement: (
      <PurgedConfirmEmail
        branding={PLEKS_BRANDING}
        orgName={org.orgName}
        recipientName={org.adminName ?? org.orgName}
        recipientEmail={org.recipientEmail}
        cancelledDate={data.cancelledDate}
        purgedDate={data.purgedDate}
        finalInvoiceDate={data.finalInvoiceDate}
      />
    ),
    bodyPreview: `The ${org.orgName} account was closed on ${data.purgedDate}. Operational data has been deleted.`,
  })
}

// ── Step 9 emails: org-initiated pause / resume / cancel ─────────────────────

export async function sendPausedManual(org: OrgContact, reason: string) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.paused_manual",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks subscription has been paused",
    emailElement: (
      <EmailLayout
        preview="Your Pleks subscription is paused — resume any time in settings"
        branding={PLEKS_BRANDING}
        footerVariant="paused_resume_cta"
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your Pleks subscription has been <strong style={S.strong}>paused</strong> at your request.
        </p>
        {reason && (
          <p style={S.body}>
            Reason recorded: <em>{reason}</em>
          </p>
        )}
        <EmailSectionHeading>What this means</EmailSectionHeading>
        <p style={S.body}>
          All your data — properties, leases, tenants, and financial records — is fully intact.
          Your tenants and landlords continue to receive their scheduled notifications as normal.
          You can read everything and export at any time.
        </p>
        <p style={S.body}>
          Creating new leases, onboarding new tenants, and running credit checks are paused
          until you resume.
        </p>
        <EmailButton href={absoluteUrl("/settings/subscription")} accentColor={PLEKS_BRANDING.accentColor}>
          Resume subscription →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: "Your Pleks subscription has been paused at your request. All data is safe.",
  })
}

export async function sendResumed(org: OrgContact) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.resumed",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks subscription is active again",
    emailElement: (
      <EmailLayout
        preview="Your Pleks subscription has been resumed — full access restored"
        branding={PLEKS_BRANDING}
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your Pleks subscription has been <strong style={S.strong}>resumed</strong>.
          Full access is restored.
        </p>
        <p style={S.body}>
          You can now create new leases, onboard tenants, and use all features on your plan.
        </p>
        <EmailButton href={absoluteUrl("/dashboard")} accentColor={PLEKS_BRANDING.accentColor}>
          Go to dashboard →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: "Your Pleks subscription has been resumed. Full access is restored.",
  })
}

/**
 * Day-0 cancellation confirmation (Template 1).
 *
 * Renders `CancelledConfirmEmail` — the counsel-reviewed implementation. It was DEAD for months
 * while this function re-implemented the same template key inline with its own JSX and subject
 * string: two implementations of one key, and the reviewed one was the one nobody received. The
 * inline copy lacked the ToS §04 incorporation, the Compliance Records carve-out, the legal-hold
 * deferral, the POPIA Responsible-Party obligations and the export-integrity disclaimer.
 *
 * Wired 2026-08-20 once counsel cleared the period-based rewrite. Do not re-inline it: if this copy
 * needs to change, change the component, or the fork comes back with the reviewed side losing again.
 */
export async function sendCancelledConfirm(
  org: OrgContact,
  data: { cancelledDate: string; exportUrl: string },
) {
  return sendPlatformEmail({
    orgId: org.orgId,
    templateKey: "subscription.cancelled_confirm",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: CANCELLED_CONFIRM_SUBJECT,
    emailElement: (
      <CancelledConfirmEmail
        branding={PLEKS_BRANDING}
        orgName={org.orgName}
        recipientName={org.adminName ?? org.orgName}
        appUrl={APP_URL}
        cancelledDate={data.cancelledDate}
        exportUrl={data.exportUrl}
      />
    ),
    bodyPreview: `Subscription cancelled on ${data.cancelledDate}. Data accessible for at least 12 months.`,
  })
}

// `export { formatDate }` sat here under the comment "used by purge step callers". All seven
// importing files were checked and none of them is such a caller — the comment described an
// intention, not a fact, which is the failure mode that makes a stale justifying comment worse than
// a bare re-export. Removed 2026-08-21, and with no external caller the wrapper it exported had no
// internal one either; it went too (see the note at its declaration).
