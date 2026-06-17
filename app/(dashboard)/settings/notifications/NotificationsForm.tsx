"use client"

/**
 * app/(dashboard)/settings/notifications/NotificationsForm.tsx — notification + email-setup forms
 *
 * Data:   GET/PATCH /api/org/notifications (NotificationSettings — one object)
 * Notes:  Rendered per tab by the Notifications category page. Each tab loads the FULL settings and saves
 *         the FULL object, so switching tabs never drops the other tab's saved fields. "notifications" =
 *         which events send (email categories + SMS); "email" = sender identity (From name + reply-to) +
 *         the sending-domain explanation. DetailCard grammar (supplier detail page) + canonical fields.
 */
import { useEffect, useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { DetailCard } from "@/components/detail/DetailCard"
import { FieldGrid, TextField } from "@/components/forms/fields"
import { toast } from "sonner"
import { Loader2, Lock, Info } from "lucide-react"
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

function ToggleRow({ label, description, checked, onChange, disabled = false }: Readonly<{
  label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}>) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 py-2.5 ${disabled ? "cursor-not-allowed opacity-60" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => { if (!disabled) onChange(e.target.checked) }}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 accent-primary"
      />
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
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

export function NotificationsForm({ tab }: Readonly<{ tab: "notifications" | "email" }>) {
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
      if (res.ok) toast.success("Saved")
      else {
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
    <div className="space-y-6">
      {tab === "notifications" ? <NotificationToggles settings={settings} set={set} /> : <EmailSetup settings={settings} set={set} />}
      <div className="flex justify-end">
        <ActionButton tone="primary" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="mr-1.5 size-4 animate-spin" />Saving…</> : "Save settings"}
        </ActionButton>
      </div>
    </div>
  )
}

type SectionProps = Readonly<{
  settings: NotificationSettings
  set: <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => void
}>

function NotificationToggles({ settings, set }: SectionProps) {
  return (
    <>
      <DetailCard title="Email notifications">
        <div className="divide-y divide-border/60">
          <ToggleRow label="Applications" description="Applicant confirmation, agent new-application alert, review reminders" checked={settings.email_applications} onChange={(v) => set("email_applications", v)} />
          <ToggleRow label="Maintenance" description="Tenant status updates, contractor assignment, landlord approval requests" checked={settings.email_maintenance} onChange={(v) => set("email_maintenance", v)} />
          <ToggleRow label="Arrears & payments" description="Payment reminders, overdue notices, receipt confirmations" checked={settings.email_arrears} onChange={(v) => set("email_arrears", v)} />
          <ToggleRow label="Inspections" description="Inspection scheduling, outcome reports, dispute window notices" checked={settings.email_inspections} onChange={(v) => set("email_inspections", v)} />
          <ToggleRow label="Lease & tenancy" description="Lease signing, renewal notices, move-out confirmations" checked={settings.email_lease} onChange={(v) => set("email_lease", v)} />
          <ToggleRow label="Statements & reports" description="Monthly owner statements, scheduled report delivery" checked={settings.email_statements} onChange={(v) => set("email_statements", v)} />
          <div className="pt-2">
            <p className="mb-1 text-xs text-muted-foreground">Always sent (legally required):</p>
            <MandatoryRow label="Letter of demand / final arrears notice" />
            <MandatoryRow label="CPA s14 renewal notice" />
            <MandatoryRow label="Deposit return schedule" />
            <MandatoryRow label="Inspection dispute window notice" />
            <MandatoryRow label="Lease termination notice" />
          </div>
        </div>
      </DetailCard>

      <DetailCard
        title="SMS notifications"
        headerAction={
          <label className="flex cursor-pointer items-center gap-2">
            <span className="text-xs text-muted-foreground">{settings.sms_enabled ? "Enabled" : "Disabled"}</span>
            <input type="checkbox" checked={settings.sms_enabled} onChange={(e) => set("sms_enabled", e.target.checked)} className="size-4 accent-primary" />
          </label>
        }
      >
        <p className="mb-2 text-xs text-muted-foreground">Provider: Africa&apos;s Talking · Cost: R0.30/SMS segment (passed through at cost)</p>
        <div className={`divide-y divide-border/60 ${!settings.sms_enabled ? "pointer-events-none opacity-50" : ""}`}>
          <ToggleRow label="Maintenance updates to tenants" description="Status changes, contractor on-the-way, completion" checked={settings.sms_maintenance} onChange={(v) => set("sms_maintenance", v)} disabled={!settings.sms_enabled} />
          <ToggleRow label="Inspection reminders" description="24h reminder before scheduled inspection" checked={settings.sms_inspections} onChange={(v) => set("sms_inspections", v)} disabled={!settings.sms_enabled} />
          <ToggleRow label="Arrears reminders" description="Overdue payment reminders (email preferred)" checked={settings.sms_arrears} onChange={(v) => set("sms_arrears", v)} disabled={!settings.sms_enabled} />
        </div>
      </DetailCard>
    </>
  )
}

function EmailSetup({ settings, set }: SectionProps) {
  const fromName = settings.email_from_name?.trim()
  const sender = `${fromName || "{Your organisation}"} via Pleks <notifications@pleks.co.za>`
  return (
    <>
      <div className="flex gap-3 rounded-[var(--r-button)] border border-border bg-muted/20 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            All email sends over Pleks&apos;s verified domain (<span className="font-mono text-foreground">pleks.co.za</span>),
            so it reaches inboxes reliably. You control how it&apos;s <em>labelled</em> and where replies go:
          </p>
          <p className="font-mono text-xs text-foreground">{sender}</p>
          <p>Replies go to your <strong>reply-to</strong> address below — never to Pleks.</p>
        </div>
      </div>

      <DetailCard title="Sender identity">
        <FieldGrid>
          <TextField
            label="From name"
            value={settings.email_from_name ?? ""}
            onChange={(v) => set("email_from_name", v || null)}
            placeholder="Your organisation name"
          />
          <TextField
            label="Reply-to email"
            type="email"
            value={settings.reply_to_email ?? ""}
            onChange={(v) => set("reply_to_email", v || null)}
            placeholder="replies@youragency.co.za"
          />
        </FieldGrid>
        <p className="mt-3 text-xs text-muted-foreground">
          From name is what recipients see (&ldquo;{fromName || "Your organisation"} via Pleks&rdquo;); reply-to is where
          tenant/landlord replies land. Both fall back to your organisation defaults when blank.
        </p>
      </DetailCard>
      {/* O-8: the "send from your own domain" card was a coming-soon teaser for the per-domain DKIM/SPF
          white-label feature, which the project has explicitly deferred to the (not-yet-live) bespoke tier.
          Advertising it to every tier as "being scoped now" overstated the roadmap, so it's removed until
          the real bespoke white-label surface ships (it belongs behind the bespoke tier, not in the
          general notifications settings). */}
    </>
  )
}
