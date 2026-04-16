"use client"

import { useState, useTransition, useRef } from "react"
import { uploadPropertyDocument, deletePropertyDocument, getDocumentSignedUrl } from "@/lib/actions/documents"
import { Button } from "@/components/ui/button"
import { FileText, FileWarning, ShieldCheck, Home, FolderOpen, Upload, Trash2, ExternalLink, Loader2 } from "lucide-react"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { toast } from "sonner"

// ── Doc types + categories ────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: "title_deed",             label: "Title deed",             category: "legal" },
  { value: "rates_clearance",        label: "Rates clearance",        category: "legal" },
  { value: "plans",                  label: "Building plans",         category: "legal" },
  { value: "electrical_coc",         label: "Electrical CoC",         category: "compliance" },
  { value: "gas_coc",                label: "Gas CoC",                category: "compliance" },
  { value: "beetle_coc",             label: "Beetle CoC",             category: "compliance" },
  { value: "compliance_certificate", label: "Compliance certificate", category: "compliance" },
  { value: "levy_schedule",          label: "Levy schedule",          category: "hoa" },
  { value: "insurance",              label: "Insurance policy",       category: "insurance" },
  { value: "other",                  label: "Other",                  category: "other" },
] as const

const CATEGORIES = [
  { key: "legal",      label: "Legal & title",       hint: "Title deeds, rates clearances, building plans" },
  { key: "compliance", label: "Compliance",           hint: "Electrical, gas, beetle CoCs" },
  { key: "hoa",        label: "HOA / Body corporate", hint: "Levy schedules, conduct rules" },
  { key: "insurance",  label: "Insurance",            hint: "Building insurance, geyser warranty" },
  { key: "other",      label: "Other",                hint: "Municipal accounts, floor plans" },
] as const

type CategoryKey = (typeof CATEGORIES)[number]["key"]

type FilterPill = "all" | CategoryKey

const FILTER_PILLS: { id: FilterPill; label: string }[] = [
  { id: "all",        label: "All" },
  { id: "legal",      label: "Legal & title" },
  { id: "compliance", label: "Compliance" },
  { id: "hoa",        label: "HOA" },
  { id: "insurance",  label: "Insurance" },
  { id: "other",      label: "Other" },
]

// ── Icon config per category ──────────────────────────────────────────────────

