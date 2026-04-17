/**
 * Subscription lifecycle emails — trial expiry, founding agent warning, activation,
 * and billing past-due / frozen cascade.
 * Called from cron routes and PayFast webhook.
 */

import { EmailLayout, EmailButton, EmailSectionHeading } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import { sendEmail } from "@/lib/comms/send-email"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://pleks.co.za"

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
  return sendEmail({
    orgId: org.orgId,
    templateKey: "subscription.trial_expired",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks trial has ended",
    emailElement: (
      <EmailLayout preview="Your Pleks trial has ended — your account has reverted to the Owner tier" branding={org.branding}>
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
        <EmailButton href={`${APP_URL}/settings/billing`} accentColor={org.branding.accentColor}>
          View plans and upgrade →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Your Pleks trial has ended. Your account has reverted to the Owner tier.`,
  })
}

export async function sendTrialEndingSoon(org: OrgContact, trialEndsAt: string) {
  const endsDate = new Date(trialEndsAt).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })

  return sendEmail({
    orgId: org.orgId,
    templateKey: "subscription.trial_ending_soon",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks trial ends in 2 days",
    emailElement: (
      <EmailLayout preview={`Your Pleks trial ends on ${endsDate} — upgrade to keep your features`} branding={org.branding}>
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your free trial ends on <strong style={S.strong}>{endsDate}</strong>.
          After that, your account will revert to the Owner tier and advanced features will be unavailable.
        </p>
        <EmailButton href={`${APP_URL}/settings/billing`} accentColor={org.branding.accentColor}>
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
  const expiresDate = new Date(expiresAt).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })

  return sendEmail({
    orgId: org.orgId,
    templateKey: "subscription.founding_expiry_warning",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your founding agent pricing expires soon",
    emailElement: (
      <EmailLayout preview={`Your founding agent pricing expires on ${expiresDate}`} branding={org.branding}>
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
        <EmailButton href={`${APP_URL}/settings/billing`} accentColor={org.branding.accentColor}>
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

  return sendEmail({
    orgId: org.orgId,
    templateKey: "subscription.activated",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: `Welcome to Pleks ${tierLabel[tier] ?? tier}`,
    emailElement: (
      <EmailLayout preview={`Your Pleks ${tierLabel[tier] ?? tier} subscription is active`} branding={org.branding}>
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your <strong style={S.strong}>Pleks {tierLabel[tier] ?? tier}</strong> subscription
          is now active on a <strong style={S.strong}>{cycleLabel}</strong> billing cycle.
          All features for your plan are immediately available.
        </p>
        <EmailSectionHeading>What&apos;s next</EmailSectionHeading>
        <p style={S.body}>Head to your dashboard to explore everything your plan includes.</p>
        <EmailButton href={APP_URL} accentColor={org.branding.accentColor}>
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

// ── Billing cascade emails ────────────────────────────────────────────────────

function formatZARCents(cents: number): string {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export async function sendPaymentFailed(
  org: OrgContact,
  amountCents: number,
  gracePeriodEnd: string,
) {
  const dueDate = new Date(gracePeriodEnd).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })
  const amountLabel = formatZARCents(amountCents)

  return sendEmail({
    orgId: org.orgId,
    templateKey: "subscription.payment_failed",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Action required: subscription payment overdue",
    emailElement: (
      <EmailLayout
        preview={`Your Pleks payment of ${amountLabel} could not be collected — update your details by ${dueDate}`}
        branding={org.branding}
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your Pleks subscription payment of <strong style={S.strong}>{amountLabel}</strong> could
          not be collected.
        </p>
        <EmailSectionHeading>What happens next</EmailSectionHeading>
        <p style={S.body}>
          You have until <strong style={S.strong}>{dueDate}</strong> to update your payment
          details. After that date, access to premium features will be suspended until payment
          is resolved.
        </p>
        <EmailButton href={`${APP_URL}/settings/billing`} accentColor={org.branding.accentColor}>
          Update payment details →
        </EmailButton>
        <p style={{ fontSize: 13, color: "#71717a", margin: "12px 0 0" }}>
          Your data is safe. No leases or documents will be affected.
          Only premium features will be suspended if payment remains overdue.
        </p>
      </EmailLayout>
    ),
    bodyPreview: `Your Pleks payment of ${amountLabel} could not be collected. Update your details by ${dueDate}.`,
  })
}

export async function sendPaymentReminder(
  org: OrgContact,
  amountCents: number,
  gracePeriodEnd: string,
) {
  const dueDate = new Date(gracePeriodEnd).toLocaleDateString("en-ZA", {
    day: "numeric", month: "long", year: "numeric",
  })
  const daysRemaining = Math.max(
    0,
    Math.ceil((new Date(gracePeriodEnd).getTime() - Date.now()) / 86400000),
  )
  const amountLabel = formatZARCents(amountCents)

  return sendEmail({
    orgId: org.orgId,
    templateKey: "subscription.payment_reminder",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: `Reminder: ${daysRemaining} days left to update your payment details`,
    emailElement: (
      <EmailLayout
        preview={`${daysRemaining} days left before your Pleks account is suspended — update payment now`}
        branding={org.branding}
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          This is a reminder that your Pleks subscription payment of{" "}
          <strong style={S.strong}>{amountLabel}</strong> is still overdue.
        </p>
        <p style={S.body}>
          <strong style={S.strong}>{daysRemaining} {daysRemaining === 1 ? "day" : "days"} remain</strong>{" "}
          before <strong style={S.strong}>{dueDate}</strong>, after which premium features
          will be suspended.
        </p>
        <EmailButton href={`${APP_URL}/settings/billing`} accentColor={org.branding.accentColor}>
          Resolve payment now →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `${daysRemaining} days left before your Pleks account is suspended. Update payment by ${dueDate}.`,
  })
}

export async function sendAccountFrozen(
  org: OrgContact,
  amountCents: number,
) {
  const amountLabel = formatZARCents(amountCents)

  return sendEmail({
    orgId: org.orgId,
    templateKey: "subscription.account_frozen",
    to: { email: org.adminEmail, name: org.adminName ?? org.orgName },
    subject: "Your Pleks account has been suspended",
    emailElement: (
      <EmailLayout
        preview="Premium features on your Pleks account have been suspended due to an overdue payment"
        branding={org.branding}
      >
        <p style={S.body}>Hi {org.adminName ?? org.orgName},</p>
        <p style={S.body}>
          Your Pleks subscription payment of <strong style={S.strong}>{amountLabel}</strong> is
          now 14 days overdue. Access to premium features has been suspended.
        </p>
        <EmailSectionHeading>What is suspended</EmailSectionHeading>
        <p style={S.body}>
          WhatsApp notifications, the document editor, FitScore screening, and other premium
          features are unavailable until payment is resolved.
          Your data — properties, leases, tenants, and documents — is fully intact and accessible.
        </p>
        <EmailSectionHeading>Restore access</EmailSectionHeading>
        <p style={S.body}>
          Update your payment details and your account will be restored immediately.
        </p>
        <EmailButton href={`${APP_URL}/settings/billing`} accentColor={org.branding.accentColor}>
          Restore account →
        </EmailButton>
      </EmailLayout>
    ),
    bodyPreview: `Premium features on your Pleks account have been suspended due to an overdue payment of ${amountLabel}.`,
  })
}
