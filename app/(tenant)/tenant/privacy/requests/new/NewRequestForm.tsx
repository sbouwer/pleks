/**
 * app/(tenant)/tenant/privacy/requests/new/NewRequestForm.tsx — Client form for new DSR
 *
 * Auth:   Tenant portal session
 * Data:   POST /api/popia/request
 * Notes:  Wrapped in Suspense by page.tsx — useSearchParams() requires it in Next.js App Router.
 */
"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState } from "react"
import { RequestTypePicker } from "@/components/popia/RequestTypePicker"
import { NukeCarveoutDisclosure } from "@/components/popia/NukeCarveoutDisclosure"
import { ActionButton, IconButton } from "@/components/ui/actions"
import { TextareaField } from "@/components/forms/fields"
import { ChevronLeft } from "lucide-react"
import type { RequestType } from "@/lib/popia/requests"
import type { AcknowledgedCarveout } from "@/lib/popia/erasure"

type Step = "pick" | "nuke_disclosure" | "form" | "submitting" | "done"

export default function NewRequestForm() {
  const router = useRouter()
  const params = useSearchParams()
  const orgId = params.get("org") ?? ""

  const [step, setStep] = useState<Step>("pick")
  const [requestType, setRequestType] = useState<RequestType | null>(null)
  const [narrative, setNarrative] = useState("")
  const [carveouts, setCarveouts] = useState<AcknowledgedCarveout[]>([])
  const [error, setError] = useState<string | null>(null)

  const handleTypeSelected = (type: RequestType) => {
    setRequestType(type)
    if (type === "nuke") {
      setStep("nuke_disclosure")
    } else {
      setStep("form")
    }
  }

  const handleNukeConfirmed = (acknowledged: AcknowledgedCarveout[]) => {
    setCarveouts(acknowledged)
    setStep("form")
  }

  const handleSubmit = async () => {
    if (!requestType || !orgId) return
    setStep("submitting")
    setError(null)

    try {
      const res = await fetch("/api/popia/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          request_type: requestType,
          subject_narrative: narrative || undefined,
          request_scope: requestType === "nuke" ? { acknowledged_carveouts: carveouts } : {},
        }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Failed to submit request")
      }

      setStep("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
      setStep("form")
    }
  }

  if (step === "done") {
    return (
      <div className="max-w-lg mx-auto py-8 px-4 text-center space-y-4">
        <h1 className="text-xl font-semibold">Request submitted</h1>
        <p className="text-sm text-muted-foreground">
          Your request has been received. The agency has 30 calendar days to respond. You will
          receive an email when the status changes.
        </p>
        <ActionButton tone="secondary" onClick={() => router.push("/tenant/privacy/requests")}>
          View your requests
        </ActionButton>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <IconButton
          icon={<ChevronLeft className="size-4" />}
          label="Go back"
          className="size-8"
          onClick={() => {
            if (step === "form" || step === "nuke_disclosure") setStep("pick")
            else router.push("/tenant/privacy")
          }}
        />
        <h1 className="text-lg font-semibold">
          {step === "pick" && "What would you like to do?"}
          {step === "nuke_disclosure" && "Full erasure — please read carefully"}
          {(step === "form" || step === "submitting") && `${requestType?.replace("_", " ")} request`}
        </h1>
      </div>

      {step === "pick" && <RequestTypePicker onSelect={handleTypeSelected} />}

      {step === "nuke_disclosure" && (
        <NukeCarveoutDisclosure
          agencyName="your agency"
          will_delete={[
            { label: "Your tenant profile, contact details, emergency contacts" },
            { label: "Your household member list" },
            { label: "Your communication history" },
            { label: "Your maintenance request history" },
            { label: "Your portal account and login history" },
          ]}
          will_anonymise={[
            { label: "Rent payment ledger", reason: "retained 5 years — Tax Administration Act" },
            { label: "Trust account transactions", reason: "retained 5 years — PPRA" },
          ]}
          carveouts={[
            {
              category: "lease_documents",
              retained_until: "",
              reason: "Retained 5 years after lease end — Prescription Act",
            },
            {
              category: "inspection_photos",
              retained_until: "",
              reason: "Retained during lease + 3 years after end — Rental Housing Act s5(3)",
            },
            {
              category: "consent_log",
              retained_until: "",
              reason: "Immutable — POPIA s17 accountability principle",
            },
          ]}
          onConfirmed={handleNukeConfirmed}
          onCancel={() => setStep("pick")}
        />
      )}

      {(step === "form" || step === "submitting") && (
        <div className="space-y-4">
          <TextareaField
            label="Additional context (optional)"
            placeholder="Describe your request in more detail if needed..."
            value={narrative}
            onChange={setNarrative}
            rows={4}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3">
            <ActionButton tone="secondary" onClick={() => setStep("pick")} disabled={step === "submitting"}>
              Back
            </ActionButton>
            <ActionButton tone="primary" onClick={handleSubmit} disabled={step === "submitting"} className="flex-1">
              {step === "submitting" ? "Submitting..." : "Submit request"}
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  )
}
