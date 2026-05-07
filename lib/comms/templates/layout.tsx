/**
 * lib/comms/templates/layout.tsx — Shared React Email layout for all Pleks platform emails
 *
 * Notes:  Org branding injected at send time.
 *         footerVariant adds a subscription-state alert above the org footer — agent emails only.
 *         Tenant/landlord/supplier templates always pass footerVariant="none" (or omit it).
 *         No web fonts, no complex CSS (must render on Gmail Go, Samsung Email).
 *         System font stack only. Max width 600px.
 */

import {
  Body,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Column,
  Section,
  Text,
  Hr,
} from "@react-email/components"
import * as React from "react"
import type { EmailFooterVariant } from "@/lib/subscriptions/state"

export interface OrgBranding {
  orgName: string
  orgPhone?: string
  orgEmail?: string
  orgAddress?: string
  logoUrl?: string           // public Supabase Storage URL
  accentColor?: string       // hex, e.g. "#1a56db"
  unsubscribeUrl?: string    // /unsubscribe/{token}
  emergencyPhone?: string
  emergencyContactName?: string
}

export interface SubscriptionAlertData {
  cancelledDate: string      // human-readable e.g. "7 May 2025"
  purgeEligibleAt: string    // human-readable e.g. "7 May 2026"
  daysUntilPurge: number
  exportUrl: string          // absolute URL to /reports
  settingsUrl: string        // absolute URL to /settings/subscription
}

interface EmailLayoutProps {
  preview: string            // preview text (shown in email clients before open)
  branding: OrgBranding
  children: React.ReactNode
  templateCategory?: string  // 'maintenance' shows emergency contact line in footer
  footerVariant?: EmailFooterVariant     // subscription-state alert; agent emails only
  subscriptionAlert?: SubscriptionAlertData  // required when footerVariant === "cancelled_purge_warning"
}

const DEFAULT_ACCENT = "#1a56db"

