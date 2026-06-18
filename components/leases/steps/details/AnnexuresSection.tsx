"use client"

/**
 * components/leases/steps/details/AnnexuresSection.tsx — the "Annexures" section of the merged Lease-details step
 *
 * Auth:   client-only; pure form section (no DB access)
 * Data:   controlled by parent (Annexure C rules + special terms); Annexure A summary derives from the live terms/charges
 * Notes:  Lifted from the old AnnexuresStep, stripped of its own step-nav. Four collapsible annexures (A–D).
 */
import { useState } from "react"
import { Field, UnderlineInput, UnderlineSelect } from "@/components/ui/door-form"
import { AddInline } from "@/components/ui/actions"
import { ChevronDown, ChevronUp, X } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import type { LocalCharge, LocalOnceOffCharge, AnnexureCRules, SpecialTerm } from "../../wizardData"

const SPECIAL_TERM_TYPES = [
  { value: "pet_permission", label: "Pet Permission", defaultDetail: "Tenant is permitted to keep [describe pet] on the premises subject to the property rules." },
  { value: "parking", label: "Parking Bay", defaultDetail: "Parking bay [number/description] is allocated to the Tenant at no additional charge." },
  { value: "storage", label: "Storage", defaultDetail: "Storage unit [number/description] is allocated to the Tenant at no additional charge." },
  { value: "repair_agreement", label: "Landlord Repair", defaultDetail: "The Landlord agrees to [describe repair/improvement] before/by [date]." },
  { value: "early_termination", label: "Early Termination", defaultDetail: "The Tenant may terminate this lease on [X] calendar days' written notice, subject to a penalty of [amount/formula]." },
  { value: "custom", label: "Custom", defaultDetail: "" },
]

const RULE_LABELS: Record<keyof AnnexureCRules, string> = {
  pets: "Pets",
  smoking: "Smoking",
  parking: "Parking",
  noise: "Noise",
  commonAreas: "Common areas",
}

