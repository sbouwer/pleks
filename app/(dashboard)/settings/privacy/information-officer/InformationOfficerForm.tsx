/**
 * app/(dashboard)/settings/privacy/information-officer/InformationOfficerForm.tsx — IO edit form
 *
 * Auth:   isAdmin prop gate — read-only if non-admin
 * Data:   PATCH /api/settings/information-officer (stores in organisations.settings.information_officer)
 */
"use client"

import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

interface IoDetails {
  name?: string
  email?: string
  postal_address?: string
  phone?: string
}

interface Props {
  orgId: string
  initialValues: IoDetails
  isAdmin: boolean
}

export function InformationOfficerForm({ orgId, initialValues, isAdmin }: Readonly<Props>) {
  const [values, setValues] = useState<IoDetails>(initialValues)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const res = await fetch("/api/settings/information-officer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, information_officer: values }),
      })

      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? "Failed to save")
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSaving(false)
    }
  }

  const field = (
    id: keyof IoDetails,
    label: string,
    placeholder: string,
    multiline = false,
  ) => (
    <div className="space-y-1.5">
      <label className="text-sm font-medium" htmlFor={id}>{label}</label>
      {multiline ? (
        <Textarea
          id={id}
          placeholder={placeholder}
          value={values[id] ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
          disabled={!isAdmin}
          className="resize-none"
          rows={3}
        />
      ) : (
        <Input
          id={id}
          placeholder={placeholder}
          value={values[id] ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, [id]: e.target.value }))}
          disabled={!isAdmin}
        />
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {field("name", "Full name", "e.g. Jane Smith")}
      {field("email", "Email address", "io@youragency.co.za")}
      {field("phone", "Phone number", "+27 11 000 0000")}
      {field("postal_address", "Postal address", "PO Box 1, Johannesburg, 2000", true)}

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          Only owners and property managers can update Information Officer details.
        </p>
      )}

      {isAdmin && (
        <div className="flex items-center gap-3">
          <ActionButton tone="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </ActionButton>
          {saved && <span className="text-sm text-green-600">Saved</span>}
          {error && <span className="text-sm text-destructive">{error}</span>}
        </div>
      )}
    </div>
  )
}
