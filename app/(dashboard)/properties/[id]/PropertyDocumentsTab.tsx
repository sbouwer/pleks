"use client"

import { useState, useTransition, useRef } from "react"
import { uploadPropertyDocument, deletePropertyDocument, getDocumentSignedUrl } from "@/lib/actions/documents"
import { Button } from "@/components/ui/button"
import { Upload, Trash2, FileText, Loader2, ExternalLink } from "lucide-react"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { toast } from "sonner"

// ── Document types + category mapping ────────────────────────────────────────

const DOC_TYPES = [
  { value: "title_deed",               label: "Title deed",                  category: "legal" },
  { value: "rates_clearance",          label: "Rates clearance",             category: "legal" },
  { value: "plans",                    label: "Building plans",              category: "legal" },
  { value: "electrical_coc",           label: "Electrical CoC",              category: "compliance" },
  { value: "gas_coc",                  label: "Gas CoC",                     category: "compliance" },
  { value: "beetle_coc",               label: "Beetle CoC",                  category: "compliance" },
  { value: "compliance_certificate",   label: "Compliance certificate",      category: "compliance" },
  { value: "levy_schedule",            label: "Levy schedule",               category: "hoa" },
  { value: "insurance",                label: "Insurance policy",            category: "insurance" },
  { value: "other",                    label: "Other",                       category: "other" },
] as const

const CATEGORIES = [
  {
    key: "legal",
    label: "Legal & title",
    hint: "Title deeds, rates clearances, building plans",
  },
  {
    key: "compliance",
    label: "Compliance",
    hint: "Electrical, gas, beetle, plumbing CoCs",
  },
  {
    key: "hoa",
    label: "HOA / Body corporate",
    hint: "Levy schedules, conduct rules, meeting minutes",
  },
  {
    key: "insurance",
    label: "Insurance",
    hint: "Building insurance, Sasria, geyser warranty",
  },
  {
    key: "other",
    label: "Other",
    hint: "Municipal accounts, photos, floor plans",
  },
] as const

type CategoryKey = (typeof CATEGORIES)[number]["key"]

function categoryOf(docType: string): CategoryKey {
  return (DOC_TYPES.find((d) => d.value === docType)?.category ?? "other") as CategoryKey
}

function typeLabel(value: string): string {
  return DOC_TYPES.find((d) => d.value === value)?.label ?? value
}

// ── Expiry badge ──────────────────────────────────────────────────────────────

function daysUntilExpiry(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function ExpiryBadge({ date }: Readonly<{ date: string | null }>) {
  if (!date) return null
  const daysLeft = daysUntilExpiry(date)
  const expired  = daysLeft < 0
  const soon     = daysLeft >= 0 && daysLeft <= 30
  if (!expired && !soon) return null
  return (
    <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded font-medium ${
      expired ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
    }`}>
      {expired ? "Expired" : `${daysLeft}d`}
    </span>
  )
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

// ── Main component ────────────────────────────────────────────────────────────

export function PropertyDocumentsTab({ propertyId, initialDocuments }: PropertyDocumentsTabProps) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [showForm, setShowForm]   = useState(false)
  const [expiryDate, setExpiryDate] = useState("")
  const [uploading, startUpload]  = useTransition()
  const [deleting, startDelete]   = useTransition()
  const [openingId, setOpeningId] = useState<string | null>(null)
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

  // Group by category
  const byCategory = Object.fromEntries(
    CATEGORIES.map((cat) => [
      cat.key,
      documents.filter((d) => categoryOf(d.document_type) === cat.key),
    ])
  ) as Record<CategoryKey, PropertyDocument[]>

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

      {/* Categorised document list */}
      <div className="space-y-4">
        {CATEGORIES.map((cat) => {
          const docs = byCategory[cat.key]
          return (
            <div key={cat.key} className="rounded-xl border border-border/60">
              <div className="px-4 py-3 border-b bg-surface rounded-t-xl">
                <span className="text-sm font-medium">{cat.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{cat.hint}</span>
              </div>
              <div className="divide-y divide-border/40">
                {docs.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground">No documents uploaded.</p>
                ) : (
                  docs.map((doc) => (
                    <div key={doc.id} className="flex items-start gap-3 px-4 py-3">
                      <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-1">
                          <span className="text-sm font-medium truncate">{doc.name}</span>
                          <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                            {typeLabel(doc.document_type)}
                          </span>
                          <ExpiryBadge date={doc.expiry_date} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {doc.expiry_date && (
                            <p className="text-[11px] text-muted-foreground">
                              Expires {new Date(doc.expiry_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(doc.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
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
                          onClick={() => handleDelete(doc)}
                          disabled={deleting}
                          className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
