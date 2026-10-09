"use client"

/**
 * app/(dashboard)/leases/[leaseId]/edit/LeaseTermsForm.tsx — the draft lease terms form
 *
 * Route:  /leases/[leaseId]/edit
 * Auth:   updateDraftLeaseTerms server action (requireAgentWriteAccess, draft only)
 * Data:   defaults passed from the page; validation is server-side (lib/leases/leaseTermsEdit.ts)
 * Notes:  Saving changed terms clears a generated document, which then has to be generated again — the form says
 *         so before the save, not only after it.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { FieldGrid, SelectField, TextField } from "@/components/forms/fields"
import { updateDraftLeaseTerms } from "@/lib/actions/leases"
import { ESCALATION_TYPES, SELECTABLE_ESCALATION_TYPES, type LeaseTermsInput } from "@/lib/leases/leaseTermsEdit"

const TERM_OPTIONS = [
  { value: "fixed", label: "Fixed term" },
  { value: "month_to_month", label: "Month-to-month" },
]

const DUE_DAY_OPTIONS = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1} of the month` })),
  { value: "last_day", label: "Last day of the month" },
  { value: "last_working_day", label: "Last working day of the month" },
]

interface Props {
  leaseId: string
  backHref: string
  hasGeneratedDocument: boolean
  hasUploadedDocument: boolean
  defaults: LeaseTermsInput
}

/** The choosable types, plus the lease's own stored type when it is not one of them (an import), so a save keeps it. */
function escalationOptions(current: string) {
  const own = ESCALATION_TYPES.find((t) => t.value === current)
  return own && !SELECTABLE_ESCALATION_TYPES.some((t) => t.value === current)
    ? [...SELECTABLE_ESCALATION_TYPES, own]
    : SELECTABLE_ESCALATION_TYPES
}

export function LeaseTermsForm({ leaseId, backHref, hasGeneratedDocument, hasUploadedDocument, defaults }: Readonly<Props>) {
  const router = useRouter()
  const [v, setV] = useState<LeaseTermsInput>(defaults)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const set = <K extends keyof LeaseTermsInput>(k: K) => (value: LeaseTermsInput[K]) => setV((prev) => ({ ...prev, [k]: value }))

  function save() {
    setError(null)
    startTransition(async () => {
      const res = await updateDraftLeaseTerms(leaseId, v)
      if ("error" in res) {
        setError(res.error)
        return
      }
      toast.success(res.documentCleared
        ? "Lease saved. Generate the lease document again before sending it for signing."
        : "Lease saved")
      router.push(backHref)
    })
  }

  return (
    <div className="space-y-6">
      {hasGeneratedDocument && (
        <p className="text-sm text-muted-foreground">
          This lease has a generated document. Saving changed terms removes it, and you generate it again before signing.
        </p>
      )}
      {hasUploadedDocument && (
        <p className="text-sm text-muted-foreground">
          These terms are what Pleks bills and reminds from. Your uploaded lease document is not changed, so make
          sure it says the same.
        </p>
      )}
      <FieldGrid>
        <TextField label="Start date" type="date" required value={v.startDate} onChange={set("startDate")} />
        <SelectField
          label="Term"
          value={v.isFixedTerm ? "fixed" : "month_to_month"}
          onChange={(t) => set("isFixedTerm")(t === "fixed")}
          options={TERM_OPTIONS}
        />
        {v.isFixedTerm && (
          <TextField label="End date" type="date" required value={v.endDate} onChange={set("endDate")} />
        )}
        <TextField label="Notice period (days)" type="number" required value={v.noticePeriodDays} onChange={set("noticePeriodDays")} />
        <TextField label="Monthly rent (R)" type="number" required value={v.rent} onChange={set("rent")} />
        <TextField label="Deposit (R)" type="number" value={v.deposit} onChange={set("deposit")} />
        <SelectField label="Rent due" value={v.paymentDueDay} onChange={set("paymentDueDay")} options={DUE_DAY_OPTIONS} />
        <SelectField label="Escalation" value={v.escalationType} onChange={set("escalationType")} options={escalationOptions(defaults.escalationType)} />
        <TextField label="Escalation (% per year)" type="number" required value={v.escalationPercent} onChange={set("escalationPercent")} />
      </FieldGrid>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex items-center gap-3">
        <ActionButton tone="primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </ActionButton>
        <ActionButton tone="secondary" onClick={() => router.push(backHref)} disabled={pending}>
          Cancel
        </ActionButton>
      </div>
    </div>
  )
}
