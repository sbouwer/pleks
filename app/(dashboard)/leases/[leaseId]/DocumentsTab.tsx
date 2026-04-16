"use client"

import { useState } from "react"
import { FileText, Mail, MessageSquare, FileWarning, Settings, BarChart3, Upload, Send } from "lucide-react"

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface CommLogRow {
  id: string
  channel: string
  direction: string
  subject: string | null
  template_key: string | null
  status: string | null
  sent_by: string | null
  sent_to_email: string | null
  sent_to_phone: string | null
  recipient_name: string | null
  created_at: string
}

export interface LeaseDocRow {
  id: string
  doc_type: string
  title: string
  storage_path: string
  file_size_bytes: number | null
  generated_by: string | null
  created_at: string
}

interface DocumentsTabProps {
  leaseId: string
  orgId: string
  signedLeasePath: string | null
  communicationLog: CommLogRow[]
  leaseDocuments: LeaseDocRow[]
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

type FilterPill = "all" | "lease_documents" | "emails" | "sms" | "letters" | "system"

const FILTER_PILLS: { id: FilterPill; label: string }[] = [
  { id: "all",             label: "All" },
  { id: "lease_documents", label: "Lease documents" },
  { id: "emails",          label: "Emails" },
  { id: "sms",             label: "SMS" },
  { id: "letters",         label: "Letters" },
  { id: "system",          label: "System" },
]

const STATUS_PILLS: Record<string, { label: string; className: string }> = {
  sent:      { label: "Sent",      className: "bg-blue-500/10 text-blue-600" },
  delivered: { label: "Delivered", className: "bg-green-500/10 text-green-600" },
  read:      { label: "Opened",    className: "bg-green-500/10 text-green-600" },
  failed:    { label: "Failed",    className: "bg-red-500/10 text-red-600" },
  logged:    { label: "Logged",    className: "bg-muted text-muted-foreground" },
  received:  { label: "Received",  className: "bg-blue-500/10 text-blue-600" },
}

// Icon + colour per doc/comm category
const ICON_EMAIL   = { icon: Mail,         bg: "bg-blue-500/10",   fg: "text-blue-600" }
const ICON_SMS     = { icon: MessageSquare, bg: "bg-green-500/10",  fg: "text-green-600" }
const ICON_PDF     = { icon: FileText,      bg: "bg-red-500/10",    fg: "text-red-600" }
const ICON_LEGAL   = { icon: FileWarning,   bg: "bg-purple-500/10", fg: "text-purple-600" }
const ICON_SYSTEM  = { icon: Settings,      bg: "bg-muted",         fg: "text-muted-foreground" }
const ICON_REPORT  = { icon: BarChart3,     bg: "bg-muted",         fg: "text-muted-foreground" }

const LEGAL_DOC_TYPES = new Set(["lod", "s14_notice", "section_4_notice", "tribunal_submission"])
const STATEMENT_TYPES = new Set(["statement_tenant", "statement_owner", "inspection_report"])

// ─────────────────────────────────────────────────────────────
// Helper functions
// ─────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
  })
}

function fmtFileSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function templateLabel(key: string | null): string {
  if (!key) return "Email"
  const map: Record<string, string> = {
    "arrears.notice_level1":    "Arrears notice (level 1)",
    "arrears.notice_level2":    "Arrears notice (level 2)",
    "arrears.notice_level3":    "Arrears notice (level 3)",
    "arrears.reminder":         "Arrears reminder",
    "inspection.scheduled":     "Inspection scheduled",
    "lease.signing_link":       "Lease for signing",
    "lease.welcome_pack":       "Tenant welcome pack",
    "lease.escalation_notice":  "Escalation notice",
    "lease.renewal_offer":      "Renewal offer",
    "reports.welcome_pack":     "Portfolio overview",
  }
  return map[key] ?? key.replaceAll(".", " / ").replaceAll("_", " ")
}

function docTypeLabel(docType: string): string {
  const map: Record<string, string> = {
    signed_lease:          "Signed lease agreement",
    welcome_pack_tenant:   "Tenant welcome pack",
    welcome_pack_landlord: "Landlord welcome pack",
    lod:                   "Letter of demand",
    s14_notice:            "s14 notice (CPA auto-renewal)",
    section_4_notice:      "Section 4 notice (eviction)",
    tribunal_submission:   "Tribunal submission",
    statement_tenant:      "Tenant statement",
    statement_owner:       "Owner statement",
    inspection_report:     "Inspection report",
    amendment:             "Lease amendment",
    other:                 "Document",
  }
  return map[docType] ?? docType.replaceAll("_", " ")
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function StatusPill({ status }: Readonly<{ status: string | null }>) {
  if (!status) return null
  const conf = STATUS_PILLS[status]
  if (!conf) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${conf.className}`}>
      {conf.label}
    </span>
  )
}

function DocIconBadge({ bg, fg, Icon }: Readonly<{ bg: string; fg: string; Icon: React.ElementType }>) {
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${bg}`}>
      <Icon className={`size-4 ${fg}`} />
    </div>
  )
}

