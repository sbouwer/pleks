/**
 * Subscription lifecycle emails — trial expiry, founding agent warning, activation.
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
