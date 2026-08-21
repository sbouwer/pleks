/**
 * lib/comms/templates/agent/subscriptions/cancellation.tsx — All 6 subscription cancellation email templates
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   all props injected at send time — no DB access
 * Notes:  v1.1 copy, ADDENDUM_57G §10.6. Templates 2–5 share a parametric base (WarningEmailBase);
 *         Templates 1 and 6 are written out due to unique structure.
 *
 *         ✅ COUNSEL-CLEARED 2026-08-20 — the period-based rewrite is approved and this component is
 *         wired to the live Day-0 send. What was cleared: the substitution of "at least 12 months"
 *         for "until {purgeEligibleAt}", and "at any time during the retention period" for "before
 *         {purgeEligibleAt}". Recorded as a CLARIFICATION OF THE DISCLOSURE, not a change to the
 *         retention policy. Nothing else in Template 1 was reopened. The gate it replaces held for
 *         two days and did its job — it reverted a wiring that would have shipped unreviewed copy.
 *
 *         Template 1 promises a PERIOD, never a date — CD ruling 2026-08-20, "Settled — clock
 *         model" in brief/legal/CANCELLATION_EMAIL_TEMPLATES_v1.1.md. `purge_eligible_at` is set
 *         only when the T-30 warning fires (§11.3, month 11, gated on zero active leases), so at
 *         Day 0 the date is UNDEFINED for a lease-holding org, not just unknown. Do NOT "fix" this
 *         by naming a deletion date or by computing a provisional one — both were considered and
 *         rejected on the record.
 *
 *         COUNSEL-APPROVED 2026-08-20, and note the framing, which counsel corrected: this is a
 *         two-stage DISCLOSURE, not a change to the retention policy. Stage 1 (here) states the
 *         minimum retention period; stage 2 (the 30-day warning) supplies the exact date once it is
 *         determinable. Do NOT describe 12 months as "a floor rather than a deadline" — it was
 *         always a minimum retention period, never a deletion deadline, given the lease gate and
 *         other lawful-retention grounds. The accurate description: the wording expresses the
 *         12-month period as a minimum retention period rather than representing an as-yet-uncreated
 *         purge date; it does not shorten retention or permit deletion before the existing
 *         eligibility conditions are satisfied.
 *
 *         ⚠ Stage 1 is sufficient ONLY BECAUSE stage 2 delivers the date. That makes the 30-day
 *         warning legally load-bearing, not best-effort. See M-074.
 *
 *         OPEN JUDGMENT SITE — `cancellationMethod` has no source. Both paths into
 *         confirmCancellationInner (app/(dashboard)/settings/subscription/actions.ts) reach AAL2
 *         without recording which factor satisfied it, so passkey vs authenticator code is not
 *         resolvable at the call site today. The prop is optional and the sentence is dropped when
 *         absent, rather than guessed. Resolving it needs either a fourth CancellationMethod value
 *         or passkey_aal_grants plumbing — a copy decision, not a refactor.
 */

import * as React from "react"
import { Row, Column, Section, Text, Link } from "@react-email/components"
import { EmailLayout, EmailButton, EmailSectionHeading, type OrgBranding } from "../../layout"
import { MARKETING_URL } from "@/lib/env"

// ── Types ─────────────────────────────────────────────────────────────────────

export type CancellationMethod = "passkey" | "authenticator code" | "email link"

// ── Constants ─────────────────────────────────────────────────────────────────

const MARKETING = MARKETING_URL
const PRIVACY_URL = `${MARKETING}/privacy`
const PRIVACY_RETENTION_URL = `${MARKETING}/privacy#retention`
const TERMS_CANCEL_URL = `${MARKETING}/terms#cancellation`

