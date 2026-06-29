"use client"

/**
 * app/(tenant)/tenant/maintenance/new/MaintenanceNewForm.tsx — multi-step report-an-issue form (tenant portal)
 *
 * Auth:   rendered inside the session-guarded tenant portal; posts via submitMaintenanceRequest
 * Data:   Haiku triage suggests urgency (advisory); lease clauses drive the consent wording
 * Notes:  Canon forms/fields + DetailCard + token colours (door style). Describe → urgency → confirm.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ActionButton } from "@/components/ui/actions"
import { SelectField, TextareaField } from "@/components/forms/fields"
import { DetailCard } from "@/components/detail/DetailCard"
import { toast } from "sonner"
import { Loader2, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react"
import { submitMaintenanceRequest } from "./actions"

interface Props {
  readonly isPleksTemplate: boolean
  readonly maintenanceClause: number | null
  readonly tenantLiabilityClause: number | null
}

const CATEGORIES = [
  { value: "", label: "Select category" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "structural", label: "Structural" },
  { value: "appliances", label: "Appliances" },
  { value: "pest_control", label: "Pest control" },
  { value: "keys_locks", label: "Keys / locks" },
  { value: "general", label: "General maintenance" },
  { value: "other", label: "Other" },
]

const URGENCIES = [
  { value: "emergency", label: "Emergency — immediate risk to health or safety" },
  { value: "urgent", label: "Urgent — needs attention within 48 hours" },
  { value: "routine", label: "Routine — can be scheduled within 7 days" },
  { value: "cosmetic", label: "Cosmetic — aesthetic issue only" },
]

const URGENCY_ICON: Record<string, string> = {
  emergency: "🚨",
  urgent: "🟠",
  routine: "🟡",
  cosmetic: "⚪",
}

type Step = 1 | 2 | 3

export function MaintenanceNewForm({
  isPleksTemplate,
  maintenanceClause,
  tenantLiabilityClause,
}: Props) {
  const router = useRouter()

  // Form state
  const [step, setStep] = useState<Step>(1)
  const [category, setCategory] = useState("")
  const [description, setDescription] = useState("")
  const [urgency, setUrgency] = useState("")
  const [aiUrgency, setAiUrgency] = useState<string | null>(null)
  const [aiRationale, setAiRationale] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Step 1 → 2: trigger Haiku triage
  async function handleNext1() {
    if (!category || description.trim().length < 20) return
    setAiLoading(true)
    setStep(2)

    try {
      const res = await fetch("/api/portal/maintenance/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, description }),
      })
      const data = await res.json() as { urgency: string | null; rationale: string | null }
      setAiUrgency(data.urgency)
      setAiRationale(data.rationale)
    } catch {
      // Silently fail — triage is advisory only
    } finally {
      setAiLoading(false)
    }
  }

  // Step 2 → 3
  function handleNext2() {
    if (!urgency) return
    setStep(3)
  }

  // Submit
  async function handleSubmit() {
    if (!consentChecked) return
    setSubmitting(true)

    const consentVersion: "v1_pleks_template" | "v1_custom_lease" =
      isPleksTemplate && maintenanceClause && tenantLiabilityClause
        ? "v1_pleks_template"
        : "v1_custom_lease"

    const result = await submitMaintenanceRequest({
      category,
      description,
      urgency,
      aiSuggestedUrgency: aiUrgency,
      consentVersion,
      photoStoragePaths: [],
    })

    setSubmitting(false)

    if (result.error) {
      toast.error(result.error)
      return
    }

    toast.success("Maintenance request submitted")
    router.push("/tenant/maintenance")
  }

  return (
    <div className="max-w-lg space-y-6">

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              s <= step ? "bg-brand text-white" : "bg-muted text-muted-foreground"
            }`}>{s}</span>
            {s < 3 && <div className={`h-px w-6 ${s < step ? "bg-brand" : "bg-border"}`} />}
          </div>
        ))}
        <span className="ml-1">
          {{ 1: "Describe", 2: "Urgency", 3: "Confirm" }[step]}
        </span>
      </div>

      {/* ── Step 1: Describe ── */}
      {step === 1 && (
        <div className="space-y-4">
          <SelectField label="Category" required value={category} onChange={setCategory} options={CATEGORIES} />

          <div>
            <TextareaField
              label="Describe the issue"
              value={description}
              onChange={(v) => setDescription(v.slice(0, 1000))}
              rows={5}
              placeholder="Describe what's happening, where it is, and when it started. The more detail you give, the faster it can be resolved."
            />
            <p className={`mt-1 text-xs ${description.length < 20 ? "text-muted-foreground" : "text-success"}`}>
              {description.length}/1000 {description.length < 20 && `— minimum 20 characters`}
            </p>
          </div>

          <ActionButton
            tone="primary"
            onClick={handleNext1}
            disabled={!category || description.trim().length < 20}
          >
            Next — set urgency
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </ActionButton>
        </div>
      )}

      {/* ── Step 2: Urgency ── */}
      {step === 2 && (
        <div className="space-y-4">

          {/* AI suggestion */}
          {aiLoading && (
            <div className="flex items-center gap-2.5 rounded-[var(--r-button)] border border-info/30 bg-info/5 px-4 py-3 text-sm">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-info" />
              Assessing urgency…
            </div>
          )}
          {!aiLoading && aiUrgency && aiUrgency !== urgency && (
            <div className="space-y-1 rounded-[var(--r-button)] border border-info/30 bg-info/5 px-4 py-3 text-sm">
              <p className="font-medium">
                {URGENCY_ICON[aiUrgency]} AI suggestion: {aiUrgency}
              </p>
              {aiRationale && <p className="text-muted-foreground">{aiRationale}</p>}
              <p className="text-xs text-muted-foreground">
                You can still select a different level — your agent will confirm priority.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <p className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">How urgent is this? <span className="text-primary">*</span></p>
            <div className="space-y-2">
              {URGENCIES.map((u) => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => setUrgency(u.value)}
                  className={`w-full rounded-[var(--r-button)] border px-4 py-3 text-left text-sm transition-colors ${
                    urgency === u.value
                      ? "border-brand bg-brand/5 font-medium text-brand"
                      : "border-border text-foreground hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {URGENCY_ICON[u.value]} {u.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <ActionButton tone="secondary" onClick={() => setStep(1)}>
              <ChevronLeft className="mr-1.5 h-4 w-4" />
              Back
            </ActionButton>
            <ActionButton tone="primary" onClick={handleNext2} disabled={!urgency}>
              Next — review & confirm
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </ActionButton>
          </div>
        </div>
      )}

      {/* ── Step 3: Consent + confirm ── */}
      {step === 3 && (
        <div className="space-y-4">

          {/* Summary */}
          <DetailCard title="Your request">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Category</span><span className="capitalize text-foreground">{category.replaceAll("_", " ")}</span></div>
              <div className="flex justify-between gap-3"><span className="text-muted-foreground">Urgency</span><span className="text-foreground">{URGENCY_ICON[urgency]} {urgency}</span></div>
              <div className="border-t border-border pt-2">
                <p className="mb-1 text-muted-foreground">Description</p>
                <p className="leading-relaxed text-foreground">{description}</p>
              </div>
            </div>
          </DetailCard>

          {/* Cost liability disclaimer */}
          <div className="space-y-3 rounded-[var(--r-button)] border border-warning/30 bg-warning/5 px-5 py-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-sm font-semibold text-foreground">Maintenance cost responsibility</p>
            </div>

            {isPleksTemplate && maintenanceClause && tenantLiabilityClause ? (
              <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <p>
                  Under <strong>Clause {maintenanceClause}</strong> of your lease agreement, the landlord is responsible
                  for maintaining the property in a habitable condition. However, <strong>Clause {tenantLiabilityClause}</strong> provides
                  that where maintenance or repair is required as a result of tenant negligence, misuse, or damage beyond
                  normal wear and tear, the cost of such repair — including any callout fee — shall be for the tenant&apos;s account.
                </p>
                <p>By submitting this request, you acknowledge that:</p>
                <ul className="space-y-1 list-none">
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />You have described the issue accurately and honestly</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />If the repair is found to be your responsibility under Clause {tenantLiabilityClause}, the cost may be added to your account</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />Your agent/landlord will assess responsibility before any cost is charged</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />You may dispute a cost allocation through your agent</li>
                </ul>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <p>
                  Under your lease agreement, the landlord is generally responsible for maintaining the property in a habitable
                  condition. However, if this issue is determined to have been caused by tenant negligence, misuse, or damage
                  beyond normal wear and tear, the cost of repair may be charged to you in accordance with the terms of your lease.
                </p>
                <p>By submitting this request, you acknowledge that:</p>
                <ul className="space-y-1 list-none">
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />You have described the issue accurately and honestly</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />If the repair is found to be your responsibility, the cost may be added to your account</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />Your agent/landlord will assess responsibility before any cost is charged</li>
                  <li className="flex items-start gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />You may dispute a cost allocation through your agent</li>
                </ul>
              </div>
            )}

            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="consent"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-brand cursor-pointer"
              />
              <label htmlFor="consent" className="text-sm cursor-pointer leading-relaxed">
                I understand and agree to proceed
              </label>
            </div>
          </div>

          <div className="flex gap-2">
            <ActionButton tone="secondary" onClick={() => setStep(2)} disabled={submitting}>
              <ChevronLeft className="mr-1.5 h-4 w-4" />
              Back
            </ActionButton>
            <ActionButton
              tone="primary"
              onClick={handleSubmit}
              disabled={!consentChecked || submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Submit request
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  )
}