function AnnexureSection({
  letter, title, subtitle, open, onToggle, children,
}: Readonly<{ letter: string; title: string; subtitle: string; open: boolean; onToggle: () => void; children: React.ReactNode }>) {
  return (
    <div className="rounded-[var(--r-button)] border border-border">
      <button type="button" className="w-full flex items-center justify-between px-4 py-3 text-left" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-bold">{letter}</span>
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t border-border px-4 py-4">{children}</div>}
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

function formatDueDay(v: string) {
  if (v === "last_day") return "Last day of the month"
  if (v === "last_working_day") return "Last working day of the month"
  let ordinalSuffix = "th"
  if (v === "1") ordinalSuffix = "st"
  else if (v === "3") ordinalSuffix = "rd"
  return `${v}${ordinalSuffix} of each month`
}

interface Props {
  rent: string
  deposit: string
  paymentDueDay: string
  escalationPercent: string
  escalationType: string
  charges: LocalCharge[]
  onceOffCharges: LocalOnceOffCharge[]
  rules: AnnexureCRules
  specialTerms: SpecialTerm[]
  onChangeRules: (next: AnnexureCRules) => void
  onChangeSpecialTerms: (next: SpecialTerm[]) => void
}

export function AnnexuresSection({
  rent, deposit, paymentDueDay, escalationPercent, escalationType,
  charges, onceOffCharges, rules, specialTerms, onChangeRules, onChangeSpecialTerms,
}: Readonly<Props>) {
  const rentCents = Math.round(Number.parseFloat(rent || "0") * 100)
  const depositCents = Math.round(Number.parseFloat(deposit || "0") * 100)
  const totalRecurring = charges.reduce((s, c) => s + c.amount_cents, 0)

  // Accordion: only one annexure open at a time (defaults to A). Clicking the open one closes it.
  const [openLetter, setOpenLetter] = useState<string | null>("A")
  const toggle = (l: string) => setOpenLetter((cur) => (cur === l ? null : l))

  function updateRule(key: keyof AnnexureCRules, value: string) {
    onChangeRules({ ...rules, [key]: value })
  }

  function updateSpecialTermType(i: number, type: string) {
    const defaultDetail = SPECIAL_TERM_TYPES.find((t) => t.value === type)?.defaultDetail ?? ""
    onChangeSpecialTerms(specialTerms.map((t, idx) => idx === i ? { ...t, type, detail: t.detail || defaultDetail } : t))
  }

  function updateSpecialTermDetail(i: number, detail: string) {
    onChangeSpecialTerms(specialTerms.map((t, idx) => idx === i ? { ...t, detail } : t))
  }

  return (
    <div className="space-y-4">
      {/* Annexure A — Rental Calculation */}
      <AnnexureSection letter="A" title="Rental Calculation" subtitle="Summary of all amounts payable" open={openLetter === "A"} onToggle={() => toggle("A")}>
        <div className="space-y-1">
          <ReadOnlyRow label="Monthly rent" value={rentCents > 0 ? formatZAR(rentCents) : "—"} />
          {charges.map((c) => <ReadOnlyRow key={c.id} label={c.description} value={`${formatZAR(c.amount_cents)}/mo`} />)}
          {totalRecurring > 0 && <ReadOnlyRow label="Total monthly" value={formatZAR(rentCents + totalRecurring)} />}
          <ReadOnlyRow label="Deposit" value={depositCents > 0 ? formatZAR(depositCents) : "—"} />
          <ReadOnlyRow label="Payment due" value={formatDueDay(paymentDueDay)} />
          <ReadOnlyRow label="Escalation" value={`${escalationPercent}% per annum (${escalationType})`} />
          {onceOffCharges.length > 0 && (
            <>
              <p className="text-xs font-medium text-muted-foreground pt-2 pb-1">Once-off charges</p>
              {onceOffCharges.map((c) => <ReadOnlyRow key={c.id} label={c.description} value={formatZAR(c.amount_cents)} />)}
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-3">This annexure is auto-populated from the lease terms and cannot be edited here.</p>
      </AnnexureSection>

      {/* Annexure B — Banking Details */}
      <AnnexureSection letter="B" title="Banking Details" subtitle="Landlord payment account — captured in property settings" open={openLetter === "B"} onToggle={() => toggle("B")}>
        <p className="text-sm text-muted-foreground">
          Banking details are pulled from your property settings at the time the lease document is generated.
          To update them, go to <strong>Settings → Banking</strong>.
        </p>
      </AnnexureSection>

      {/* Annexure C — Property Rules */}
      <AnnexureSection letter="C" title="Property Rules" subtitle="Amend as needed for this specific unit" open={openLetter === "C"} onToggle={() => toggle("C")}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {(Object.entries(rules) as [keyof AnnexureCRules, string][]).map(([key, value]) => (
            <Field key={key} label={RULE_LABELS[key]}>
              <UnderlineInput value={value} onChange={(e) => updateRule(key, e.target.value)} error={!value.trim()} />
            </Field>
          ))}
        </div>
      </AnnexureSection>

      {/* Annexure D — Special Agreements */}
      <AnnexureSection letter="D" title="Special Agreements" subtitle="Pet permission, parking arrangements, custom terms, etc." open={openLetter === "D"} onToggle={() => toggle("D")}>
        <div className="space-y-3">
          {specialTerms.map((term, i) => (
            <div key={`term-${i}`} className="flex items-center gap-2">
              <div className="w-44 shrink-0">
                <UnderlineSelect value={term.type} onChange={(v) => updateSpecialTermType(i, v || "custom")} options={SPECIAL_TERM_TYPES} />
              </div>
              <div className="flex-1">
                <UnderlineInput value={term.detail} onChange={(e) => updateSpecialTermDetail(i, e.target.value)} placeholder="Details" />
              </div>
              <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => onChangeSpecialTerms(specialTerms.filter((_, idx) => idx !== i))}>
                <X className="size-4" />
              </button>
            </div>
          ))}
          {specialTerms.length === 0 && (
            <p className="text-sm text-muted-foreground">No special agreements — Annexure D will state &quot;No special agreements apply.&quot;</p>
          )}
          <AddInline label="Add special agreement" onClick={() => onChangeSpecialTerms([...specialTerms, { type: "custom", detail: "" }])} />
        </div>
      </AnnexureSection>
    </div>
  )
}
