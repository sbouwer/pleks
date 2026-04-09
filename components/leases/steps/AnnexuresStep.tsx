"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatZAR } from "@/lib/constants"
import type { WizardData, AnnexureCRules, SpecialTerm } from "../LeaseWizard"

interface Props {
  data: WizardData
  onBack: () => void
  onNext: (updates: Partial<WizardData>) => void
}

const SPECIAL_TERM_TYPES = [
  { value: "pet_permission", label: "Pet Permission", defaultDetail: "Tenant is permitted to keep [describe pet] on the premises subject to the property rules." },
  { value: "parking", label: "Parking Bay", defaultDetail: "Parking bay [number/description] is allocated to the Tenant at no additional charge." },
  { value: "storage", label: "Storage", defaultDetail: "Storage unit [number/description] is allocated to the Tenant at no additional charge." },
  { value: "repair_agreement", label: "Landlord Repair", defaultDetail: "The Landlord agrees to [describe repair/improvement] before/by [date]." },
  { value: "early_termination", label: "Early Termination", defaultDetail: "The Tenant may terminate this lease on [X] calendar days' written notice, subject to a penalty of [amount/formula]." },
  { value: "custom", label: "Custom", defaultDetail: "" },
]

function AnnexureSection({
  letter,
  title,
  subtitle,
  defaultOpen = false,
  children,
}: Readonly<{
  letter: string
  title: string
  subtitle: string
  defaultOpen?: boolean
  children: React.ReactNode
}>) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-bold">{letter}</span>
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && (
        <div className="border-t border-border px-4 py-4">
          {children}
        </div>
      )}
    </div>
  )
}

function ReadOnlyRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right ml-4">{value}</span>
    </div>
  )
}

