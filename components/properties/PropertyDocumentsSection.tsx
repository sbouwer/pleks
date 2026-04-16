"use client"

import { useState, useTransition, useRef } from "react"
import { uploadPropertyDocument, deletePropertyDocument, getDocumentSignedUrl } from "@/lib/actions/documents"
import { Button } from "@/components/ui/button"
import { Upload, Trash2, FileText, Loader2, ExternalLink } from "lucide-react"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { FormSelect } from "@/components/ui/FormSelect"
import { toast } from "sonner"

const DOCUMENT_TYPES = [
  { value: "title_deed", label: "Title deed" },
  { value: "compliance_certificate", label: "Compliance certificate" },
  { value: "insurance", label: "Insurance" },
  { value: "rates_clearance", label: "Rates clearance" },
  { value: "levy_schedule", label: "Levy schedule" },
  { value: "plans", label: "Building plans" },
  { value: "electrical_coc", label: "Electrical CoC" },
  { value: "gas_coc", label: "Gas CoC" },
  { value: "beetle_coc", label: "Beetle CoC" },
  { value: "other", label: "Other" },
]

interface PropertyDocument {
  id: string
  name: string
  document_type: string
  storage_path: string
  expiry_date: string | null
  notes: string | null
  created_at: string
}

interface PropertyDocumentsSectionProps {
  readonly propertyId: string
  readonly initialDocuments: PropertyDocument[]
}

function typeLabel(value: string): string {
  return DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? value
}

function ExpiryBadge({ date }: { date: string | null }) {
  if (!date) return null
  const expiry = new Date(date)
  const now = new Date()
  const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const expired = daysLeft < 0
  const soonExpiry = daysLeft >= 0 && daysLeft <= 30

  if (!expired && !soonExpiry) return null

  return (
    <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded font-medium ${expired ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
      {expired ? "Expired" : `Expires in ${daysLeft}d`}
    </span>
  )
}

export function PropertyDocumentsSection({ propertyId, initialDocuments }: PropertyDocumentsSectionProps) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [showForm, setShowForm] = useState(false)
  const [uploading, startUpload] = useTransition()
  const [deleting, startDelete] = useTransition()
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [expiryDate, setExpiryDate] = useState("")
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
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer")
    } else {
      toast.error("Could not generate download link")
    }
  }

  function handleDelete(doc: PropertyDocument) {
    if (!confirm("Delete " + doc.name + "?")) return
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

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold">Documents</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
        >
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          Upload
        </Button>
      </div>

      {showForm && (
        <div className="border-b px-4 py-4 bg-muted/20">
          <form ref={formRef} onSubmit={handleUpload} className="space-y-3">
            <input type="hidden" name="property_id" value={propertyId} />
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Document type</label>
              <FormSelect
                name="document_type"
                defaultValue="other"
                required
                options={DOCUMENT_TYPES}
                className="mt-1 w-full"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground uppercase tracking-wide">File</label>
              <input
                name="file"
                type="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                className="mt-1 w-full text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Expiry date (optional)</label>
                <DatePickerInput value={expiryDate} onChange={setExpiryDate} name="expiry_date" placeholder="Optional" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Notes (optional)</label>
                <input
                  name="notes"
                  type="text"
                  placeholder="e.g. Electrician contact"
                  className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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

      <div className="divide-y">
        {documents.length === 0 && !showForm && (
          <p className="px-4 py-6 text-sm text-muted-foreground text-center">No documents uploaded yet.</p>
        )}
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-start gap-3 px-4 py-3">
            <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-1">
                <span className="text-sm font-medium truncate">{doc.name}</span>
                <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {typeLabel(doc.document_type)}
                </span>
                <ExpiryBadge date={doc.expiry_date} />
              </div>
              {doc.expiry_date && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Expires {new Date(doc.expiry_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleOpen(doc)}
                disabled={openingId === doc.id}
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                title="View document"
              >
                {openingId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => handleDelete(doc)}
                disabled={deleting}
                className="p-1.5 text-muted-foreground hover:text-danger transition-colors"
                title="Delete document"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
