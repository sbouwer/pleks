"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Paperclip, X } from "lucide-react"
import { toast } from "sonner"
import { createUploadedLease } from "@/lib/actions/leases"
import { formatZAR } from "@/lib/constants"
import type { WizardData } from "../LeaseWizard"

interface Props {
  data: WizardData
  onBack: () => void
}

function formatDueDay(v: string): string {
  if (v === "last_day") return "Last day of each month"
  if (v === "last_working_day") return "Last working day of each month"
  let suffix = "th"
  if (v === "1") suffix = "st"
  else if (v === "3") suffix = "rd"
  return `${v}${suffix} of each month`
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right ml-4">{value}</span>
    </div>
  )
}

export function UploadDocumentStep({ data, onBack }: Readonly<Props>) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) return
    if (f.type !== "application/pdf") {
      toast.error("PDF files only")
      return
    }
    if (f.size > 20 * 1024 * 1024) {
      toast.error("Max 20 MB")
      return
    }
    setFile(f)
  }

  function removeFile() {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleCreate() {
    if (!data.unitId || !data.propertyId || !data.tenantId) {
      toast.error("Missing required fields — go back and complete all steps")
      return
    }
    setLoading(true)

    const formData = new FormData()
    formData.set("unit_id", data.unitId)
    formData.set("property_id", data.propertyId)
    formData.set("tenant_id", data.tenantId)
    formData.set("lease_type", data.leaseType)
    formData.set("tenant_is_juristic", String(data.tenantIsJuristic))
    formData.set("cpa_applies", String(data.cpaApplies))
    formData.set("start_date", data.startDate)
    if (data.endDate) formData.set("end_date", data.endDate)
    formData.set("is_fixed_term", String(data.isFixedTerm))
    formData.set("notice_period_days", data.noticePeriod)
    formData.set("rent_amount", data.rent)
    formData.set("payment_due_day", data.paymentDueDay)
    formData.set("escalation_percent", data.escalationPercent)
    formData.set("escalation_type", data.escalationType)
    if (data.deposit) formData.set("deposit_amount", data.deposit)
    if (data.coTenants.length > 0) {
      formData.set("co_tenants_json", JSON.stringify(data.coTenants.map((c) => c.id)))
    }
    if (file) {
      formData.set("document", file)
    }

    const result = await createUploadedLease(formData)
    if ("error" in result) {
      toast.error(result.error)
      setLoading(false)
      return
    }
    router.push(`/leases/${result.leaseId}`)
  }

  const leasePeriod = (() => {
    if (!data.startDate) return "—"
    if (!data.isFixedTerm) return `From ${data.startDate} (month-to-month)`
    if (!data.endDate) return data.startDate
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    return `${data.startDate} – ${data.endDate} (${months} months)`
  })()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Upload lease document</h2>
        <p className="text-sm text-muted-foreground">
          Optional — you can upload the signed document later from the lease detail page.
        </p>
      </div>

      {/* Drop zone */}
      {!file ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed border-border/60 hover:border-brand/40 transition-colors px-6 py-10 flex flex-col items-center gap-2 text-center"
        >
          <Paperclip className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">Drop your lease PDF here</p>
          <p className="text-xs text-muted-foreground">or click to browse · PDF only · Max 20 MB</p>
        </button>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <Paperclip className="size-4 text-brand shrink-0" />
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
            </div>
          </div>
          <button
            type="button"
            onClick={removeFile}
            className="text-muted-foreground hover:text-danger ml-2"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Summary */}
      <Card>
        <CardContent className="pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Summary</p>
          <Row label="Property" value={data.propertyName || "—"} />
          <Row label="Unit" value={data.unitLabel || "—"} />
          <Row label="Tenant" value={data.tenantName || "—"} />
          {data.coTenants.map((co, i) => (
            <Row
              key={co.id}
              label={data.coTenants.length > 1 ? `Co-tenant ${i + 1}` : "Co-tenant"}
              value={co.name}
            />
          ))}
          <Row label="Period" value={leasePeriod} />
          <Row
            label="Rent"
            value={data.rent ? `${formatZAR(Math.round(Number.parseFloat(data.rent) * 100))}/mo · Due ${formatDueDay(data.paymentDueDay)}` : "—"}
          />
          <Row
            label="Deposit"
            value={data.deposit ? formatZAR(Math.round(Number.parseFloat(data.deposit) * 100)) : "None"}
          />
          <Row
            label="Escalation"
            value={`${data.escalationPercent}% ${data.escalationType === "fixed" ? "fixed" : data.escalationType}`}
          />
        </CardContent>
      </Card>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={loading}>
          ← Back
        </Button>
        <Button type="button" onClick={handleCreate} disabled={loading}>
          {loading ? "Creating…" : "Create lease"}
        </Button>
      </div>
    </div>
  )
}
