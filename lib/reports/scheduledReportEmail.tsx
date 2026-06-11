/**
 * lib/reports/scheduledReportEmail.tsx — deliver a Firm-tier scheduled report by email
 *
 * Notes: O-1 — the scheduled-reports cron built + stored the report HTML but never emailed it (just stamped
 *        last_sent_at). This sends the "report ready" email with a signed download link (30-day TTL) to each
 *        configured recipient. Agency-branded. Lives in a .tsx so the route handler (.ts) stays JSX-free.
 */
import { EmailLayout, EmailButton } from "@/lib/comms/templates/layout"
import type { OrgBranding } from "@/lib/comms/templates/layout"
import { sendEmail } from "@/lib/comms/send-email"

const REPORT_LABELS: Record<string, string> = {
  portfolio_summary: "Portfolio summary",
  rent_roll:         "Rent roll",
  arrears_aging:     "Arrears aging",
  income_collection: "Income & collection",
}

export function reportLabel(reportType: string): string {
  return REPORT_LABELS[reportType] ?? "Report"
}

export async function sendScheduledReportEmail(params: {
  orgId: string
  configId: string
  email: string
  recipientName: string
  reportType: string
  periodLabel: string
  downloadUrl: string
  branding: OrgBranding
}) {
  const label = reportLabel(params.reportType)
  return sendEmail({
    orgId:       params.orgId,
    templateKey: "reports.scheduled",
    to:          { email: params.email, name: params.recipientName },
    subject:     `${label} — ${params.periodLabel}`,
    emailElement: (
      <EmailLayout preview={`Your ${label} report is ready`} branding={params.branding}>
        <p style={{ fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 12px" }}>
          Your scheduled <strong>{label}</strong> report for {params.periodLabel} is ready to download.
        </p>
        <EmailButton href={params.downloadUrl} accentColor={params.branding.accentColor}>Download report →</EmailButton>
        <p style={{ fontSize: 12, color: "#71717a", margin: "16px 0 0" }}>This secure link is valid for 30 days.</p>
      </EmailLayout>
    ),
    bodyPreview: `Your ${label} report for ${params.periodLabel} is ready to download.`,
    entityType:  "report_config",
    entityId:    params.configId,
  })
}
