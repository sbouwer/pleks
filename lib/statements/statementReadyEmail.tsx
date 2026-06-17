/**
 * lib/statements/statementReadyEmail.tsx — owner "monthly statement ready" notification (statement.ready)
 *
 * Auth:   data only — no DB access; the cron (owner-statement-gen) fetches branding + recipient and sends.
 * Data:   none (pure builder). Renders the branded notice; the statement itself lives behind the tokenised
 *         /owner/statement/[token] link (owners need no portal account).
 * Notes:  Agency-branded (EmailLayout default). Notification only — the financial figures stay behind the
 *         secure tokenised link, never in the email body. Owner email → footerVariant omitted (the
 *         subscription-state footer is agent-only, ADDENDUM_57G).
 */
import { EmailLayout, EmailButton } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"

const S = {
  body: { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 8px" },
  strong: { fontWeight: 600 as const, color: "#18181b" },
  muted: { fontSize: 13, color: "#71717a", margin: "12px 0 0" },
} as const

export interface StatementReadyEmailProps {
  branding: OrgBranding
  ownerName: string
  propertyLabel: string
  statementMonth: string   // e.g. "May 2026"
  statementUrl: string
}

export function buildStatementReadyElement(p: Readonly<StatementReadyEmailProps>) {
  return (
    <EmailLayout
      preview={`Your ${p.statementMonth} statement for ${p.propertyLabel} is ready to view`}
      branding={p.branding}
    >
      <p style={S.body}>Hi {p.ownerName},</p>
      <p style={S.body}>
        Your monthly owner statement for <strong style={S.strong}>{p.propertyLabel}</strong>,
        covering <strong style={S.strong}>{p.statementMonth}</strong>, is ready to view.
      </p>
      <p style={S.body}>
        It summarises the income collected, expenses, the management fee, and your net payout for the period.
      </p>
      <EmailButton href={p.statementUrl} accentColor={p.branding.accentColor}>
        View your statement →
      </EmailButton>
      <p style={S.muted}>
        This secure link is unique to you and expires in 90 days. If you have any questions about this
        statement, reply to this email or contact your managing agent.
      </p>
    </EmailLayout>
  )
}
