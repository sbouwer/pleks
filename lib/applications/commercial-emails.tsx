/**
 * lib/applications/commercial-emails.tsx — React EmailLayout builders for commercial director emails
 *
 * Auth:   n/a — pure functions, no DB access
 * Data:   org branding passed in by the caller (from fetchOrgSettings/buildBranding)
 * Notes:  Kept separate from commercial.ts because a "use server" file may only export
 *         async server actions; these are plain sync element builders.
 *         Returns a React element for sendEmail({ emailElement }) so director emails render
 *         WITH org branding/salutation/standard footer like the residential application emails.
 */

import { EmailLayout, EmailButton } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import type { ReactElement } from "react"

const S = {
  greeting: { fontSize: 15, color: "#18181b", margin: "0 0 12px" },
  body: { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 8px" },
  notice: { backgroundColor: "#f4f4f5", borderRadius: 8, padding: 16, margin: "16px 0", fontSize: 14, color: "#3f3f46", lineHeight: "1.6" },
} as const

export function buildDirectorInviteElement(p: Readonly<{
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
      <p style={S.body}>You are listed as a director signing personal surety for this lease. Before the application can proceed, you need to complete your own portion — payment, consent, and document upload.</p>
      <p style={S.body}>This takes about 10 minutes. Your private link:</p>
      <EmailButton href={p.portalUrl} accentColor={p.branding.accentColor}>Complete my portion →</EmailButton>
      <p style={S.body}>This link expires in {p.ttlDays} days.</p>
      <div style={S.notice}>
        <strong>A few things to know:</strong><br />
        • You will pay a screening fee for your portion (covers credit check, ID verification, income verification, and rental history)<br />
        • You will need to upload a recent bank statement (3 months) and your ID document<br />
        • The results will be shared with the leasing agent. You also get your own copy by email when complete.<br />
        • You are consenting to processing of your personal information under POPIA. Full details on the link page.
      </div>
      <p style={S.body}>If you do not want to sign personal surety for this lease, you can decline on the link page and we will let {p.primaryContactName} know to find a replacement.</p>
    </EmailLayout>
  )
}

export function buildDirectorReminderElement(p: Readonly<{
  directorFirstName: string
  primaryContactName: string
  propertyLabel: string
  portalUrl: string
  daysRemaining: number
  stage: "t3" | "t7" | "t10"
  paidByPrimary: boolean
  branding: OrgBranding
}>): ReactElement {
  return (
    <EmailLayout preview={`Reminder: your portion is still outstanding — ${p.propertyLabel}`} branding={p.branding}>
      <p style={S.greeting}>Hi {p.directorFirstName},</p>
      <p style={S.body}>This is a reminder that your portion of the application for <strong>{p.propertyLabel}</strong> is still outstanding.</p>
      {p.stage === "t10"
        ? <p style={S.body}><strong>Final reminder — your portion expires in {p.daysRemaining} days.</strong> After this, the application will be cancelled and any fees paid will need to be refunded.</p>
        : <p style={S.body}>The application is waiting on your portion. You have {p.daysRemaining} days remaining.</p>}
      {p.paidByPrimary && (
        <p style={S.body}>{p.primaryContactName} has already paid for your portion. You only need to give consent and upload your documents.</p>
      )}
      <EmailButton href={p.portalUrl} accentColor={p.branding.accentColor}>Complete my portion →</EmailButton>
    </EmailLayout>
  )
}
