"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, AlertTriangle, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react"
import { submitMaintenanceRequest } from "./actions"

interface Props {
  readonly isPleksTemplate: boolean
  readonly maintenanceClause: number | null
  readonly tenantLiabilityClause: number | null
}

const CATEGORIES = [
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
    router.push("/portal/maintenance")
  }

  return (
    <div className="max-w-lg space-y-6">

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
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
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v ?? "")}>
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Describe the issue *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Describe what's happening, where it is, and when it started. The more detail you give, the faster it can be resolved."
              className="resize-none text-sm"
              minLength={20}
              maxLength={1000}
            />
            <p className={`text-xs ${description.length < 20 ? "text-muted-foreground" : "text-success"}`}>
              {description.length}/1000 {description.length < 20 && `— minimum 20 characters`}
            </p>
          </div>

          <Button
            onClick={handleNext1}
            disabled={!category || description.trim().length < 20}
          >
            Next — set urgency
            <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── Step 2: Urgency ── */}
      {step === 2 && (
        <div className="space-y-4">

          {/* AI suggestion */}
          {aiLoading && (
            <div className="rounded-xl border border-info/30 bg-info/5 px-4 py-3 flex items-center gap-2.5 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-info shrink-0" />
              Assessing urgency…
            </div>
          )}
          {!aiLoading && aiUrgency && aiUrgency !== urgency && (
            <div className="rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm space-y-1">
              <p className="font-medium">
                {URGENCY_ICON[aiUrgency]} AI suggestion: {aiUrgency}
              </p>
              {aiRationale && <p className="text-muted-foreground">{aiRationale}</p>}
              <p className="text-muted-foreground text-xs">
                You can still select a different level — your agent will confirm priority.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>How urgent is this? *</Label>
            <div className="space-y-2">
              {URGENCIES.map((u) => (
                <button
                  key={u.value}
                  type="button"
                  onClick={() => setUrgency(u.value)}
                  className={`w-full text-left rounded-xl border px-4 py-3 text-sm transition-colors ${
                    urgency === u.value
                      ? "border-brand bg-brand/5 text-brand font-medium"
                      : "border-border/60 hover:border-border text-foreground"
                  }`}
                >
                  {URGENCY_ICON[u.value]} {u.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleNext2} disabled={!urgency}>
              Next — review & confirm
              <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Consent + confirm ── */}
      {step === 3 && (
        <div className="space-y-4">

          {/* Summary */}
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-2 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-3">Your request</p>
            <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="capitalize">{category.replaceAll("_", " ")}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Urgency</span><span>{URGENCY_ICON[urgency]} {urgency}</span></div>
            <div className="pt-2 border-t border-border/60">
              <p className="text-muted-foreground mb-1">Description</p>
              <p className="leading-relaxed">{description}</p>
            </div>
          </div>

          {/* Cost liability disclaimer */}
          <div className="rounded-xl border border-warning/30 bg-warning/5 px-5 py-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <p className="text-sm font-semibold">Maintenance cost responsibility</p>
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
            <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
              <ChevronLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!consentChecked || submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Submit request
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
