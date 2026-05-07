/**
 * lib/comms/CommExportPdf.tsx — Tribunal-ready communication audit PDF
 *
 * Data:   communication_log, communication_delivery_events passed as props
 * Notes:  Used by /api/legal/comm-export. Rendered server-side via renderToBuffer.
 *         body_full is HTML-stripped to plain text for PDF inclusion.
 *         BUILD_63 Phase 8 (§8.4).
 */

import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  page:          { padding: 40, fontSize: 9, fontFamily: "Helvetica", color: "#1a1a1a" },
  header:        { marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#ddd" },
  orgName:       { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  reportTitle:   { fontSize: 11, color: "#444", marginBottom: 8 },
  metaRow:       { flexDirection: "row", gap: 4, marginBottom: 3 },
  metaLabel:     { fontFamily: "Helvetica-Bold", color: "#555", minWidth: 80 },
  metaValue:     { color: "#1a1a1a", flex: 1 },
  sectionTitle:  { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 8, marginTop: 16, color: "#1a3a5c", textTransform: "uppercase", letterSpacing: 0.5 },
  commCard:      { border: 1, borderColor: "#e2e8f0", borderRadius: 4, marginBottom: 10, padding: 10 },
  commHeader:    { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  commCategory:  { fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1a3a5c" },
  commDate:      { color: "#666", fontSize: 8 },
  commSubject:   { fontSize: 9, marginBottom: 4, fontFamily: "Helvetica-Bold" },
  commMeta:      { flexDirection: "row", gap: 12, marginBottom: 6 },
  badge:         { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, fontSize: 7 },
  badgeMandatory:{ backgroundColor: "#fef3c7", color: "#92400e" },
  badgeChannel:  { backgroundColor: "#eff6ff", color: "#1e40af" },
  badgeStatus:   { backgroundColor: "#f0fdf4", color: "#166534" },
  bodyText:      { color: "#333", lineHeight: 1.5, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  evtRow:        { flexDirection: "row", gap: 8, marginBottom: 2 },
  evtTime:       { color: "#888", minWidth: 120 },
  evtType:       { color: "#444", flex: 1 },
  appendixTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  appendixNote:  { color: "#666", marginBottom: 12, lineHeight: 1.5 },
  pageNumber:    { position: "absolute", bottom: 24, right: 40, fontSize: 8, color: "#999" },
  divider:       { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 10 },
})

function stripHtml(html: string): string {
  let out = ""
  let inTag = false
  let lastSpace = true
  for (let i = 0; i < html.length; i++) {
    const ch = html[i]
    if (ch === "<") { inTag = true; continue }
    if (ch === ">") { inTag = false; if (!lastSpace) { out += " "; lastSpace = true } continue }
    if (inTag) continue
    const isWs = ch === " " || ch === "\n" || ch === "\r" || ch === "\t"
    if (isWs) { if (!lastSpace) { out += " "; lastSpace = true } continue }
    out += ch
    lastSpace = false
  }
  return out
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .trim()
    .slice(0, 1500)
}

function fmtDateTime(d: string): string {
  return new Date(d).toLocaleString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg",
  })
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

const CATEGORY_LABELS: Record<string, string> = {
  "rent.invoice_issued":        "Rent Invoice Issued",
  "rent.payment_received":      "Payment Received",
  "rent.monthly_statement":     "Monthly Statement",
  "arrears.letter_of_demand":   "Letter of Demand",
  "arrears.final_notice":       "Final Notice",
  "arrears.reminder_step1":     "Arrears Reminder (Step 1)",
  "arrears.reminder_step2":     "Arrears Reminder (Step 2)",
  "deposit.return_schedule":    "Deposit Deduction Schedule",
  "deposit.returned":           "Deposit Refund Notice",
  "deposit.received":           "Deposit Receipt",
  "inspection.move_in_report":  "Move-In Inspection Report",
  "inspection.dispute_window":  "Move-Out Dispute Window",
  "inspection.scheduled":       "Inspection Scheduled",
  "inspection.report_ready":    "Inspection Report",
  "lease.activated":            "Lease Activated",
  "lease.renewal_notice":       "CPA s14 Renewal Notice",
  "lease.expiry_reminder":      "Lease Expiry Reminder",
  "lease.terminated":           "Lease Termination",
  "maintenance.emergency":      "Emergency Notice",
  "portal.tenant_invite":       "Portal Invite",
  "notice.delivery_fallback":   "Delivery Alert (Side Channel)",
}

const MANDATORY_KEYS = new Set([
  "arrears.letter_of_demand", "arrears.final_notice",
  "deposit.return_schedule", "deposit.returned",
  "inspection.move_in_report", "inspection.dispute_window",
  "lease.renewal_notice", "lease.expiry_reminder", "lease.terminated",
  "maintenance.emergency",
])

export interface CommExportDeliveryEvent {
  event_type: string
  provider:   string
  occurred_at: string
}

export interface CommExportComm {
  id:                    string
  subject:               string | null
  template_key:          string | null
  channel:               string
  direction:             string
  status:                string | null
  created_at:            string
  body_full:             string | null
  tone_variant:          string | null
  attempt_number:        number
  trigger_event_type:    string | null
  delivery_events:       CommExportDeliveryEvent[]
}

export interface CommExportProps {
  orgName:      string
  tenantName:   string
  propertyLabel: string
  leaseFrom:    string | null
  leaseTo:      string | null
  exportedAt:   string
  comms:        CommExportComm[]
}

export function CommExportPdf(props: CommExportProps) {
  const { orgName, tenantName, propertyLabel, leaseFrom, leaseTo, exportedAt, comms } = props

  return (
    <Document title={`Communication Audit — ${tenantName}`} author={orgName}>
      <Page size="A4" style={styles.page}>
        {/* Cover / header */}
        <View style={styles.header}>
          <Text style={styles.orgName}>{orgName}</Text>
          <Text style={styles.reportTitle}>Communication Audit Report — Tribunal Ready</Text>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Tenant:</Text><Text style={styles.metaValue}>{tenantName}</Text></View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Property:</Text><Text style={styles.metaValue}>{propertyLabel}</Text></View>
          {leaseFrom && <View style={styles.metaRow}><Text style={styles.metaLabel}>Lease period:</Text><Text style={styles.metaValue}>{fmtDate(leaseFrom)}{leaseTo ? ` — ${fmtDate(leaseTo)}` : " (active)"}</Text></View>}
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Total comms:</Text><Text style={styles.metaValue}>{comms.length}</Text></View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Mandatory:</Text><Text style={styles.metaValue}>{comms.filter(c => MANDATORY_KEYS.has(c.template_key ?? "")).length}</Text></View>
          <View style={styles.metaRow}><Text style={styles.metaLabel}>Exported:</Text><Text style={styles.metaValue}>{fmtDateTime(exportedAt)}</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Communication Timeline</Text>

        {comms.map((comm) => {
          const label = CATEGORY_LABELS[comm.template_key ?? ""] ?? (comm.template_key ?? "Communication")
          const isMandatory = MANDATORY_KEYS.has(comm.template_key ?? "")
          const plainBody = comm.body_full ? stripHtml(comm.body_full) : null

          return (
            <View key={comm.id} style={styles.commCard} wrap={false}>
              <View style={styles.commHeader}>
                <Text style={styles.commCategory}>{label}</Text>
                <Text style={styles.commDate}>{fmtDateTime(comm.created_at)}</Text>
              </View>
              {comm.subject && <Text style={styles.commSubject}>{comm.subject}</Text>}
              <View style={styles.commMeta}>
                <Text style={[styles.badge, styles.badgeChannel]}>{comm.channel.toUpperCase()}</Text>
                {comm.status && <Text style={[styles.badge, styles.badgeStatus]}>{comm.status}</Text>}
                {isMandatory && <Text style={[styles.badge, styles.badgeMandatory]}>MANDATORY</Text>}
                {comm.tone_variant && comm.tone_variant !== "n/a" && (
                  <Text style={[styles.badge, { backgroundColor: "#f3f4f6", color: "#374151" }]}>{comm.tone_variant}</Text>
                )}
                {comm.attempt_number > 1 && (
                  <Text style={[styles.badge, { backgroundColor: "#fef2f2", color: "#991b1b" }]}>Retry #{comm.attempt_number}</Text>
                )}
              </View>
              {comm.delivery_events.length > 0 && (
                <View>
                  {comm.delivery_events.map((evt, i) => (
                    <View key={i} style={styles.evtRow}>
                      <Text style={styles.evtTime}>{fmtDateTime(evt.occurred_at)}</Text>
                      <Text style={styles.evtType}>{evt.event_type.replace(/_/g, " ")} via {evt.provider}</Text>
                    </View>
                  ))}
                </View>
              )}
              {plainBody && (
                <View style={styles.bodyText}>
                  <Text>{plainBody}</Text>
                </View>
              )}
            </View>
          )
        })}

        {/* Appendix */}
        <View style={styles.divider} />
        <Text style={styles.appendixTitle}>Appendix A — Portal Login Data</Text>
        <Text style={styles.appendixNote}>
          Portal login audit records are stored in the platform audit log under the tenant entity.
          This export was generated on {fmtDateTime(exportedAt)}.
          For portal-view events on individual communications, refer to the delivery events
          listed above (event_type: portal_view, provider: pleks_portal).
          Full portal session data including auth method, IP hash, and device category
          is available upon request via the platform administrator.
        </Text>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