function EmptyRow({ message }: Readonly<{ message: string }>) {
  return (
    <div className="py-3 px-4 text-xs text-muted-foreground italic">{message}</div>
  )
}

function SectionHeader({ title }: Readonly<{ title: string }>) {
  return (
    <div className="px-4 py-2 bg-muted/40 border-b border-t border-border">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Section renderers
// ─────────────────────────────────────────────────────────────

function LeaseDocumentRows({
  leaseDocuments,
  signedLeasePath,
  filter,
}: Readonly<{
  leaseDocuments: LeaseDocRow[]
  signedLeasePath: string | null
  filter: FilterPill
}>) {
  const show = filter === "all" || filter === "lease_documents"
  if (!show) return null

  const leaseDocs = leaseDocuments.filter((d) => !LEGAL_DOC_TYPES.has(d.doc_type) && !STATEMENT_TYPES.has(d.doc_type))
  const hasSignedLease = signedLeasePath || leaseDocs.some((d) => d.doc_type === "signed_lease")

  return (
    <>
      <SectionHeader title="Lease documents" />
      {!hasSignedLease && leaseDocs.length === 0 ? (
        <EmptyRow message="No lease documents uploaded yet." />
      ) : (
        <>
          {signedLeasePath && !leaseDocs.some((d) => d.doc_type === "signed_lease") && (
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
              <DocIconBadge bg={ICON_PDF.bg} fg={ICON_PDF.fg} Icon={ICON_PDF.icon} />
              <div className="flex flex-1 items-center justify-between min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Signed lease agreement</p>
                  <p className="text-xs text-muted-foreground">Uploaded</p>
                </div>
                <a
                  href={`/api/documents/lease?path=${encodeURIComponent(signedLeasePath)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 shrink-0 text-xs text-brand hover:underline"
                >
                  Download
                </a>
              </div>
            </div>
          )}
          {leaseDocs.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
              <DocIconBadge
                bg={doc.doc_type === "amendment" ? ICON_LEGAL.bg : ICON_PDF.bg}
                fg={doc.doc_type === "amendment" ? ICON_LEGAL.fg : ICON_PDF.fg}
                Icon={ICON_PDF.icon}
              />
              <div className="flex flex-1 items-center justify-between min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{doc.title || docTypeLabel(doc.doc_type)}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDate(doc.created_at)}
                    {doc.file_size_bytes ? ` · ${fmtFileSize(doc.file_size_bytes)}` : ""}
                  </p>
                </div>
                <a
                  href={`/api/documents/lease?path=${encodeURIComponent(doc.storage_path)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 shrink-0 text-xs text-brand hover:underline"
                >
                  Download
                </a>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}

function EmailRows({
  communicationLog,
  filter,
}: Readonly<{ communicationLog: CommLogRow[]; filter: FilterPill }>) {
  const show = filter === "all" || filter === "emails"
  if (!show) return null

  const automated = communicationLog.filter((c) => c.channel === "email" && c.template_key)
  const manual = communicationLog.filter((c) => c.channel === "email" && !c.template_key)

  return (
    <>
      <SectionHeader title="Automated emails" />
      {automated.length === 0 ? (
        <EmptyRow message="No automated emails sent yet." />
      ) : (
        automated.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
            <DocIconBadge bg={ICON_EMAIL.bg} fg={ICON_EMAIL.fg} Icon={ICON_EMAIL.icon} />
            <div className="flex flex-1 items-center justify-between min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{templateLabel(c.template_key)}</p>
                <p className="text-xs text-muted-foreground">
                  To: {c.sent_to_email ?? c.recipient_name ?? "—"} · {fmtDate(c.created_at)}
                </p>
              </div>
              <StatusPill status={c.status} />
            </div>
          </div>
        ))
      )}

      <SectionHeader title="Manual correspondence" />
      {manual.length === 0 ? (
        <EmptyRow message="No manual emails logged." />
      ) : (
        manual.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
            <DocIconBadge bg={ICON_EMAIL.bg} fg={ICON_EMAIL.fg} Icon={ICON_EMAIL.icon} />
            <div className="flex flex-1 items-center justify-between min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{c.subject ?? "Email"}</p>
                <p className="text-xs text-muted-foreground">
                  {c.direction === "inbound" ? "From" : "To"}: {c.sent_to_email ?? c.recipient_name ?? "—"} · {fmtDate(c.created_at)}
                </p>
              </div>
              <StatusPill status={c.status} />
            </div>
          </div>
        ))
      )}
    </>
  )
}

function LettersRows({
  leaseDocuments,
  filter,
}: Readonly<{ leaseDocuments: LeaseDocRow[]; filter: FilterPill }>) {
  const show = filter === "all" || filter === "letters"
  if (!show) return null

  const docs = leaseDocuments.filter((d) => LEGAL_DOC_TYPES.has(d.doc_type))

  return (
    <>
      <SectionHeader title="Letters &amp; legal" />
      {docs.length === 0 ? (
        <EmptyRow message="LOD, s14 notices, and Tribunal submissions appear here." />
      ) : (
        docs.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
            <DocIconBadge bg={ICON_LEGAL.bg} fg={ICON_LEGAL.fg} Icon={ICON_LEGAL.icon} />
            <div className="flex flex-1 items-center justify-between min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{doc.title || docTypeLabel(doc.doc_type)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(doc.created_at)}
                  {doc.file_size_bytes ? ` · ${fmtFileSize(doc.file_size_bytes)}` : ""}
                </p>
              </div>
              <a
                href={`/api/documents/lease?path=${encodeURIComponent(doc.storage_path)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 shrink-0 text-xs text-brand hover:underline"
              >
                Download
              </a>
            </div>
          </div>
        ))
      )}
    </>
  )
}

function SmsRows({
  communicationLog,
  filter,
}: Readonly<{ communicationLog: CommLogRow[]; filter: FilterPill }>) {
  const show = filter === "all" || filter === "sms"
  if (!show) return null

  const smsList = communicationLog.filter((c) => c.channel === "sms")

  return (
    <>
      <SectionHeader title="SMS" />
      {smsList.length === 0 ? (
        <EmptyRow message="No SMS messages logged." />
      ) : (
        smsList.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
            <DocIconBadge bg={ICON_SMS.bg} fg={ICON_SMS.fg} Icon={ICON_SMS.icon} />
            <div className="flex flex-1 items-center justify-between min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{templateLabel(c.template_key) || c.subject || "SMS"}</p>
                <p className="text-xs text-muted-foreground">
                  To: {c.sent_to_phone ?? c.recipient_name ?? "—"} · {fmtDate(c.created_at)}
                </p>
              </div>
              <StatusPill status={c.status} />
            </div>
          </div>
        ))
      )}
    </>
  )
}

function StatementsRows({
  leaseDocuments,
  filter,
}: Readonly<{ leaseDocuments: LeaseDocRow[]; filter: FilterPill }>) {
  const show = filter === "all" || filter === "system"
  if (!show) return null

  const systemGenerated = leaseDocuments.filter((d) => STATEMENT_TYPES.has(d.doc_type))

  return (
    <>
      <SectionHeader title="Statements &amp; reports" />
      {systemGenerated.length === 0 ? (
        <EmptyRow message="Tenant statements and inspection reports appear here." />
      ) : (
        systemGenerated.map((doc) => (
          <div key={doc.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors">
            <DocIconBadge bg={ICON_REPORT.bg} fg={ICON_REPORT.fg} Icon={ICON_SYSTEM.icon} />
            <div className="flex flex-1 items-center justify-between min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{doc.title || docTypeLabel(doc.doc_type)}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(doc.created_at)}
                  {doc.file_size_bytes ? ` · ${fmtFileSize(doc.file_size_bytes)}` : ""}
                </p>
              </div>
              <a
                href={`/api/documents/lease?path=${encodeURIComponent(doc.storage_path)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 shrink-0 text-xs text-brand hover:underline"
              >
                Download
              </a>
            </div>
          </div>
        ))
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

export function DocumentsTab({
  leaseId,
  signedLeasePath,
  communicationLog,
  leaseDocuments,
}: Readonly<DocumentsTabProps>) {
  const [activeFilter, setActiveFilter] = useState<FilterPill>("all")

  return (
    <div className="space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { /* upload modal — future */ }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Upload className="size-3.5" />
          Upload document
        </button>
        <button
          onClick={() => { /* email modal — future */ }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Send className="size-3.5" />
          Send manual email
        </button>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill.id}
            onClick={() => setActiveFilter(pill.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeFilter === pill.id
                ? "bg-brand text-white"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <LeaseDocumentRows
          leaseDocuments={leaseDocuments}
          signedLeasePath={signedLeasePath}
          filter={activeFilter}
        />
        <EmailRows communicationLog={communicationLog} filter={activeFilter} />
        <LettersRows leaseDocuments={leaseDocuments} filter={activeFilter} />
        <SmsRows communicationLog={communicationLog} filter={activeFilter} />
        <StatementsRows leaseDocuments={leaseDocuments} filter={activeFilter} />

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-muted/20">
          <a
            href={`/leases/${leaseId}/communications`}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View full communication history →
          </a>
        </div>
      </div>
    </div>
  )
}
