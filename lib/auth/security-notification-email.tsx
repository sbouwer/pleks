/**
 * lib/auth/security-notification-email.tsx — Pleks-branded security-event notifications
 *
 * Auth:   none (called server-side from logAuthEvent after the auth_events row is written).
 * Data:   recipient + device/location passed in by the caller (logAuthEvent already resolves them).
 * Notes:  Pleks → account-holder system notice, so PLEKS_BRANDING (never agency branding). One parameterised
 *         template keyed by event type. Rides the app Resend pipeline — DARK until RESEND_API_KEY is set
 *         (auth_events still logs every event regardless, so it stays forensically visible meanwhile).
 */
import * as React from "react"
import { EmailLayout, type OrgBranding } from "@/lib/comms/templates/layout"
import { render } from "@react-email/components"
import { Resend } from "resend"

const PLEKS_BRANDING: OrgBranding = { orgName: "Pleks", accentColor: "#E8A838" }
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.pleks.co.za"

export type SecurityEventType =
  | "password_changed"
  | "totp_enrolled" | "totp_unenrolled"
  | "passkey_enrolled" | "passkey_unenrolled"
  | "recovery_used"

const COPY: Record<SecurityEventType, { subject: string; heading: string; line: string }> = {
  password_changed:   { subject: "Your Pleks password was changed",                       heading: "Password changed",        line: "Your Pleks account password was just changed." },
  totp_enrolled:      { subject: "Two-factor authentication was added to your Pleks account", heading: "Authenticator app added", line: "An authenticator app was added to your Pleks account." },
  totp_unenrolled:    { subject: "Two-factor authentication was removed from your Pleks account", heading: "Authenticator app removed", line: "An authenticator app was removed from your Pleks account." },
  passkey_enrolled:   { subject: "A passkey was added to your Pleks account",              heading: "Passkey added",           line: "A new passkey was added to your Pleks account." },
  passkey_unenrolled: { subject: "A passkey was removed from your Pleks account",          heading: "Passkey removed",         line: "A passkey was removed from your Pleks account." },
  recovery_used:      { subject: "A recovery code was used on your Pleks account",         heading: "Recovery code used",      line: "A recovery code was used to sign in to your Pleks account." },
}

interface SecurityNotificationParams {
  readonly to: string
  readonly userName: string
  readonly eventType: SecurityEventType
  readonly deviceLabel: string | null
  readonly location: string | null
}

function SecurityNotificationEmail({ userName, eventType, deviceLabel, location }: Omit<SecurityNotificationParams, "to">) {
  const { heading, line } = COPY[eventType]
  const rows: [string, string][] = [
    ["When", "Just now"],
    ["Where", location ?? "unknown location"],
    ["Device", deviceLabel ?? "unknown device"],
  ]
  return (
    <EmailLayout preview={`${heading} on your Pleks account`} branding={PLEKS_BRANDING}>
      <p style={{ fontFamily: "sans-serif", fontSize: 15, color: "#333", margin: "0 0 16px" }}>Hi {userName},</p>
      <p style={{ fontFamily: "sans-serif", fontSize: 15, color: "#333", margin: "0 0 24px" }}>{line}</p>

      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 24 }}>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", padding: "4px 12px 4px 0", width: 80, verticalAlign: "top" }}>{label}</td>
              <td style={{ fontFamily: "sans-serif", fontSize: 13, color: "#333", padding: "4px 0", verticalAlign: "top" }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontFamily: "sans-serif", fontSize: 14, color: "#555", margin: "0 0 12px" }}>If this was you, you can safely ignore this email.</p>
      <p style={{ fontFamily: "sans-serif", fontSize: 14, color: "#555", margin: "0 0 24px" }}>
        If this wasn&apos;t you,{" "}
        <a href={`${APP_URL}/settings/security`} style={{ color: "#c0392b" }}>secure your account</a>{" "}
        — review your sign-in methods and change your password.
      </p>
      <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#999", margin: 0 }}>
        Questions? Reach us at <a href="mailto:security@pleks.co.za" style={{ color: "#555" }}>security@pleks.co.za</a>.
      </p>
    </EmailLayout>
  )
}

const resend = new Resend(process.env.RESEND_API_KEY)

/** Send a Pleks-branded security notification. Best-effort; caller swallows errors/timeouts. */
export async function sendSecurityNotificationEmail(params: SecurityNotificationParams): Promise<void> {
  const html = await render(
    React.createElement(SecurityNotificationEmail, {
      userName: params.userName,
      eventType: params.eventType,
      deviceLabel: params.deviceLabel,
      location: params.location,
    })
  )
  await resend.emails.send({
    from: "Pleks Security <noreply@pleks.co.za>",
    to: params.to,
    subject: COPY[params.eventType].subject,
    html,
  })
}
