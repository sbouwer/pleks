/**
 * lib/applications/commercial-emails.tsx — React EmailLayout builders for commercial director emails
 *
 * Auth:   n/a — pure functions, no DB access
 * Data:   org branding passed in by the caller (from fetchOrgSettings/buildBranding)
 * Notes:  Kept separate from commercial.ts because a "use server" file may only export
 *         async server actions; these are plain sync element builders.
 *         Returns a React element for sendEmail({ emailElement }) so director emails render
 *         WITH org branding/salutation/standard footer like the residential application emails.
 *         Every sentence here is counsel-approved verbatim (brief/legal/COUNSEL_APPROVED_SCREENING_COMMS_2026-10-03.md);
 *         a diff against that file is the review. commercial-emails.test.ts holds the forbidden phrases out.
 */

import { EmailLayout, EmailButton } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import type { ReactElement } from "react"
import type { SuretyInviteRole } from "@/lib/applications/juristicParties"

const S = {
  greeting: { fontSize: 15, color: "#18181b", margin: "0 0 12px" },
  body: { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 8px" },
  notice: { backgroundColor: "#f4f4f5", borderRadius: 8, padding: 16, margin: "16px 0", fontSize: 14, color: "#3f3f46", lineHeight: "1.6" },
} as const

/**
 * The four approved role sentences (counsel-approved comms 2026-10-03 §1), by `suretyInviteRole`. Verbatim from
 * brief/legal/COUNSEL_APPROVED_SCREENING_COMMS_2026-10-03.md — a change here is a change to counsel-reviewed text.
 * "On behalf of their business" stays in the opening only, never in a role sentence.
 */
export const SURETY_ROLE_SENTENCES: Readonly<Record<SuretyInviteRole, string>> = {
  director: "You are listed as a director who may be signing a personal suretyship in connection with this lease.",
  generic: "You are listed as a person who may be signing a personal suretyship in connection with the lease for the business named in the application.",
  trustee: "You are listed as a trustee who may be signing a personal suretyship in connection with the lease for the trust named in the application.",
  member: "You are listed as a member of the close corporation who may be signing a personal suretyship in connection with its lease.",
}

/** The one surety invite (§1). `ttlDays` is the shared screening window, SCREENING_WINDOW_DAYS. */
export function buildDirectorInviteElement(p: Readonly<{
  role: SuretyInviteRole
  directorFirstName: string
  primaryContactName: string
  propertyLabel: string
  propertyAddress: string
  portalUrl: string
  ttlDays: number
  branding: OrgBranding
}>): ReactElement {
  return (
    <EmailLayout preview={`${p.primaryContactName}'s application — your portion to complete`} branding={p.branding}>
      <p style={S.greeting}>Hi {p.directorFirstName},</p>
      <p style={S.body}>{p.primaryContactName} has submitted an application on behalf of their business to lease <strong>{p.propertyLabel}</strong>{p.propertyAddress ? ` (${p.propertyAddress})` : ""}.</p>
      <p style={S.body}>{SURETY_ROLE_SENTENCES[p.role]} Before the application can proceed, you need to complete your part — your consent and required document upload. Once all required people have completed their consent, the lead applicant will pay the screening fee.</p>
      <p style={S.body}>This takes about 10 minutes. Your private link:</p>
      <EmailButton href={p.portalUrl} accentColor={p.branding.accentColor}>Complete my portion →</EmailButton>
      <p style={S.body}>This link expires in {p.ttlDays} days.</p>
      <div style={S.notice}>
        <strong>A few things to know:</strong><br />
        • You will need to upload a recent bank statement (3 months) and your ID document<br />
        • Your screening results will be shared with the leasing agent. You will also receive a copy of your own screening report when complete.<br />
        • You are consenting to processing of your personal information under POPIA. Full details on the link page.
      </div>
      <p style={S.body}>If you do not wish to provide a personal suretyship for this lease, you can decline on the link page and we will let {p.primaryContactName} know to find a replacement.</p>
    </EmailLayout>
  )
}

/**
 * The surety reminder (§2): role-neutral, no variants. The t10 refund line and the "already paid for your portion"
 * branch are struck — both described states 14W makes impossible (no complete consent → no payment). "Your portion"
 * stays: it means the recipient's outstanding part, never a payable share of the fee.
 */
export function buildDirectorReminderElement(p: Readonly<{
  directorFirstName: string
  propertyLabel: string
  portalUrl: string
  daysRemaining: number
  stage: "t3" | "t7" | "t10"
  branding: OrgBranding
}>): ReactElement {
  return (
    <EmailLayout preview={`Reminder: your portion is still outstanding — ${p.propertyLabel}`} branding={p.branding}>
      <p style={S.greeting}>Hi {p.directorFirstName},</p>
      <p style={S.body}>This is a reminder that your portion of the application for <strong>{p.propertyLabel}</strong> is still outstanding.</p>
      {p.stage === "t10"
        ? <p style={S.body}><strong>Final reminder — your portion expires in {p.daysRemaining} days.</strong> After this, the application cannot proceed until the required consent is completed.</p>
        : <p style={S.body}>The application is waiting on your portion. You have {p.daysRemaining} days remaining.</p>}
      <EmailButton href={p.portalUrl} accentColor={p.branding.accentColor}>Complete my portion →</EmailButton>
    </EmailLayout>
  )
}
