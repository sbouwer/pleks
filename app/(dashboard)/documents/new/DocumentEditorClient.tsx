"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Send, FileDown, Save, AlertTriangle } from "lucide-react"
import { RichTextEditor, type RichTextEditorHandle } from "@/components/ui/RichTextEditor"
import type { DocumentTemplate } from "@/app/(dashboard)/settings/communication/templates/page"
import {
  sendDocument,
  generateDocumentPdf,
  saveDraftDocument,
} from "@/lib/actions/documents"

// ─── Types ───────────────────────────────────────────────────────────────────

interface LeaseContext {
  leaseId: string
  tenantName: string
  unitNumber: string
  propertyName: string
  rentCents: number
}

interface SignatureContext {
  storagePath: string
  signedUrl: string | null
}

interface DocumentEditorClientProps {
  allTemplates: DocumentTemplate[]
  selectedTemplate: DocumentTemplate | null
  leaseContext: LeaseContext | null
  signatureContext: SignatureContext | null
  orgName: string
  agentName: string
}

// ─── Merge field chips ───────────────────────────────────────────────────────

const MERGE_FIELDS: { field: string; label: string }[] = [
  { field: "{{tenant.full_name}}", label: "Tenant name" },
  { field: "{{unit.number}}", label: "Unit" },
  { field: "{{property.name}}", label: "Property" },
  { field: "{{lease.rent_amount}}", label: "Rent amount" },
  { field: "{{arrears.total}}", label: "Arrears total" },
  { field: "{{today}}", label: "Today" },
  { field: "{{agent.name}}", label: "Agent name" },
]

// ─── Sample values for preview ───────────────────────────────────────────────

function buildPreviewValues(
  lease: LeaseContext | null,
  agentName: string
): Record<string, string> {
  const today = new Date().toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  if (lease) {
    return {
      "tenant.full_name": lease.tenantName,
      "unit.number": lease.unitNumber,
      "property.name": lease.propertyName,
      "lease.rent_amount": `R ${(lease.rentCents / 100).toFixed(2)}`,
      "arrears.total": "R 0.00",
      today,
      "agent.name": agentName,
    }
  }

  return {
    "tenant.full_name": "Jane Smith",
    "unit.number": "12",
    "property.name": "Sunview Estate",
    "lease.rent_amount": "R 8,500.00",
    "arrears.total": "R 0.00",
    today,
    "agent.name": agentName,
  }
}

function resolvePreview(body: string, values: Record<string, string>): string {
  let resolved = body
  for (const [key, value] of Object.entries(values)) {
    resolved = resolved.replaceAll(`{{${key}}}`, `<span class="text-brand font-medium">${value}</span>`)
  }
  // Highlight unresolved merge fields
  resolved = resolved.replaceAll(
    /\{\{[^{}\n]+\}\}/g,
    (m) => `<span class="bg-amber-100 text-amber-700 rounded px-0.5">${m}</span>`
  )
  return resolved
}

// ─── Legal flag banner ───────────────────────────────────────────────────────

function LegalFlagBanner({
  flag,
}: {
  flag: "wet_ink_only" | "aes_recommended" | null
}) {
  if (!flag) return null

  if (flag === "wet_ink_only") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 mb-4">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
        <span>
          This template requires <strong>wet ink signatures</strong> — electronic
          signatures are not accepted for this document type.
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700 mb-4">
      <AlertTriangle className="size-4 shrink-0 mt-0.5" />
      <span>
        <strong>AES recommended</strong> — an advanced electronic signature is
        recommended for this document type.
      </span>
    </div>
  )
}

// ─── Document preview pane ───────────────────────────────────────────────────

interface PreviewPaneProps {
  bodyHtml: string
  orgName: string
  agentName: string
  signatureUrl: string | null
  leaseContext: LeaseContext | null
  legalFlag: "wet_ink_only" | "aes_recommended" | null
}

