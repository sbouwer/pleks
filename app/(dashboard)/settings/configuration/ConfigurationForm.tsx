"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormSelect } from "@/components/ui/FormSelect"
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

interface Props {
  initialSettings: OrgSettings
}

const TONE_OPTIONS = [
  { value: "friendly", label: "Friendly" },
  { value: "professional", label: "Professional" },
  { value: "firm", label: "Firm" },
]

const MANAGED_BY_OPTIONS = [
  { value: "organisation", label: "Organisation name" },
  { value: "agent", label: "Agent name" },
  { value: "self_managed", label: "Self-managed" },
]

export function ConfigurationForm({ initialSettings }: Readonly<Props>) {
  const comm = initialSettings.communication ?? {}

  const [communicationOpen, setCommunicationOpen] = useState(true)
  const [toneTenant, setToneTenant] = useState(comm.tone_tenant ?? "professional")
  const [toneOwner, setToneOwner] = useState(comm.tone_owner ?? "professional")
  const [managedByLabel, setManagedByLabel] = useState(comm.managed_by_label ?? "organisation")
  const [smsFallbackEnabled, setSmsFallbackEnabled] = useState(comm.sms_fallback_enabled ?? false)
  const [smsFallbackDelayHours, setSmsFallbackDelayHours] = useState(
    comm.sms_fallback_delay_hours ?? 4,
  )
  const [saving, setSaving] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    try {
      const formData = new FormData(e.currentTarget)
      // Sync controlled state into FormData (FormSelect uses hidden inputs via radix)
      formData.set("tone_tenant", toneTenant)
      formData.set("tone_owner", toneOwner)
      formData.set("managed_by_label", managedByLabel)
      formData.set("sms_fallback_enabled", String(smsFallbackEnabled))
      formData.set("sms_fallback_delay_hours", String(smsFallbackDelayHours))

      const result = await saveOrgConfiguration(formData)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success("Configuration saved")
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-3xl mb-6">Configuration</h1>

      <form ref={formRef} onSubmit={handleSave} className="space-y-4">
        {/* Communication collapsible section */}
        <div className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setCommunicationOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
          >
            <span className="font-medium text-sm">Communication</span>
            {communicationOpen ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>

          {communicationOpen && (
            <div className="px-4 py-4 space-y-5">
              {/* Tone to tenants */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tone to tenants</label>
                <p className="text-xs text-muted-foreground">
                  Sets the writing style for automated messages sent to tenants.
                </p>
                <FormSelect
                  name="tone_tenant"
                  options={TONE_OPTIONS}
                  value={toneTenant}
                  onValueChange={setToneTenant}
                  className="max-w-xs"
                />
              </div>

              {/* Tone to owners */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tone to owners</label>
                <p className="text-xs text-muted-foreground">
                  Sets the writing style for automated messages sent to property owners.
                </p>
                <FormSelect
                  name="tone_owner"
                  options={TONE_OPTIONS}
                  value={toneOwner}
                  onValueChange={setToneOwner}
                  className="max-w-xs"
                />
              </div>

              {/* Managed by label */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Managed by label</label>
                <p className="text-xs text-muted-foreground">
                  How your organisation is referred to in tenant-facing communications.
                </p>
                <FormSelect
                  name="managed_by_label"
                  options={MANAGED_BY_OPTIONS}
                  value={managedByLabel}
                  onValueChange={setManagedByLabel}
                  className="max-w-xs"
                />
              </div>

              {/* SMS fallback toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between max-w-xs">
                  <div>
                    <p className="text-sm font-medium">SMS fallback</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Send SMS if WhatsApp message is not delivered after the delay.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={smsFallbackEnabled}
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
              </div>

              {/* SMS fallback delay — only shown when SMS fallback is on */}
              {smsFallbackEnabled && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium" htmlFor="sms_fallback_delay_hours">
                    SMS fallback delay (hours)
                  </label>
                  <p className="text-xs text-muted-foreground">
                    How long to wait before sending the SMS fallback after a failed WhatsApp delivery.
                  </p>
                  <input
                    id="sms_fallback_delay_hours"
                    name="sms_fallback_delay_hours"
                    type="number"
                    min={1}
                    max={72}
                    value={smsFallbackDelayHours}
                    onChange={(e) => setSmsFallbackDelayHours(Number(e.target.value))}
                    className="flex h-9 w-24 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" />
                Saving&hellip;
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