// ── Styles ────────────────────────────────────────────────────────────────────

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const disclaimer = { fontSize: 12, color: "#71717a", lineHeight: "18px", margin: "0 0 16px" }
const smallPrint = { fontSize: 11, color: "#a1a1aa", lineHeight: "16px", margin: "8px 0 0" }
const smallLink = { color: "#a1a1aa", textDecoration: "underline" }
const link = { color: "#1a56db", textDecoration: "underline" }
const listBox = { backgroundColor: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const listItem = { fontSize: 13, color: "#3f3f46", margin: "0 0 6px", lineHeight: "20px" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px", lineHeight: "20px" }

const boxStyles = {
  neutral: { backgroundColor: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" },
  warning: { backgroundColor: "#fef3c7", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px", border: "1px solid #fcd34d" },
  danger: { backgroundColor: "#fef2f2", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px", border: "1px solid #fca5a5" },
}

// ── Shared internal components ────────────────────────────────────────────────

/** Full 6-item Compliance Records list with statutory bases. Used in T1 and T6. */
function ComplianceList() {
  return (
    <Section style={listBox}>
      <Text style={listItem}>· Tax and billing records (5 years, Tax Administration Act s29)</Text>
      <Text style={listItem}>· Trust account records (5 years from end of financial year, Property Practitioners Act Regulation 33)</Text>
      <Text style={listItem}>· FICA verification records (5 years, Financial Intelligence Centre Act s23)</Text>
      <Text style={listItem}>· Audit and consent logs (7–10 years, POPIA s17 documentation)</Text>
      <Text style={listItem}>· Accounting records (7 years, Companies Act s24)</Text>
      <Text style={listItem}>· Records subject to any active legal hold or dispute</Text>
    </Section>
  )
}

/** Compact Compliance Records reference for warning email boxes (T2–T5). */
function ComplianceBoxRow() {
  return (
    <Text style={{ ...boxRow, marginTop: 8 }}>
      A small set of Compliance Records — tax, trust, FICA, audit, and accounting records —
      are retained in a restricted-access archive for between 5 and 10 years depending on the
      record type, as set out in our{" "}
      <Link href={PRIVACY_RETENTION_URL} style={link}>Privacy Policy</Link>.
    </Text>
  )
}

/** POPIA s24–s25 rights footer. Identical across T1–T5. */
function PopiFooter() {
  return (
    <Text style={smallPrint}>
      You may request deletion or destruction of personal information under POPIA s24–s25,
      subject to applicable legal retention obligations. You may also request a copy of your
      data under s23, or lodge a complaint with the Information Regulator (South Africa) under
      POPIA s74 —{" "}
      <Link href={PRIVACY_URL} style={smallLink}>see our Privacy Policy</Link>.
    </Text>
  )
}

// ── Parametric base for Templates 2–5 (warning sequence) ─────────────────────

interface WarningEmailBaseProps {
  branding: OrgBranding
  recipientName: string
  appUrl: string
  cancelledDate: string
  purgeEligibleAt: string
  daysUntilPurge: number
  preview: string
  headline: string
  introText: React.ReactNode
  boxVariant: "neutral" | "warning" | "danger"
  boxMainText: React.ReactNode
  sectionLabel?: string
  preCtaBlock?: React.ReactNode
  postCtaBlock: React.ReactNode
  sastNote: React.ReactNode
}

function WarningEmailBase({
  branding, recipientName, appUrl, cancelledDate, purgeEligibleAt, daysUntilPurge,
  preview, headline, introText, boxVariant, boxMainText,
  sectionLabel, preCtaBlock, postCtaBlock, sastNote,
}: Readonly<WarningEmailBaseProps>) {
  return (
    <EmailLayout
      preview={preview}
      branding={branding}
      footerVariant="cancelled_purge_warning"
      subscriptionAlert={{
        settingsUrl: `${appUrl}/settings/subscription`,
        cancelledDate,
        purgeEligibleAt,
        daysUntilPurge,
        exportUrl: `${appUrl}/reports`,
      }}
    >
      <Text style={h1}>{headline}</Text>
      <Text style={para}>Hi {recipientName},</Text>
      <Text style={para}>{introText}</Text>

      <Section style={boxStyles[boxVariant]}>
        <Text style={boxRow}>{boxMainText}</Text>
        <ComplianceBoxRow />
      </Section>

      {sectionLabel && <EmailSectionHeading>{sectionLabel}</EmailSectionHeading>}
      {preCtaBlock}

      <Row style={{ margin: "24px 0" }}>
        <Column style={{ paddingRight: 8 }}>
          <EmailButton href={`${appUrl}/reports`} accentColor="#3f3f46">
            Export all data now
          </EmailButton>
        </Column>
        <Column style={{ paddingLeft: 8 }}>
          <EmailButton href={`${appUrl}/settings/subscription`} accentColor={branding.accentColor}>
            Reactivate account
          </EmailButton>
        </Column>
      </Row>

      {postCtaBlock}
      <Text style={smallPrint}>{sastNote}</Text>
      <PopiFooter />
    </EmailLayout>
  )
}

// ── Template 1 — Cancellation Confirmation ───────────────────────────────────

export const CANCELLED_CONFIRM_SUBJECT = "Your Pleks subscription has been cancelled"

export interface CancelledConfirmEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  cancelledDate: string
  /**
   * How the cancellation was confirmed — renders the evidentiary "We confirmed this cancellation
   * via X" sentence. OPTIONAL because no call site can currently resolve it: both paths into
   * `confirmCancellationInner` reach AAL2 without recording whether a passkey or an authenticator
   * code satisfied it. Omitted → the sentence is dropped rather than guessed. See the open judgment
   * site noted in this file's header.
   */
  cancellationMethod?: CancellationMethod
  /**
   * Absolute URL for the export CTA and the footer's export link. Defaults to `${appUrl}/reports`.
   * Exists so a caller that computes its own export URL is not silently overridden — a signed,
   * single-use export link is the foreseeable case, and without this prop it would be accepted by
   * the call site and discarded here.
   */
  exportUrl?: string
}

export function CancelledConfirmEmail({
  branding, orgName, recipientName, appUrl,
  cancelledDate, cancellationMethod, exportUrl,
}: Readonly<CancelledConfirmEmailProps>) {
  const exportHref = exportUrl ?? `${appUrl}/reports`
  return (
    <EmailLayout
      preview={`Your ${orgName} subscription was cancelled on ${cancelledDate}. Your data remains available and exportable for at least 12 months.`}
      branding={branding}
      footerVariant="cancelled_purge_warning"
      subscriptionAlert={{
        settingsUrl: `${appUrl}/settings/subscription`,
        cancelledDate,
        exportUrl: exportHref,
      }}
    >
      <Text style={h1}>Subscription cancelled — your data is available for at least 12 months</Text>
      <Text style={para}>Hi {recipientName},</Text>
      <Text style={para}>
        Your <strong>{orgName}</strong> subscription was cancelled on{" "}
        <strong>{cancelledDate}</strong>.
        {cancellationMethod ? ` We confirmed this cancellation via ${cancellationMethod}.` : ""}
      </Text>
      <Text style={para}>
        By confirming cancellation, you instructed Pleks to begin the account closure and
        data-retention lifecycle described in{" "}
        <Link href={TERMS_CANCEL_URL} style={link}>Section 04 of our Terms of Service</Link>{" "}
        in force at the time of your cancellation. The 12-month read-only access period begins now.
      </Text>

      <EmailSectionHeading>What happens to your data</EmailSectionHeading>
      <Text style={para}>
        <strong>Operational data</strong> — properties, leases, communications, tenant profiles,
        and historical records of day-to-day platform use — remains fully readable and exportable
        for <strong>at least 12 months</strong> from {cancelledDate}. If active leases are still
        running on your account at that point, the retention period continues until they end. We
        will email you a 30-day warning before anything is deleted, and that warning will carry the
        exact date. After that date, Operational data is deleted from production systems and
        excluded from backup retention thereafter.
      </Text>
      <Text style={para}>
        <strong>Compliance Records</strong> — a small set of records we are legally required to
        retain — are not deleted when the Operational data period ends. These include:
      </Text>
      <ComplianceList />
      <Text style={para}>
        These Compliance Records remain in a restricted-access archive for the periods specified
        above. The full retention schedule is published in our{" "}
        <Link href={PRIVACY_RETENTION_URL} style={link}>Privacy Policy</Link>.
      </Text>
      <Text style={para}>
        Where retention is required by law, regulatory request, or active dispute, the deletion
        of Operational data may also be deferred — we will notify you separately if this applies.
      </Text>

      <EmailSectionHeading>What you should do</EmailSectionHeading>
      <Text style={para}>
        As the Responsible Party for your tenants&apos; personal information under POPIA, your
        obligations to those tenants continue after this cancellation. Trust account records carry
        a 5-year statutory retention requirement under the Property Practitioners Act. Please
        export and securely store all records you may need for these obligations — you can do this
        at any time during the retention period, and you do not need to wait for our warning email.
      </Text>
      <Row style={{ margin: "24px 0" }}>
        <Column style={{ paddingRight: 8 }}>
          <EmailButton href={exportHref} accentColor="#3f3f46">Export all data</EmailButton>
        </Column>
        <Column style={{ paddingLeft: 8 }}>
          <EmailButton href={`${appUrl}/settings/subscription`} accentColor={branding.accentColor}>Reactivate</EmailButton>
        </Column>
      </Row>
      <Text style={disclaimer}>
        Exports are provided as a downloadable archive at the time of request. You are responsible
        for verifying that exported records are complete before the deletion date. Pleks does not
        warrant the long-term integrity of exported files held outside the platform.
      </Text>

      <EmailSectionHeading>Reactivation</EmailSectionHeading>
      <Text style={para}>
        You can reactivate your account at any time during the retention period and your
        Operational data will be restored in place — leases, tenants, documents and history.
        The Terms of Service and pricing in force at the time of reactivation will apply.
      </Text>

      <Text style={smallPrint}>
        All deletion lifecycle dates are calculated in South Africa Standard Time (SAST, UTC+2).
        Scheduled purge jobs may execute within a 24-hour window of the deletion date.
      </Text>
      <PopiFooter />
    </EmailLayout>
  )
}

// ── Template 3 — 30-Day Warning ──────────────────────────────────────────────

export const PURGE_WARNING_30D_SUBJECT = "30 days until your Pleks data is scheduled for deletion"

export interface PurgeWarning30dEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  purgeEligibleAt: string
  cancelledDate: string
  daysUntilPurge: number
}

export function PurgeWarning30dEmail({
  branding, orgName, recipientName, appUrl, purgeEligibleAt, cancelledDate, daysUntilPurge,
}: Readonly<PurgeWarning30dEmailProps>) {
  return (
    <WarningEmailBase
      branding={branding} recipientName={recipientName} appUrl={appUrl}
      cancelledDate={cancelledDate} purgeEligibleAt={purgeEligibleAt} daysUntilPurge={daysUntilPurge}
      preview={`Final month: your ${orgName} Operational data is scheduled for deletion on ${purgeEligibleAt}.`}
      headline="Final month — 30 days to deletion"
      introText={<>The <strong>{orgName}</strong> account was cancelled on{" "}<strong>{cancelledDate}</strong>, and your Operational data is now scheduled for deletion in <strong>30 days</strong> — on <strong>{purgeEligibleAt}</strong>.</>}
      boxVariant="warning"
      boxMainText="After that date, your Operational records — properties, leases, communications, tenant profiles, and historical activity — will be deleted from production systems and excluded from backup retention."
      sectionLabel="Last month for export or reactivation"
      postCtaBlock={
        <>
          <Text style={para}>
            You are responsible for verifying that exported records are complete before the
            deletion date.
          </Text>
          <Text style={para}>
            If you&apos;d like to continue using Pleks, reactivate before{" "}
            <strong>{purgeEligibleAt}</strong> — the Terms of Service and pricing in force at the
            time of reactivation will apply.
          </Text>
          <Text style={para}>
            If you have continuing POPIA, RHA, or PPA obligations to your tenants — including the
            5-year trust-record retention — export the records you need before deletion.
          </Text>
        </>
      }
      sastNote={<>All deletion lifecycle dates are calculated in South Africa Standard Time (SAST). Cancellation lifecycle: see{" "}<Link href={TERMS_CANCEL_URL} style={smallLink}>Section 04 of our Terms of Service</Link>.</>}
    />
  )
}

// ── Template 5 — Final 24-Hour Warning ───────────────────────────────────────

export const PURGE_WARNING_FINAL_SUBJECT = "Final notice: your Pleks data is deleted tomorrow"

export interface PurgeWarningFinalEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  purgeEligibleAt: string
  cancelledDate: string
  daysUntilPurge: number
}

export function PurgeWarningFinalEmail({
  branding, orgName, recipientName, appUrl, purgeEligibleAt, cancelledDate, daysUntilPurge,
}: Readonly<PurgeWarningFinalEmailProps>) {
  return (
    <WarningEmailBase
      branding={branding} recipientName={recipientName} appUrl={appUrl}
      cancelledDate={cancelledDate} purgeEligibleAt={purgeEligibleAt} daysUntilPurge={daysUntilPurge}
      preview={`Final notice: ${orgName} Operational data is deleted tomorrow (${purgeEligibleAt}).`}
      headline="⚠ Operational data deletion is tomorrow"
      introText={<>Tomorrow — <strong>{purgeEligibleAt}</strong> — is the scheduled production-deletion date for <strong>{orgName}</strong>. After this date, Operational data will no longer be recoverable through Pleks production systems once the backup-retention window expires.</>}
      boxVariant="danger"
      boxMainText="All properties, leases, communications, tenant profiles, and historical records will be deleted from production systems and excluded from backup retention."
      postCtaBlock={
        <>
          <Text style={para}>
            You are responsible for verifying that exported records are complete before deletion.
            The deletion job runs in South Africa Standard Time and may execute within a 24-hour
            window of {purgeEligibleAt}.
          </Text>
          <Text style={para}>
            If you&apos;d like to keep your account, reactivate before 23:59 SAST tonight — the
            Terms of Service and pricing in force at the time of reactivation will apply.
          </Text>
        </>
      }
      sastNote={<>All deletion lifecycle dates are calculated in South Africa Standard Time (SAST, UTC+2). Cancellation lifecycle:{" "}<Link href={TERMS_CANCEL_URL} style={smallLink}>Section 04 of our Terms of Service</Link>{" "}in force at the time of your cancellation.</>}
    />
  )
}

// ── Template 6 — Post-Deletion Confirmation ───────────────────────────────────

export const PURGED_CONFIRM_SUBJECT = "Your Pleks account has been closed"

export interface PurgedConfirmEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  recipientEmail: string
  cancelledDate: string
  purgedDate: string
  finalInvoiceDate: string
}

export function PurgedConfirmEmail({
  branding, orgName, recipientName, recipientEmail, cancelledDate, purgedDate, finalInvoiceDate,
}: Readonly<PurgedConfirmEmailProps>) {
  return (
    <EmailLayout
      preview={`The ${orgName} account was closed on ${purgedDate}. Operational data has been deleted; Compliance Records retained per the schedule.`}
      branding={branding}
    >
      <Text style={h1}>Account closed</Text>
      <Text style={para}>Hi {recipientName},</Text>
      <Text style={para}>
        The <strong>{orgName}</strong> account ({recipientEmail}), cancelled on{" "}
        <strong>{cancelledDate}</strong>, was closed on <strong>{purgedDate}</strong>.
      </Text>

      <EmailSectionHeading>What was deleted</EmailSectionHeading>
      <Text style={para}>
        Operational data — properties, leases, communications, tenant profiles, and historical
        records of day-to-day platform use — has been deleted from production systems and
        excluded from backup retention thereafter.
      </Text>

      <EmailSectionHeading>What is retained</EmailSectionHeading>
      <Text style={para}>
        The following Compliance Records remain in a restricted-access archive for the periods
        specified, as set out in our{" "}
        <Link href={PRIVACY_RETENTION_URL} style={link}>Privacy Policy</Link>:
      </Text>
      <ComplianceList />
      <Text style={para}>
        These records are accessed only for the legal obligation that requires their retention,
        and are deleted at the end of the applicable retention window.
      </Text>

      <EmailSectionHeading>Final billing</EmailSectionHeading>
      <Text style={para}>
        The final invoice for {orgName} was issued on <strong>{finalInvoiceDate}</strong>. No
        further charges will be made to your payment method.
      </Text>

      <EmailSectionHeading>If you believe this is in error</EmailSectionHeading>
      <Text style={para}>
        If you believe this account closure was made in error, or if you need to access your
        retained Compliance Records, contact us at{" "}
        <Link href="mailto:support@pleks.co.za" style={link}>support@pleks.co.za</Link>. Pleks
        retains a documented record of all cancellation and deletion events for accountability
        purposes under POPIA s17.
      </Text>

      <Text style={smallPrint}>
        Deletion lifecycle dates are calculated in South Africa Standard Time (SAST, UTC+2).
      </Text>
      <Text style={smallPrint}>
        This account no longer exists as an active production account. Compliance Records are
        retained per the schedule above and our{" "}
        <Link href={PRIVACY_URL} style={smallLink}>Privacy Policy</Link>. You may at any time
        lodge a complaint about data handling with the{" "}
        <Link href="https://inforeg.org.za" style={smallLink}>
          Information Regulator (South Africa)
        </Link>{" "}
        under POPIA s74.
      </Text>
    </EmailLayout>
  )
}
