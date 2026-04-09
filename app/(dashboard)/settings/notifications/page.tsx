"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, Lock } from "lucide-react"
import type { NotificationSettings } from "@/app/api/org/notifications/route"

const DEFAULT: NotificationSettings = {
  email_from_name: null,
  reply_to_email: null,
  email_applications: true,
  email_maintenance: true,
  email_arrears: true,
  email_inspections: true,
  email_lease: true,
  email_statements: true,
  sms_enabled: false,
  sms_maintenance: true,
  sms_arrears: false,
  sms_inspections: true,
}

interface ToggleRowProps {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

function ToggleRow({ label, description, checked, onChange, disabled = false }: Readonly<ToggleRowProps>) {
  return (
    <label className={`flex items-start gap-3 py-2.5 cursor-pointer ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { if (!disabled) onChange(e.target.checked) }}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0"
      />
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </label>
  )
}

function MandatoryRow({ label }: Readonly<{ label: string }>) {
  return (
    <div className="flex items-center gap-3 py-2.5 opacity-60">
      <Lock className="size-4 shrink-0 text-muted-foreground" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export default function NotificationsSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/org/notifications")
      .then((r) => r.json())
      .then((data: NotificationSettings) => { setSettings(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  function set<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/org/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success("Notification settings saved")
      } else {
        const data = await res.json() as { error?: string }
        toast.error(data.error ?? "Failed to save")
      }
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-2xl">Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Control which email and SMS notifications are sent to tenants and landlords.
          Tenants can also manage their own preferences via the unsubscribe link in emails.
        </p>
      </div>

      {/* Email sender */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Email sender</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">From name</label>
            <Input
              placeholder="Leave blank to use your organisation name"
              value={settings.email_from_name ?? ""}
              onChange={(e) => set("email_from_name", e.target.value || null)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Reply-to email</label>
            <Input
              type="email"
              placeholder="Leave blank to use your organisation email"
              value={settings.reply_to_email ?? ""}
              onChange={(e) => set("reply_to_email", e.target.value || null)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Email categories */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Email notifications</CardTitle></CardHeader>
        <CardContent className="divide-y divide-border/60">
          <ToggleRow
            label="Applications"
            description="Applicant confirmation, agent new-application alert, review reminders"
            checked={settings.email_applications}
            onChange={(v) => set("email_applications", v)}
          />
          <ToggleRow
            label="Maintenance"
            description="Tenant status updates, contractor assignment, landlord approval requests"
            checked={settings.email_maintenance}
            onChange={(v) => set("email_maintenance", v)}
          />
          <ToggleRow
            label="Arrears & payments"
            description="Payment reminders, overdue notices, receipt confirmations"
            checked={settings.email_arrears}
            onChange={(v) => set("email_arrears", v)}
          />
          <ToggleRow
            label="Inspections"
            description="Inspection scheduling, outcome reports, dispute window notices"
            checked={settings.email_inspections}
            onChange={(v) => set("email_inspections", v)}
          />
          <ToggleRow
            label="Lease & tenancy"
            description="Lease signing, renewal notices, move-out confirmations"
            checked={settings.email_lease}
            onChange={(v) => set("email_lease", v)}
          />
          <ToggleRow
            label="Statements & reports"
            description="Monthly owner statements, scheduled report delivery"
            checked={settings.email_statements}
            onChange={(v) => set("email_statements", v)}
          />

          {/* Mandatory — always on */}
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-1">Always sent (legally required):</p>
            <MandatoryRow label="Letter of demand / final arrears notice" />
            <MandatoryRow label="CPA s14 renewal notice" />
            <MandatoryRow label="Deposit return schedule" />
            <MandatoryRow label="Inspection dispute window notice" />
            <MandatoryRow label="Lease termination notice" />
          </div>
        </CardContent>
      </Card>

      {/* SMS */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">SMS notifications</CardTitle>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-muted-foreground">
                {settings.sms_enabled ? "Enabled" : "Disabled"}
              </span>
              <input
                type="checkbox"
                checked={settings.sms_enabled}
                onChange={(e) => set("sms_enabled", e.target.checked)}
                className="size-4"
              />
            </label>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Provider: Africa&apos;s Talking · Cost: R0.30/SMS segment (passed through at cost)
          </p>
          <div className={`divide-y divide-border/60 ${!settings.sms_enabled ? "opacity-50 pointer-events-none" : ""}`}>
            <ToggleRow
              label="Maintenance updates to tenants"
              description="Status changes, contractor on-the-way, completion"
              checked={settings.sms_maintenance}
              onChange={(v) => set("sms_maintenance", v)}
              disabled={!settings.sms_enabled}
            />
            <ToggleRow
              label="Inspection reminders"
              description="24h reminder before scheduled inspection"
              checked={settings.sms_inspections}
              onChange={(v) => set("sms_inspections", v)}
              disabled={!settings.sms_enabled}
            />
            <ToggleRow
              label="Arrears reminders"
              description="Overdue payment reminders (email preferred)"
              checked={settings.sms_arrears}
              onChange={(v) => set("sms_arrears", v)}
              disabled={!settings.sms_enabled}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <><Loader2 className="size-4 mr-1.5 animate-spin" />Saving…</> : "Save settings"}
      </Button>
    </div>
  )
}
