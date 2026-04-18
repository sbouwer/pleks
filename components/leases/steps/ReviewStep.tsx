"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, Pencil } from "lucide-react"
import { createLease } from "@/lib/actions/leases"
import { toast } from "sonner"
import { formatZAR } from "@/lib/constants"
import type { WizardData } from "../LeaseWizard"
import { determineCpaApplicability } from "@/lib/leases/cpaApplicability"

interface Props {
  data: WizardData
  onBack: () => void
  onEdit: (step: 1 | 2 | 3 | 4 | 5 | 6 | 7) => void
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

  const cpaDetermination = determineCpaApplicability({
    tenant: {
      entityType: data.tenantIsJuristic ? "organisation" : "individual",
      juristicType: data.tenantJuristicType,
      turnoverUnder2m: data.tenantTurnoverUnder2m,
      assetValueUnder2m: data.tenantAssetUnder2m,
      sizeBandsCapturedAt: data.tenantSizeBandsCapturedAt,
    },
    lease: { isFranchiseAgreement: data.isFranchiseAgreement },
  })
  let cpaAppliesToDisplay = "Unknown — confirm tenant size bands"
  if (cpaDetermination.applies === "yes") cpaAppliesToDisplay = "Yes"
  else if (cpaDetermination.applies === "no") cpaAppliesToDisplay = "No"

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
    formData.set("is_franchise_agreement", String(data.isFranchiseAgreement))
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
    if (data.acknowledgedConflicts.length > 0) {
      formData.set("acknowledged_conflicts", JSON.stringify(data.acknowledgedConflicts))
    }
    if (data.charges.length > 0) {
      formData.set("charges_json", JSON.stringify(data.charges))
    }
    if (data.onceOffCharges.length > 0) {
      formData.set("once_off_charges_json", JSON.stringify(data.onceOffCharges))
    }
    if (data.coTenants.length > 0) {
      formData.set("co_tenants_json", JSON.stringify(data.coTenants.map((c) => c.id)))
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
          {data.coTenants.map((co, i) => {
            const coLabel = data.coTenants.length > 1 ? `Co-tenant ${i + 1}` : "Co-tenant"
            return <Row key={co.id} label={coLabel} value={co.name} />
          })}
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
          <Row label="Payment due" value={formatDueDay(data.paymentDueDay)} />
          <Row label="CPA applies" value={cpaAppliesToDisplay} />
        </CardContent>
      </Card>

      {/* Charges */}
      {(data.charges.length > 0 || data.onceOffCharges.length > 0) && (
        <Card>
          <CardContent className="pt-4">
            <SectionHeader title="Charges" onEdit={() => onEdit(4)} />
            {data.charges.map((c) => (
              <Row key={c.id} label={c.description} value={`${formatZAR(c.amount_cents)}/mo`} />
            ))}
            {data.onceOffCharges.map((c) => (
              <Row key={c.id} label={`${c.description} (once-off)`} value={formatZAR(c.amount_cents)} />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Special terms */}
      {data.specialTerms.some((t) => t.detail.trim()) && (
        <Card>
          <CardContent className="pt-4">
            <SectionHeader title="Special agreements" onEdit={() => onEdit(6)} />
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

      {!cpaDetermination.canActivate && (
        <div className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
          <AlertTriangle className="size-4 text-danger mt-0.5 flex-shrink-0" />
          <p className="text-danger">
            CPA status is indeterminate. Go back to the Tenant step and confirm the tenant&apos;s annual turnover and asset value before creating this lease.
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={handleCreate} disabled={loading || !cpaDetermination.canActivate}>
          {loading ? "Creating…" : "Create lease"}
        </Button>
      </div>
    </div>
  )
}
