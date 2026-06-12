"use client"

/**
 * app/(dashboard)/settings/configuration/ConfigurationForm.tsx — Organisation communication preferences (Organisation → Configuration tab)
 *
 * Route:  /settings/details?tab=configuration
 * Auth:   gateway (dashboard layout)
 * Data:   initialSettings passed as props; saveOrgConfiguration server action
 * Notes:  Canonical grammar (SectLabel + FieldGrid + forms/fields), full-width, no shadcn Card / collapsible.
 *         Header + subtext are owned by the Organisation DetailPageLayout.
 */
import { useState } from "react"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { FieldGrid, SelectField, TextField, type FieldOption } from "@/components/forms/fields"
import { SectLabel } from "@/components/parties/partyFields"
import { saveOrgConfiguration } from "@/lib/actions/configuration"

interface OrgSettings {
  preferences_version?: number
  communication?: {
    tone_tenant?: string
    tone_owner?: string
    managed_by_label?: string
    sms_fallback_enabled?: boolean
    sms_fallback_delay_hours?: number
  }
}

const TONE_OPTIONS: FieldOption[] = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "firm", label: "Firm" },
]

const MANAGED_BY_OPTIONS: FieldOption[] = [
  { value: "organisation", label: "Organisation name" },
  { value: "agent", label: "Agent name" },
  { value: "self_managed", label: "Self-managed" },
]

export function ConfigurationForm({ initialSettings }: Readonly<{ initialSettings: OrgSettings }>) {
  const comm = initialSettings.communication ?? {}

  const [toneTenant, setToneTenant] = useState(comm.tone_tenant ?? "professional")
  const [toneOwner, setToneOwner] = useState(comm.tone_owner ?? "professional")
  const [managedByLabel, setManagedByLabel] = useState(comm.managed_by_label ?? "organisation")
  const [smsFallbackEnabled, setSmsFallbackEnabled] = useState(comm.sms_fallback_enabled ?? false)
  const [smsFallbackDelayHours, setSmsFallbackDelayHours] = useState(comm.sms_fallback_delay_hours ?? 4)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      const fd = new FormData()
      fd.set("tone_tenant", toneTenant)
      fd.set("tone_owner", toneOwner)
      fd.set("managed_by_label", managedByLabel)
      fd.set("sms_fallback_enabled", String(smsFallbackEnabled))
      fd.set("sms_fallback_delay_hours", String(smsFallbackDelayHours))
      const result = await saveOrgConfiguration(fd)
      if (result.error) toast.error(result.error)
      else toast.success("Configuration saved")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SectLabel n="01">Communication</SectLabel>
      <FieldGrid>
        <div className="space-y-1">
          <SelectField label="Tone to tenants" value={toneTenant} onChange={setToneTenant} options={TONE_OPTIONS} />
          <p className="text-xs text-muted-foreground">Writing style for automated messages sent to tenants.</p>
        </div>
        <div className="space-y-1">
          <SelectField label="Tone to owners" value={toneOwner} onChange={setToneOwner} options={TONE_OPTIONS} />
          <p className="text-xs text-muted-foreground">Writing style for automated messages sent to property owners.</p>
        </div>
        <div className="space-y-1">
          <SelectField label="Managed-by label" value={managedByLabel} onChange={setManagedByLabel} options={MANAGED_BY_OPTIONS} />
          <p className="text-xs text-muted-foreground">How your organisation is referred to in tenant-facing communications.</p>
        </div>
      </FieldGrid>

      <div className="mt-8">
        <SectLabel n="02">Delivery</SectLabel>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">SMS fallback</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Send an SMS if a WhatsApp message isn&apos;t delivered after the delay.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={smsFallbackEnabled}
              aria-label="SMS fallback"
              onClick={() => setSmsFallbackEnabled((v) => !v)}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                smsFallbackEnabled ? "bg-primary" : "bg-input",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none inline-block size-5 rounded-full bg-background shadow-lg ring-0 transition-transform",
                  smsFallbackEnabled ? "translate-x-5" : "translate-x-0",
                ].join(" ")}
              />
            </button>
          </div>
          {smsFallbackEnabled && (
            <div className="max-w-[12rem]">
              <TextField
                label="SMS fallback delay (hours)"
                value={String(smsFallbackDelayHours)}
                onChange={(v) => setSmsFallbackDelayHours(Math.max(1, Math.min(72, Number(v) || 1)))}
                type="number"
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 flex justify-end border-t border-border/40 pt-4">
        <ActionButton tone="primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</ActionButton>
      </div>
    </div>
  )
}