function PreviewPane({
  bodyHtml,
  orgName,
  agentName,
  signatureUrl,
  leaseContext,
  legalFlag,
}: PreviewPaneProps) {
  const previewValues = buildPreviewValues(leaseContext, agentName)
  const resolvedHtml = resolvePreview(bodyHtml, previewValues)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </p>
        <Badge variant="secondary" className="text-xs">
          {leaseContext ? "Live data" : "Sample data"}
        </Badge>
      </div>

      <LegalFlagBanner flag={legalFlag} />

      {/* A4-ish document card */}
      <div className="flex-1 overflow-auto">
        <div className="bg-white shadow-md rounded-lg overflow-hidden w-full max-w-[600px] mx-auto text-[13px] text-gray-900">
          {/* Letterhead */}
          <div className="bg-gray-50 border-b border-gray-200 px-8 py-5">
            <p className="font-bold text-base text-gray-900">{orgName}</p>
            {leaseContext && (
              <p className="text-xs text-gray-500 mt-0.5">
                Re: {leaseContext.propertyName}
                {leaseContext.unitNumber ? ` — Unit ${leaseContext.unitNumber}` : ""}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date().toLocaleDateString("en-ZA", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

          {/* Body */}
          <div
            className="px-8 py-6 min-h-[300px] prose prose-sm max-w-none leading-relaxed"
            dangerouslySetInnerHTML={{ __html: resolvedHtml || "<p class='text-gray-400 italic'>Your document body will appear here…</p>" }}
          />

          {/* Signature section */}
          <div className="px-8 pb-8 pt-2">
            <p className="text-gray-600 text-sm mb-4">Yours faithfully,</p>
            {signatureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signatureUrl}
                alt="Agent signature"
                className="h-12 max-w-[180px] object-contain mb-1"
              />
            ) : (
              <div className="h-10 w-40 border-b border-gray-300 mb-1" />
            )}
            <p className="text-sm font-medium text-gray-700">{agentName}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CS window helpers ───────────────────────────────────────────────────────

function formatTimeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return "expired"
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// ─── Main editor component ───────────────────────────────────────────────────

export function DocumentEditorClient({
  allTemplates,
  selectedTemplate: initialTemplate,
  leaseContext,
  signatureContext,
  orgName,
  agentName,
}: DocumentEditorClientProps) {
  const [activeTemplate, setActiveTemplate] = useState<DocumentTemplate | null>(
    initialTemplate
  )
  const [bodyHtml, setBodyHtml] = useState(
    initialTemplate?.body_html ?? ""
  )
  const [subject, setSubject] = useState(
    initialTemplate?.subject ?? ""
  )
  const [recipientEmail, setRecipientEmail] = useState("")
  const [jobId, setJobId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const editorRef = useRef<RichTextEditorHandle>(null)
  const [csWindow, setCsWindow] = useState<{ isActive: boolean; expiresAt: string | null }>({
    isActive: false,
    expiresAt: null,
  })

  const leaseId = leaseContext?.leaseId ?? null

  useEffect(() => {
    if (!leaseId) return
    let cancelled = false
    async function loadCsWindow() {
      const { getActiveCsWindow } = await import("@/lib/actions/documents")
      const result = await getActiveCsWindow(leaseId!)
      if (!cancelled) setCsWindow(result)
    }
    loadCsWindow()
    return () => { cancelled = true }
  }, [leaseId])

  function handleTemplateChange(id: string) {
    const t = allTemplates.find((tmpl) => tmpl.id === id) ?? null
    setActiveTemplate(t)
    setBodyHtml(t?.body_html ?? "")
    setSubject(t?.subject ?? "")
  }

  function insertMergeField(field: string) {
    editorRef.current?.insertText(field)
  }

  function buildFormData(): FormData {
    const fd = new FormData()
    if (activeTemplate) fd.set("template_id", activeTemplate.id)
    if (leaseContext) fd.set("lease_id", leaseContext.leaseId)
    fd.set("body_html", bodyHtml)
    fd.set("subject", subject)
    fd.set("recipient_email", recipientEmail)
    if (jobId) fd.set("job_id", jobId)
    return fd
  }

  function handleSaveAndEmail() {
    if (!recipientEmail) {
      toast.error("Please enter a recipient email address")
      return
    }
    startTransition(async () => {
      const result = await sendDocument(buildFormData())
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Document sent successfully")
      }
    })
  }

  function handleDownloadPdf() {
    startTransition(async () => {
      const result = await generateDocumentPdf(buildFormData())
      if (result.error) {
        toast.error(result.error)
      } else if (result.printUrl) {
        // Open print-ready HTML in a new tab; the page auto-triggers window.print()
        if (jobId === null && result.printUrl) {
          // Extract job ID from print URL so Save Draft button syncs
          const match = /\/documents\/([^/]+)\/print/.exec(result.printUrl)
          if (match) setJobId(match[1])
        }
        window.open(result.printUrl, "_blank")
      }
    })
  }

  function handleSaveDraft() {
    startTransition(async () => {
      const result = await saveDraftDocument(buildFormData())
      if (result.error) {
        toast.error(result.error)
      } else {
        if (result.id) setJobId(result.id)
        toast.success("Draft saved")
      }
    })
  }

  const legalFlag = activeTemplate?.legal_flag ?? null

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Split pane */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0 overflow-hidden border border-border rounded-lg">

        {/* ── Left: Editor ── */}
        <div className="flex flex-col overflow-hidden border-r border-border">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Editor
            </p>

            {/* Template selector */}
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand/40 mb-2"
              value={activeTemplate?.id ?? ""}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">— No template —</option>
              {allTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.scope === "system" ? " (System)" : ""}
                </option>
              ))}
            </select>

            {/* Lease context pill */}
            {leaseContext && (
              <div className="flex items-center gap-1.5 mb-2">
                <Badge variant="secondary" className="text-xs">
                  Lease: {leaseContext.tenantName}
                  {leaseContext.unitNumber ? ` — Unit ${leaseContext.unitNumber}` : ""}
                </Badge>
              </div>
            )}

            {/* Subject */}
            <Input
              placeholder="Subject (for email delivery)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 text-sm mb-2"
            />

            {/* Recipient */}
            <Input
              type="email"
              placeholder="Recipient email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          {/* Body editor */}
          <div className="flex-1 overflow-hidden flex flex-col px-4 pt-3">
            <RichTextEditor
              ref={editorRef}
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Dear {{tenant.full_name}}, your rent of {{lease.rent_amount}} is due on the 1st of each month."
              className="flex-1"
              minHeight="200px"
            />
          </div>

          {/* Merge field chips */}
          <div className="px-4 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2">
              Insert merge field:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MERGE_FIELDS.map(({ field, label }) => (
                <button
                  key={field}
                  type="button"
                  onClick={() => insertMergeField(field)}
                  className="px-2 py-0.5 rounded bg-muted text-xs font-mono hover:bg-brand/10 hover:text-brand transition-colors"
                  title={field}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Preview ── */}
        <div className="flex flex-col overflow-hidden bg-gray-50">
          <div className="flex-1 overflow-auto p-4">
            <PreviewPane
              bodyHtml={bodyHtml}
              orgName={orgName}
              agentName={agentName}
              signatureUrl={signatureContext?.signedUrl ?? null}
              leaseContext={leaseContext}
              legalFlag={legalFlag}
            />
          </div>
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 py-3 px-1 border-t border-border mt-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveDraft}
            disabled={isPending}
          >
            <Save className="size-4 mr-1.5" />
            Save draft
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {csWindow.isActive && csWindow.expiresAt && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("Free-text WhatsApp available — coming soon")}
              >
                Send via WhatsApp
              </Button>
              <span className="text-xs text-muted-foreground">
                Free window: {formatTimeRemaining(csWindow.expiresAt)}
              </span>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isPending}
          >
            <FileDown className="size-4 mr-1.5" />
            Download PDF
          </Button>
          <Button
            size="sm"
            onClick={handleSaveAndEmail}
            disabled={isPending || !recipientEmail}
          >
            <Send className="size-4 mr-1.5" />
            {isPending ? "Sending…" : "Save & email"}
          </Button>
        </div>
      </div>
    </div>
  )
}