export function AnnexuresStep({ data, onBack, onNext }: Readonly<Props>) {
  const [rules, setRules] = useState<AnnexureCRules>(data.annexureCRules)
  const [specialTerms, setSpecialTerms] = useState<SpecialTerm[]>(data.specialTerms)

  function updateRule(key: keyof AnnexureCRules, value: string) {
    setRules((prev) => ({ ...prev, [key]: value }))
  }

  function addSpecialTerm() {
    setSpecialTerms((prev) => [...prev, { type: "custom", detail: "" }])
  }

  function removeSpecialTerm(i: number) {
    setSpecialTerms((prev) => prev.filter((_, idx) => idx !== i))
  }

  function updateSpecialTermType(i: number, type: string) {
    const defaultDetail = SPECIAL_TERM_TYPES.find((t) => t.value === type)?.defaultDetail ?? ""
    setSpecialTerms((prev) => prev.map((t, idx) => idx === i ? { ...t, type, detail: t.detail || defaultDetail } : t))
  }

  function updateSpecialTermDetail(i: number, detail: string) {
    setSpecialTerms((prev) => prev.map((t, idx) => idx === i ? { ...t, detail } : t))
  }

  // Rental calc values
  const rentCents = Math.round(Number.parseFloat(data.rent || "0") * 100)
  const depositCents = Math.round(Number.parseFloat(data.deposit || "0") * 100)
  const totalRecurring = data.charges.reduce((s, c) => s + c.amount_cents, 0)

  function formatDueDay(v: string) {
    if (v === "last_day") return "Last day of the month"
    if (v === "last_working_day") return "Last working day of the month"
    let ordinalSuffix: string
    if (v === "1") { ordinalSuffix = "st" }
    else if (v === "3") { ordinalSuffix = "rd" }
    else { ordinalSuffix = "th" }
    return `${v}${ordinalSuffix} of each month`
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl mb-1">Annexures</h2>
        <p className="text-sm text-muted-foreground">Review and amend the four lease annexures before finalising.</p>
      </div>

      {/* Annexure A — Rental Calculation */}
      <AnnexureSection letter="A" title="Rental Calculation" subtitle="Summary of all amounts payable" defaultOpen>
        <div className="space-y-1">
          <ReadOnlyRow label="Monthly rent" value={rentCents > 0 ? formatZAR(rentCents) : "—"} />
          {data.charges.map((c) => (
            <ReadOnlyRow key={c.id} label={c.description} value={`${formatZAR(c.amount_cents)}/mo`} />
          ))}
          {totalRecurring > 0 && (
            <ReadOnlyRow label="Total monthly" value={formatZAR(rentCents + totalRecurring)} />
          )}
          <ReadOnlyRow label="Deposit" value={depositCents > 0 ? formatZAR(depositCents) : "—"} />
          <ReadOnlyRow label="Payment due" value={formatDueDay(data.paymentDueDay)} />
          <ReadOnlyRow label="Escalation" value={`${data.escalationPercent}% per annum (${data.escalationType})`} />
          {data.onceOffCharges.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground pt-2 pb-1">Once-off charges</p>
              {data.onceOffCharges.map((c) => (
                <ReadOnlyRow key={c.id} label={c.description} value={formatZAR(c.amount_cents)} />
              ))}
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">This annexure is auto-populated from the lease terms and cannot be edited here.</p>
      </AnnexureSection>

      {/* Annexure B — Banking Details */}
      <AnnexureSection letter="B" title="Banking Details" subtitle="Landlord payment account — captured in property settings">
        <p className="text-sm text-muted-foreground">
          Banking details are pulled from your property settings at the time the lease document is generated.
          To update them, go to <strong>Settings → Banking</strong>.
        </p>
      </AnnexureSection>

      {/* Annexure C — Property Rules */}
      <AnnexureSection letter="C" title="Property Rules" subtitle="Amend as needed for this specific unit">
        <div className="space-y-4">
          {(Object.entries(rules) as [keyof AnnexureCRules, string][]).map(([key, value]) => {
            const labels: Record<keyof AnnexureCRules, string> = {
              pets: "Pets",
              smoking: "Smoking",
              parking: "Parking",
              noise: "Noise",
              commonAreas: "Common areas",
            }
            return (
              <div key={key} className="space-y-1">
                <Label className="text-xs font-medium capitalize">{labels[key]}</Label>
                <Input
                  value={value}
                  onChange={(e) => updateRule(key, e.target.value)}
                  className={cn("text-sm", !value.trim() && "border-danger/50")}
                />
              </div>
            )
          })}
        </div>
      </AnnexureSection>

      {/* Annexure D — Special Agreements */}
      <AnnexureSection letter="D" title="Special Agreements" subtitle="Pet permission, parking arrangements, custom terms, etc.">
        <div className="space-y-3">
          {specialTerms.map((term, i) => (
            <div key={`term-${i}`} className="flex gap-2">
              <Select value={term.type} onValueChange={(v) => updateSpecialTermType(i, v ?? "custom")}>
                <SelectTrigger className="w-44">
                  <SelectValue>{SPECIAL_TERM_TYPES.find((t) => t.value === term.type)?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {SPECIAL_TERM_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="flex-1"
                value={term.detail}
                onChange={(e) => updateSpecialTermDetail(i, e.target.value)}
                placeholder="Details"
              />
              <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => removeSpecialTerm(i)}>
                <X className="size-4" />
              </button>
            </div>
          ))}
          {specialTerms.length === 0 && (
            <p className="text-sm text-muted-foreground">No special agreements — Annexure D will state &quot;No special agreements apply.&quot;</p>
          )}
          <button
            type="button"
            onClick={addSpecialTerm}
            className="text-sm text-brand hover:underline flex items-center gap-1"
          >
            <Plus className="size-3" /> Add special agreement
          </button>
        </div>
      </AnnexureSection>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>← Back</Button>
        <Button onClick={() => onNext({ annexureCRules: rules, specialTerms })}>Continue →</Button>
      </div>
    </div>
  )
}
