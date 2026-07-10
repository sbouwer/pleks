/**
 * lib/auth/login-notification-email.tsx — renders + sends the "new sign-in from an unrecognised device" security email
 *
 * Notes:  Uses react-email + Resend. Goes dark (no-op) when RESEND_API_KEY is unset;
 *         send failures are logged, never thrown, so login flow is never blocked.
 */
import * as React from "react"
import { EmailLayout, type OrgBranding } from "@/lib/comms/templates/layout"
import { render } from "@react-email/components"
import { sendEmail } from "@/lib/comms/send-email"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"

const PLEKS_BRANDING: OrgBranding = {
  orgName: "Pleks",
  accentColor: "oklch(0.68 0.14 65)",
}

interface LoginNotificationParams {
  readonly to: string
  readonly userName: string
  readonly deviceLabel: string
  readonly city: string | null
  readonly country: string | null
  readonly method: string | null
  readonly timeAgo: string
  readonly revokeUrl: string
}

function methodLabel(method: string | null): string {
  if (method === "password") return "password"
  if (method === "magic_link") return "email magic link"
  if (method === "passkey") return "passkey"
  return method ?? "unknown method"
}

interface EmailProps {
  readonly userName: string
  readonly deviceLabel: string
  readonly city: string | null
  readonly country: string | null
  readonly method: string | null
  readonly timeAgo: string
  readonly revokeUrl: string
}

function LoginNotificationEmail({ userName, deviceLabel, city, country, method, timeAgo, revokeUrl }: EmailProps) {
  const location = [city, country].filter(Boolean).join(", ") || "unknown location"

  return (
    <EmailLayout preview={`New sign-in to your Pleks account from ${deviceLabel}`} branding={PLEKS_BRANDING}>
      <p style={{ fontFamily: "sans-serif", fontSize: 15, color: "#333", margin: "0 0 16px" }}>
        Hi {userName},
      </p>
      <p style={{ fontFamily: "sans-serif", fontSize: 15, color: "#333", margin: "0 0 24px" }}>
        Your Pleks account was just accessed from a device we don&apos;t recognise.
      </p>

      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 24 }}>
        <tbody>
          {([
            ["When",   timeAgo],
            ["Where",  location],
            ["Device", deviceLabel],
            ["Method", methodLabel(method)],
          ] as [string, string][]).map(([label, value]) => (
            <tr key={label}>
              <td style={{ fontFamily: "sans-serif", fontSize: 13, color: "#666", padding: "4px 12px 4px 0", width: 80, verticalAlign: "top" }}>
                {label}
              </td>
              <td style={{ fontFamily: "sans-serif", fontSize: 13, color: "#333", padding: "4px 0", verticalAlign: "top" }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ fontFamily: "sans-serif", fontSize: 14, color: "#555", margin: "0 0 12px" }}>
        If this was you, you can safely ignore this email.
      </p>
      <p style={{ fontFamily: "sans-serif", fontSize: 14, color: "#555", margin: "0 0 24px" }}>
        If this wasn&apos;t you,{" "}
        <a href={revokeUrl} style={{ color: "#c0392b" }}>
          revoke this session and secure your account
        </a>.
      </p>

      <p style={{ fontFamily: "sans-serif", fontSize: 13, color: "#999", margin: 0 }}>
        Questions? Reply to this email or reach us at{" "}
        <a href="mailto:security@pleks.co.za" style={{ color: "#555" }}>security@pleks.co.za</a>.
      </p>
    </EmailLayout>
  )
}

// RESEND_API_KEY unset → the notification goes dark (sendEmail's own send would fail); keep the guard.
const resendKey = process.env.RESEND_API_KEY

export async function sendLoginNotificationEmail(params: LoginNotificationParams): Promise<void> {
  if (!resendKey) return  // RESEND_API_KEY unset → login-notification dark
  try {
    const html = await render(
      React.createElement(LoginNotificationEmail, {
        userName:    params.userName,
        deviceLabel: params.deviceLabel,
        city:        params.city,
        country:     params.country,
        method:      params.method,
        timeAgo:     params.timeAgo,
        revokeUrl:   params.revokeUrl,
      })
    )

    // rawHtml, NOT contentHtml: `html` is already a COMPLETE document (the component renders
    // EmailLayout itself), so wrapping it again would double-chrome the email.
    // templateKey is is_mandatory, so canSend can never suppress a security alert.
    await sendEmail({
      orgId:       PLATFORM_ORG_ID,
      templateKey: "security.login_notification",
      to:          { email: params.to, name: params.userName },
      subject:     "New sign-in to your Pleks account",
      rawHtml:     html,
    })
  } catch (err) {
    console.error("[login-notification] send failed:", err)
  }
}