export function EmailLayout({ preview, branding, children, templateCategory, footerVariant, subscriptionAlert }: Readonly<EmailLayoutProps>) {
  const accent = branding.accentColor ?? DEFAULT_ACCENT
  const showEmergency = templateCategory === "maintenance"
    && !!(branding.emergencyContactName ?? branding.emergencyPhone)

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>

          {/* Header */}
          <Section style={{ ...styles.header, borderTop: `4px solid ${accent}` }}>
            <Row>
              <Column>
                {branding.logoUrl ? (
                  <Img src={branding.logoUrl} alt={branding.orgName} height={40} style={styles.logo} />
                ) : (
                  <Text style={{ ...styles.orgName, color: accent }}>{branding.orgName}</Text>
                )}
              </Column>
              <Column align="right">
                <Text style={styles.headerOrgName}>{branding.orgName}</Text>
              </Column>
            </Row>
          </Section>

          {/* Body */}
          <Section style={styles.content}>
            {children}
          </Section>

          {/* Subscription state alert — agent emails only; never shown to tenants/landlords */}
          {footerVariant && (
            <EmailSubscriptionFooter variant={footerVariant} alert={subscriptionAlert} />
          )}

          {/* Footer */}
          <Hr style={styles.divider} />
          <Section style={styles.footer}>
            <Text style={styles.footerOrgName}>{branding.orgName}</Text>
            {(branding.orgPhone || branding.orgEmail) && (
              <Text style={styles.footerContact}>
                {[branding.orgPhone, branding.orgEmail].filter(Boolean).join(" · ")}
              </Text>
            )}
            {branding.orgAddress && (
              <Text style={styles.footerAddress}>{branding.orgAddress}</Text>
            )}
            {showEmergency && (
              <Text style={styles.footerContact}>
                Emergency: {[branding.emergencyContactName, branding.emergencyPhone].filter(Boolean).join(" · ")}
              </Text>
            )}
            <Text style={styles.footerMeta}>
              Sent via Pleks property management
              {branding.unsubscribeUrl && (
                <>
                  {" · "}
                  <Link href={branding.unsubscribeUrl} style={styles.unsubscribeLink}>
                    Manage email preferences
                  </Link>
                </>
              )}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

/** Subscription-state alert rendered above the org footer in agent-facing emails. */
function EmailSubscriptionFooter({ variant, alert }: Readonly<{ variant: EmailFooterVariant; alert?: SubscriptionAlertData }>) {
  if (variant === "none") return null
  if (variant === "past_due_warning") {
    return (
      <Section style={subFooter.amber}>
        <Text style={subFooter.text}>
          Your last payment didn&apos;t go through. PayFast will retry over the next few days.
          If you&apos;d like to update your payment details,{" "}
          <Link href={alert?.settingsUrl ?? "#"} style={subFooter.link}>open Settings → Subscription</Link>.
          No action needed yet.
        </Text>
      </Section>
    )
  }
  if (variant === "paused_resume_cta") {
    return (
      <Section style={subFooter.amberStrong}>
        <Text style={subFooter.text}>
          Your subscription is paused. You&apos;re still reading every report and statement here,
          and your tenants and landlords are getting their scheduled comms as normal.
          To start onboarding new leases again,{" "}
          <Link href={alert?.settingsUrl ?? "#"} style={subFooter.link}>resume your subscription</Link>{" "}
          in one click.
        </Text>
      </Section>
    )
  }
  // cancelled_purge_warning
  const cancelledClause = alert?.cancelledDate ? ` on ${alert.cancelledDate}` : ""
  const untilClause = alert?.purgeEligibleAt ? ` until ${alert.purgeEligibleAt}` : ""
  const daysClause = alert?.daysUntilPurge === undefined ? "" : ` (${alert.daysUntilPurge} days from today)`
  return (
    <Section style={subFooter.dark}>
      <Text style={{ ...subFooter.text, color: "#e4e4e7" }}>
        You cancelled your subscription{cancelledClause}.
        Your full data export is available{" "}
        <Link href={alert?.exportUrl ?? "#"} style={subFooter.linkDark}>here</Link>
        {untilClause}{daysClause}.
        Reactivating any time before then{" "}
        <Link href={alert?.settingsUrl ?? "#"} style={subFooter.linkDark}>restores everything in place</Link>.
      </Text>
    </Section>
  )
}

/** Standard CTA button — uses org accent colour */
export function EmailButton({ href, children, accentColor }: Readonly<{ href: string; children: React.ReactNode; accentColor?: string }>) {
  return (
    <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
      <Link
        href={href}
        style={{
          ...styles.button,
          backgroundColor: accentColor ?? DEFAULT_ACCENT,
        }}
      >
        {children}
      </Link>
    </Section>
  )
}

/** Section heading — bold uppercase label */
export function EmailSectionHeading({ children }: Readonly<{ children: React.ReactNode }>) {
  return <Text style={styles.sectionHeading}>{children}</Text>
}

/** Key-value pair row */
export function EmailDetail({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Row style={{ marginBottom: 4 }}>
      <Column style={{ width: "40%", verticalAlign: "top" as const }}>
        <Text style={styles.detailLabel}>{label}</Text>
      </Column>
      <Column style={{ width: "60%", verticalAlign: "top" as const }}>
        <Text style={styles.detailValue}>{value}</Text>
      </Column>
    </Row>
  )
}

const styles = {
  body: {
    backgroundColor: "#f4f4f5",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: "20px 0",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    maxWidth: 600,
    margin: "0 auto",
    overflow: "hidden" as const,
  },
  header: {
    padding: "20px 32px 16px",
    borderBottom: "1px solid #e4e4e7",
  },
  logo: {
    display: "block" as const,
  },
  orgName: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    lineHeight: "40px",
  },
  headerOrgName: {
    fontSize: 13,
    color: "#71717a",
    margin: 0,
    lineHeight: "40px",
    textAlign: "right" as const,
  },
  content: {
    padding: "24px 32px",
  },
  divider: {
    borderColor: "#e4e4e7",
    margin: "0 32px",
  },
  footer: {
    padding: "16px 32px 24px",
  },
  footerOrgName: {
    fontSize: 13,
    fontWeight: 600,
    color: "#3f3f46",
    margin: "0 0 4px",
  },
  footerContact: {
    fontSize: 12,
    color: "#71717a",
    margin: "0 0 2px",
  },
  footerAddress: {
    fontSize: 12,
    color: "#71717a",
    margin: "0 0 8px",
  },
  footerMeta: {
    fontSize: 11,
    color: "#a1a1aa",
    margin: 0,
  },
  unsubscribeLink: {
    color: "#a1a1aa",
    textDecoration: "underline",
  },
  button: {
    display: "inline-block" as const,
    padding: "12px 24px",
    borderRadius: 6,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 600,
    textDecoration: "none",
    textAlign: "center" as const,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: 700,
    color: "#71717a",
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    margin: "20px 0 8px",
    borderBottom: "1px solid #e4e4e7",
    paddingBottom: 4,
  },
  detailLabel: {
    fontSize: 13,
    color: "#71717a",
    margin: "0 0 2px",
  },
  detailValue: {
    fontSize: 13,
    color: "#18181b",
    fontWeight: 500,
    margin: "0 0 2px",
  },
}

const subFooter = {
  amber: {
    backgroundColor: "#fffbeb",
    borderTop: "1px solid #fcd34d",
    padding: "12px 32px",
  },
  amberStrong: {
    backgroundColor: "#fef3c7",
    borderTop: "2px solid #f59e0b",
    padding: "12px 32px",
  },
  dark: {
    backgroundColor: "#1c1917",
    borderTop: "3px solid #f59e0b",
    padding: "12px 32px",
  },
  text: {
    fontSize: 12,
    color: "#78350f",
    margin: 0,
    lineHeight: "18px",
  },
  link: {
    color: "#92400e",
    textDecoration: "underline",
  },
  linkDark: {
    color: "#fcd34d",
    textDecoration: "underline",
  },
}