const CATEGORY_ICON: Record<CategoryKey, { Icon: React.ElementType; bg: string; fg: string }> = {
  legal:      { Icon: FileText,    bg: "bg-purple-500/10", fg: "text-purple-600" },
  compliance: { Icon: ShieldCheck, bg: "bg-blue-500/10",   fg: "text-blue-600"   },
  hoa:        { Icon: Home,        bg: "bg-amber-500/10",  fg: "text-amber-600"  },
  insurance:  { Icon: FileWarning, bg: "bg-green-500/10",  fg: "text-green-600"  },
  other:      { Icon: FolderOpen,  bg: "bg-muted",         fg: "text-muted-foreground" },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryOf(docType: string): CategoryKey {
  return (DOC_TYPES.find((d) => d.value === docType)?.category ?? "other") as CategoryKey
}

function typeLabel(value: string): string {
  return DOC_TYPES.find((d) => d.value === value)?.label ?? value
}

function fmtDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

function daysUntilExpiry(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PropertyDocument {
  id: string
  name: string
  document_type: string
  storage_path: string
  expiry_date: string | null
  notes: string | null
  created_at: string
}

interface PropertyDocumentsTabProps {
  readonly propertyId: string
  readonly initialDocuments: PropertyDocument[]
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DocIconBadge({ category }: Readonly<{ category: CategoryKey }>) {
  const { Icon, bg, fg } = CATEGORY_ICON[category]
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${bg}`}>
      <Icon className={`size-4 ${fg}`} />
    </div>
  )
}

function SectionHeader({ title, hint }: Readonly<{ title: string; hint: string }>) {
  return (
    <div className="px-4 py-2 bg-muted/40 border-b border-t border-border">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="ml-2 normal-case font-normal tracking-normal text-muted-foreground/60">{hint}</span>
      </p>
    </div>
  )
}

function EmptyRow({ message }: Readonly<{ message: string }>) {
  return (
    <div className="py-3 px-4 text-xs text-muted-foreground italic">{message}</div>
  )
}

function ExpiryBadge({ date }: Readonly<{ date: string | null }>) {
  if (!date) return null
  const daysLeft = daysUntilExpiry(date)
  const expired  = daysLeft < 0
  const soon     = daysLeft >= 0 && daysLeft <= 30
  if (!expired && !soon) return null
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
      expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
    }`}>
      {expired ? "Expired" : `${daysLeft}d`}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function PropertyDocumentsTab({ propertyId, initialDocuments }: PropertyDocumentsTabProps) {
  const [documents, setDocuments]   = useState(initialDocuments)
  const [showForm, setShowForm]     = useState(false)
  const [expiryDate, setExpiryDate] = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterPill>("all")
  const [uploading, startUpload]    = useTransition()
  const [deleting, startDelete]     = useTransition()
  const [openingId, setOpeningId]   = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startUpload(async () => {
      const result = await uploadPropertyDocument(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Document uploaded")
        setShowForm(false)
        setExpiryDate("")
        formRef.current?.reset()
      }
    })
  }

  async function handleOpen(doc: PropertyDocument) {
    setOpeningId(doc.id)
    const url = await getDocumentSignedUrl(doc.storage_path)
    setOpeningId(null)
    if (url) window.open(url, "_blank", "noopener,noreferrer")
    else toast.error("Could not generate download link")
  }

  function handleDelete(doc: PropertyDocument) {
    if (!confirm(`Delete "${doc.name}"?`)) return
    startDelete(async () => {
      const result = await deletePropertyDocument(doc.id, propertyId)
      if (result.error) {
        toast.error(result.error)
      } else {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
        toast.success("Document deleted")
      }
    })
  }

  const filtered = activeFilter === "all"
    ? documents
    : documents.filter((d) => categoryOf(d.document_type) === activeFilter)

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload document
        </Button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-4">
          <form ref={formRef} onSubmit={handleUpload} className="space-y-3">
            <input type="hidden" name="property_id" value={propertyId} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide block mb-1">
                  Document type
                </label>
                <select
                  name="document_type"
                  defaultValue="other"
                  required
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-sans"
                >
                  {DOC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide block mb-1">
                  File
                </label>
                <input
                  name="file"
                  type="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  className="w-full text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide block mb-1">
                  Expiry date (optional)
                </label>
                <DatePickerInput value={expiryDate} onChange={setExpiryDate} name="expiry_date" placeholder="Optional" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide block mb-1">
                  Notes (optional)
                </label>
                <input
                  name="notes"
                  type="text"
                  placeholder="e.g. Electrician contact"
                  className="w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                {uploading ? "Uploading…" : "Upload"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTER_PILLS.map((pill) => (
          <button
            key={pill.id}
            type="button"
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
        {CATEGORIES.filter((cat) => activeFilter === "all" || activeFilter === cat.key).map((cat) => {
          const docs = filtered.filter((d) => categoryOf(d.document_type) === cat.key)
          return (
            <div key={cat.key}>
              <SectionHeader title={cat.label} hint={cat.hint} />
              {docs.length === 0 ? (
                <EmptyRow message="No documents uploaded." />
              ) : (
                docs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors last:border-0"
                  >
                    <DocIconBadge category={categoryOf(doc.document_type)} />
                    <div className="flex flex-1 items-center justify-between min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium">{doc.name}</p>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {typeLabel(doc.document_type)}
                          </span>
                          <ExpiryBadge date={doc.expiry_date} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmtDate(doc.created_at)}
                          {doc.expiry_date ? ` · expires ${fmtDate(doc.expiry_date)}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-3">
                        <button
                          type="button"
                          onClick={() => handleOpen(doc)}
                          disabled={openingId === doc.id}
                          className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                          title="View"
                        >
                          {openingId === doc.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <ExternalLink className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(doc)}
                          disabled={deleting}
                          className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
