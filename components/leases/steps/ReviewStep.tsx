"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, Pencil } from "lucide-react"
import { createLease } from "@/lib/actions/leases"
import { toast } from "sonner"
import { formatZAR } from "@/lib/constants"
import type { WizardData } from "../LeaseWizard"

interface Props {
  data: WizardData
  onBack: () => void
  onEdit: (step: 1 | 2 | 3 | 4 | 5) => void
}

function Row({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/40 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right ml-4">{value}</span>
    </div>
  )
}

function SectionHeader({ title, onEdit }: Readonly<{ title: string; onEdit: () => void }>) {
  return (
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <button type="button" onClick={onEdit} className="text-brand hover:text-brand/80">
        <Pencil className="size-3.5" />
      </button>
    </div>
  )
}

export function ReviewStep({ data, onBack, onEdit }: Readonly<Props>) {
  const [loading, setLoading] = useState(false)

  const leasePeriod = (() => {
    if (!data.startDate) return "—"
    if (!data.isFixedTerm) return `From ${data.startDate} (month-to-month)`
    if (!data.endDate) return data.startDate
    const start = new Date(data.startDate)
    const end = new Date(data.endDate)
    const months = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30.44))
    return `${data.startDate} – ${data.endDate} (${months} months)`
  })()

  const escalationReviewDate = (() => {
    if (!data.startDate) return "—"
    const d = new Date(data.startDate)
    d.setFullYear(d.getFullYear() + 1)
    return d.toISOString().slice(0, 10)
  })()

  async function handleCreate() {
    if (!data.unitId || !data.propertyId || !data.tenantId) {
      toast.error("Missing required fields")
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
    formData.set("deposit_interest_to", data.depositInterestTo)
    formData.set("deposit_interest_rate", data.depositInterestRate)
    formData.set("arrears_interest_enabled", String(data.arrearsInterestEnabled))
    formData.set("arrears_interest_margin", data.arrearsMargin)
    formData.set("special_terms", JSON.stringify(data.specialTerms.filter((t) => t.detail.trim())))
    formData.set("clause_selections", JSON.stringify(data.clauseSelections))
    if (data.charges.length > 0) {
      formData.set("charges_json", JSON.stringify(data.charges))
    }
    if (data.coTenantId) {
      formData.set("co_tenant_id", data.coTenantId)
    }

    const result = await createLease(formData)
    if (result?.error) {
      toast.error(result.error)
      setLoading(false)
    }
    // On success, createLease redirects — no need to setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl mb-1">Review lease</h2>
        <p className="text-sm text-muted-foreground">Confirm the details before creating the draft.</p>
      </div>

      {/* Property + Tenant */}
      <Card>
        <CardContent className="pt-4">
          <SectionHeader title="Parties" onEdit={() => onEdit(1)} />
          <Row label="Property" value={data.propertyName || data.propertyId} />
          <Row label="Unit" value={data.unitLabel || data.unitId} />
          <SectionHeader title="Tenant" onEdit={() => onEdit(2)} />
          <Row label="Primary tenant" value={data.tenantName || data.tenantId} />
          {data.coTenantId && (
            <Row label="Co-tenant" value={data.coTenantName || data.coTenantId} />
          )}
          <Row label="Lease type" value={`${data.leaseType === "residential" ? "Residential" : "Commercial"} · ${data.isFixedTerm ? "Fixed term" : "Month-to-month"}`} />
        </CardContent>
      </Card>

      {/* Terms */}
      <Card>
        <CardContent className="pt-4">
          <SectionHeader title="Financial terms" onEdit={() => onEdit(3)} />
          <Row label="Monthly rent" value={data.rent ? formatZAR(Math.round(Number.parseFloat(data.rent) * 100)) : "—"} />
          <Row label="Deposit" value={data.deposit ? formatZAR(Math.round(Number.parseFloat(data.deposit) * 100)) : "None"} />
          <Row label="Period" value={leasePeriod} />
          <Row label="Escalation" value={`${data.escalationPercent}% ${data.escalationType === "fixed" ? "fixed" : data.escalationType} on ${escalationReviewDate}`} />
          <Row label="Payment due" value={`${data.paymentDueDay}${data.paymentDueDay === "1" ? "st" : "th"} of each month`} />
          {data.cpaApplies && <Row label="CPA s14" value="Applies — 20 business days' notice required" />}
        </CardContent>
      </Card>

      {/* Charges */}
      {data.charges.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <SectionHeader title="Additional charges" onEdit={() => onEdit(4)} />
            {data.charges.map((c) => (
              <Row
                key={c.id}
                label={c.description}
                value={`${formatZAR(c.amount_cents)}/mo`}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Special terms */}
      {data.specialTerms.some((t) => t.detail.trim()) && (
        <Card>
          <CardContent className="pt-4">
            <SectionHeader title="Special agreements" onEdit={() => onEdit(4)} />
            {data.specialTerms.filter((t) => t.detail.trim()).map((t) => (
              <Row key={`${t.type}-${t.detail}`} label={t.type.replaceAll("_", " ")} value={t.detail} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Warning */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm">
        <AlertTriangle className="size-4 text-amber-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium text-amber-700 dark:text-amber-400">Draft lease</p>
          <p className="text-amber-600 dark:text-amber-500 text-xs mt-0.5">
            This creates a lease in DRAFT status. You&apos;ll activate it separately after signing, deposit receipt, and move-in inspection.
          </p>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={handleCreate} disabled={loading}>
          {loading ? "Creating…" : "Create lease"}
        </Button>
      </div>
    </div>
  )
}
