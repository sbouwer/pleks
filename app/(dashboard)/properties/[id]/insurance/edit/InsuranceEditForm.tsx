"use client"

import { useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { saveInsurancePolicy, saveBroker } from "@/lib/actions/insurance"
import { toast } from "sonner"

const POLICY_TYPES = [
  { value: "standard_buildings",  label: "Standard buildings" },
  { value: "heritage_specialist", label: "Heritage specialist" },
  { value: "commercial_property", label: "Commercial property" },
  { value: "sectional_title",     label: "Sectional title" },
  { value: "other",               label: "Other" },
]

export interface InsuranceEditDefaults {
  policyNumber:        string | null
  provider:            string | null
  policyType:          string | null
  renewalDate:         string | null
  replacementValueR:   string | null
  excessR:             string | null
  notes:               string | null
}

export interface BrokerEditDefaults {
  brokerContactId:     string | null
  autoNotifyCritical:  boolean
  afterHoursNumber:    string | null
  brokerNotes:         string | null
}

export interface BrokerContact {
  id:           string
  first_name:   string | null
  last_name:    string | null
  company_name: string | null
}

interface InsuranceEditFormProps {
  propertyId:      string
  policy:          InsuranceEditDefaults
  broker:          BrokerEditDefaults
  brokerContacts:  BrokerContact[]
}

export function InsuranceEditForm({
  propertyId,
  policy,
  broker,
  brokerContacts,
}: Readonly<InsuranceEditFormProps>) {
  const router = useRouter()
  const backHref = `/properties/${propertyId}?tab=insurance`

  const [policyType, setPolicyType] = useState(policy.policyType ?? "")
  const [renewalDate, setRenewalDate] = useState(policy.renewalDate ?? "")
  const [autoNotify, setAutoNotify] = useState(broker.autoNotifyCritical)
  const [selectedBrokerId, setSelectedBrokerId] = useState(broker.brokerContactId ?? "")

  const [policyState, policyAction, policyPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      formData.set("insurance_policy_type", policyType)
      formData.set("insurance_renewal_date", renewalDate)
      const result = await saveInsurancePolicy(propertyId, formData)
      if (result?.error) return result
      toast.success("Insurance policy saved")
      return null
    },
    null,
  )

  const [brokerState, brokerAction, brokerPending] = useActionState(
    async (_prev: { error?: string } | null, formData: FormData) => {
      formData.set("broker_contact_id", selectedBrokerId)
      formData.set("auto_notify_critical", autoNotify ? "true" : "false")
      const result = await saveBroker(propertyId, formData)
      if (result?.error) return result
      toast.success("Broker saved")
      return null
    },
    null,
  )

  function contactLabel(c: BrokerContact): string {
    return c.company_name?.trim() || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown"
  }

  return (
    <div className="space-y-8">
      {/* ── Policy ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Policy details
        </h2>

        <form action={policyAction} className="space-y-4">
          {policyState?.error && (
            <p className="text-sm text-danger">{policyState.error}</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="insurance_policy_number">Policy number</Label>
              <Input
                id="insurance_policy_number"
                name="insurance_policy_number"
                defaultValue={policy.policyNumber ?? ""}
                placeholder="e.g. POL-2025-00142"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance_provider">Provider</Label>
              <Input
                id="insurance_provider"
                name="insurance_provider"
                defaultValue={policy.provider ?? ""}
                placeholder="e.g. Santam"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Policy type</Label>
              <Select value={policyType} onValueChange={(v) => setPolicyType(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {POLICY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Renewal date</Label>
              <DatePickerInput
                value={renewalDate}
                onChange={setRenewalDate}
                name="insurance_renewal_date"
                placeholder="Select date"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="insurance_replacement_value">Replacement value (R)</Label>
              <Input
                id="insurance_replacement_value"
                name="insurance_replacement_value"
                type="number"
                min="0"
                step="1"
                defaultValue={policy.replacementValueR ?? ""}
                placeholder="e.g. 4500000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="insurance_excess">Excess (R)</Label>
            <Input
              id="insurance_excess"
              name="insurance_excess"
              type="number"
              min="0"
              step="1"
              defaultValue={policy.excessR ?? ""}
              placeholder="e.g. 5000"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="insurance_notes">Notes</Label>
            <Textarea
              id="insurance_notes"
              name="insurance_notes"
              rows={2}
              defaultValue={policy.notes ?? ""}
              placeholder="Special conditions, exclusions, etc."
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={policyPending}>
              {policyPending ? "Saving…" : "Save policy"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={policyPending}>
              Cancel
            </Button>
          </div>
        </form>
      </section>

      {/* ── Broker ──────────────────────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Broker
        </h2>

        <form action={brokerAction} className="space-y-4">
          {brokerState?.error && (
            <p className="text-sm text-danger">{brokerState.error}</p>
          )}

          <div className="space-y-1.5">
            <Label>Broker contact</Label>
            {brokerContacts.length > 0 ? (
              <Select
                value={selectedBrokerId}
                onValueChange={(v) => setSelectedBrokerId(v === "__none__" ? "" : (v ?? ""))}
              >
                <SelectTrigger><SelectValue placeholder="Select broker…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— No broker —</SelectItem>
                  {brokerContacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{contactLabel(c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                No contacts with <code>insurance_broker</code> role found.{" "}
                <a href="/contacts/new" className="text-brand hover:underline">Add one →</a>
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="after_hours_number">After-hours number</Label>
            <Input
              id="after_hours_number"
              name="after_hours_number"
              defaultValue={broker.afterHoursNumber ?? ""}
              placeholder="+27 83 000 0000"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="accent-brand"
              checked={autoNotify}
              onChange={(e) => setAutoNotify(e.target.checked)}
            />
            <span className="text-sm">Auto-notify broker on critical incidents</span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="broker_notes">Notes</Label>
            <Textarea
              id="broker_notes"
              name="broker_notes"
              rows={2}
              defaultValue={broker.brokerNotes ?? ""}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" disabled={brokerPending}>
              {brokerPending ? "Saving…" : "Save broker"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={brokerPending}>
              Cancel
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
