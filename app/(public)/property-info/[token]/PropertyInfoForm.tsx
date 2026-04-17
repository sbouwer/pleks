"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { submitPropertyInfo } from "./actions"

// ── Field definitions per topic ────────────────────────────────────────────────

type FieldType = "text" | "email" | "tel" | "number" | "date" | "radio" | "textarea"

interface FieldDef {
  key:         string
  label:       string
  help?:       string
  type:        FieldType
  options?:    Array<{ value: string; label: string }>
  placeholder?: string
}

const TOPIC_FIELDS: Record<string, FieldDef[]> = {
  insurance: [
    { key: "insurance_provider",      label: "Insurer",             type: "text",   placeholder: "e.g. Santam, OUTsurance, Hollard" },
    { key: "insurance_policy_number", label: "Policy number",       type: "text",   placeholder: "POL-0000000" },
    { key: "insurance_renewal_date",  label: "Renewal date",        type: "date" },
    { key: "insurance_replacement_value_cents", label: "Replacement value (R)", type: "number", placeholder: "2500000", help: "Enter rands; we'll convert for you." },
  ],
  landlord: [
    { key: "entity_type", label: "Entity type", type: "radio", options: [
      { value: "individual", label: "Individual" },
      { value: "company",    label: "Company" },
      { value: "trust",      label: "Trust" },
    ] },
    { key: "first_name",   label: "First name",   type: "text" },
    { key: "last_name",    label: "Last name",    type: "text" },
    { key: "company_name", label: "Company / trust name",  type: "text", help: "Skip for individuals." },
    { key: "email",        label: "Email",        type: "email" },
    { key: "phone",        label: "Phone",        type: "tel" },
  ],
  scheme: [
    { key: "scheme_name",          label: "Scheme name",         type: "text", placeholder: "e.g. Vineyard Heights BC" },
    { key: "managing_agent_name",  label: "Managing agent name", type: "text" },
    { key: "managing_agent_email", label: "Managing agent email", type: "email" },
    { key: "managing_agent_phone", label: "Managing agent phone", type: "tel" },
  ],
  banking: [
    { key: "bank_name",           label: "Bank name",         type: "text", placeholder: "e.g. ABSA, Standard Bank" },
    { key: "bank_account_number", label: "Account number",    type: "text" },
    { key: "bank_branch_code",    label: "Branch code",       type: "text", help: "6 digits — universal branch codes are supported." },
  ],
  broker: [
    { key: "notes", label: "Broker details", type: "textarea", help: "Name, company, email, phone — anything the agent needs." },
  ],
  compliance: [
    { key: "notes", label: "Compliance certificate details", type: "textarea", help: "List which certificates you have and their expiry dates." },
  ],
  documents: [
    { key: "notes", label: "Document details", type: "textarea", help: "Describe what you have available. The agent will follow up to collect files directly." },
  ],
  other: [
    { key: "notes", label: "Your response", type: "textarea" },
  ],
}

// ── Field renderer ────────────────────────────────────────────────────────────

interface FieldProps {
  def:      FieldDef
  value:    string
  onChange: (v: string) => void
}

function Field({ def, value, onChange }: FieldProps) {
  const inputId = `field-${def.key}`
  if (def.type === "radio" && def.options) {
    return (
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium mb-1">{def.label}</legend>
        <div className="grid grid-cols-3 gap-2">
          {def.options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={value === opt.value}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition-colors",
                value === opt.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:border-primary/40",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>
    )
  }

  if (def.type === "textarea") {
    return (
      <div className="space-y-1">
        <label htmlFor={inputId} className="text-sm font-medium">{def.label}</label>
        {def.help && <p className="text-xs text-muted-foreground -mt-0.5">{def.help}</p>}
        <textarea
          id={inputId}
          rows={4}
          placeholder={def.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="text-sm font-medium">{def.label}</label>
      {def.help && <p className="text-xs text-muted-foreground -mt-0.5">{def.help}</p>}
      <input
        id={inputId}
        type={def.type}
        placeholder={def.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface PropertyInfoFormProps {
  token:         string
  requestId:     string
  topic:         string
  missingFields: string[]
  agencyName:    string
}

export function PropertyInfoForm({ token, topic, missingFields, agencyName }: PropertyInfoFormProps) {
  const [values, setValues]           = useState<Record<string, string>>({})
  const [consent, setConsent]         = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [pending, startTransition]    = useTransition()

  const allFields = TOPIC_FIELDS[topic] ?? TOPIC_FIELDS.other
  // Keep fields whose key is in missingFields, plus entity_type (always shown for landlord) and notes (free-form)
  const shownFields = allFields.filter((f) =>
    missingFields.includes(f.key) || f.key === "entity_type" || f.key === "notes",
  )

  function update(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit() {
    if (!consent) {
      setError("Please tick the POPIA consent box before submitting.")
      return
    }
    setError(null)
    startTransition(async () => {
      // Convert values to string|null map
      const toSubmit: Record<string, string | null> = {}
      for (const [k, v] of Object.entries(values)) {
        toSubmit[k] = v.trim() === "" ? null : v.trim()
      }
      const result = await submitPropertyInfo({
        token,
        consentGiven: consent,
        values:       toSubmit,
      })
      if (result.ok) setSubmitted(true)
      else setError(result.error ?? "Submission failed")
    })
  }

  if (submitted) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center space-y-3">
        <h2 className="font-heading text-xl">Thank you</h2>
        <p className="text-sm text-muted-foreground">
          Your information has been submitted to {agencyName}. You can close this page now.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="space-y-5">
      {shownFields.map((def) => (
        <Field
          key={def.key}
          def={def}
          value={values[def.key] ?? ""}
          onChange={(v) => update(def.key, v)}
        />
      ))}

      {/* POPIA consent */}
      <label className="flex items-start gap-2 rounded-lg border bg-muted/20 p-3 cursor-pointer">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-xs text-muted-foreground">
          I consent to {agencyName} processing the information I submit above for the purpose of
          setting up this property on their system. I understand my information will be stored under
          the Protection of Personal Information Act (POPIA).
        </span>
      </label>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button type="submit" disabled={pending || !consent} className="w-full">
        {pending ? "Submitting…" : "Submit"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Prefer email? Just reply to the email that brought you here — {agencyName} will handle it.
      </p>
    </form>
  )
}
