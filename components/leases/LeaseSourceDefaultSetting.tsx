"use client"

/**
 * components/leases/LeaseSourceDefaultSetting.tsx — Settings control for the org's default lease document source
 *
 * Route:  rendered on /settings/lease-templates
 * Auth:   setDefaultLeaseDocumentSource enforces requireAgentWriteAccess (agent write gate)
 * Data:   reads organisations.default_lease_document_source via useOrg(); writes via setDefaultLeaseDocumentSource
 * Notes:  ADDENDUM_LEASE_CREATION_MODAL Phase 3 / D-7 — the post-onboarding editing surface for the Axis-A
 *         default that the lease CreateStep reads. 'external' (Upload signed leases) maps to the per-lease
 *         'uploaded' source; null = undecided → the lease step shows the fork every time.
 */
import { useState } from "react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { useOrg } from "@/hooks/useOrg"
import { setDefaultLeaseDocumentSource, type LeaseDocumentSource } from "@/lib/actions/configuration"

type Choice = LeaseDocumentSource | "undecided"

const OPTIONS: ReadonlyArray<{ value: Choice; label: string; sub: string }> = [
  { value: "pleks",     label: "Generate with Pleks",   sub: "Default new leases to the Pleks-generated template" },
  { value: "external",  label: "Upload signed leases",  sub: "Default to uploading your own signed lease document" },
  { value: "undecided", label: "Decide per lease",      sub: "Show both options each time a lease is created" },
]

function currentChoice(raw: unknown): Choice {
  if (raw === "pleks") return "pleks"
  if (raw === "external") return "external"
  return "undecided"
}

export function LeaseSourceDefaultSetting() {
  const { org, loading } = useOrg()
  const stored = currentChoice(org?.default_lease_document_source)
  const [choice, setChoice] = useState<Choice>(stored)
  const [saving, setSaving] = useState(false)

  async function handleChange(next: Choice) {
    setChoice(next)
    setSaving(true)
    const result = await setDefaultLeaseDocumentSource(next === "undecided" ? null : next)
    setSaving(false)
    if (result.error) {
      setChoice(stored)
      toast.error(result.error)
      return
    }
    toast.success("Saved your lease default")
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-5">
        <fieldset disabled={loading || saving} className="space-y-3">
          <legend className="text-sm font-semibold">Default lease document source</legend>
          <p className="text-xs text-muted-foreground">
            When you create a lease, Pleks can pre-select how it&apos;s produced. Leave this on
            {" "}<span className="font-medium">Decide per lease</span> to choose each time.
          </p>
          <div className="space-y-2">
            {OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="default-lease-source"
                  className="mt-1 accent-brand size-4 shrink-0"
                  checked={choice === opt.value}
                  onChange={() => handleChange(opt.value)}
                />
                <span>
                  <span className="block text-sm">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.sub}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </CardContent>
    </Card>
  )
}
