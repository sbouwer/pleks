"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Trash2 } from "lucide-react"
import { createClient as createBrowserClient } from "@/lib/supabase/client"
import { REPORT_LABELS } from "@/lib/reports/types"

interface ReportConfig {
  id: string
  report_type: string
  name: string
  schedule_day: number | null
  recipient_emails: string[] | null
  is_scheduled: boolean
  last_sent_at: string | null
}

export default function ReportSettingsPage() {
  const [configs, setConfigs] = useState<ReportConfig[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newConfig, setNewConfig] = useState({
    report_type: "portfolio_summary",
    name: "",
    schedule_day: 2,
    recipient_emails: "",
  })
  const [saving, setSaving] = useState(false)

  const supabase = createBrowserClient()

  useEffect(() => {
    loadConfigs()
  }, [])

  async function loadConfigs() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (!membership) return

    const { data } = await supabase
      .from("report_configs")
      .select("*")
      .eq("org_id", membership.org_id)
      .eq("is_scheduled", true)
      .order("created_at")

    setConfigs(data ?? [])
  }

  async function handleAdd() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from("user_orgs")
      .select("org_id")
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single()

    if (!membership) return

    const emails = newConfig.recipient_emails
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)

    await supabase.from("report_configs").insert({
      org_id: membership.org_id,
      report_type: newConfig.report_type,
      name: newConfig.name || (REPORT_LABELS[newConfig.report_type as keyof typeof REPORT_LABELS] ?? newConfig.report_type),
      schedule_day: newConfig.schedule_day,
      recipient_emails: emails,
      is_scheduled: true,
      period_type: "last_month",
      created_by: user.id,
    })

    setShowAdd(false)
    setNewConfig({ report_type: "portfolio_summary", name: "", schedule_day: 2, recipient_emails: "" })
    setSaving(false)
    loadConfigs()
  }

  async function handleDelete(id: string) {
    await supabase.from("report_configs").delete().eq("id", id)
    loadConfigs()
  }

  return (
    <div>
      <h2 className="font-heading text-xl mb-4">Scheduled Reports</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Scheduled reports are emailed on the configured day each month. Available on Firm tier only.
      </p>

      {configs.length > 0 ? (
        <div className="space-y-3 mb-6">
          {configs.map((c) => (
            <Card key={c.id}>
              <CardContent className="pt-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-sm">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {REPORT_LABELS[c.report_type as keyof typeof REPORT_LABELS] ?? c.report_type} — Day {c.schedule_day} of month
                  </p>
                  <p className="text-xs text-muted-foreground">
                    To: {c.recipient_emails?.join(", ") ?? "—"}
                  </p>
                  {c.last_sent_at && (
                    <p className="text-xs text-muted-foreground">Last sent: {new Date(c.last_sent_at).toLocaleDateString("en-ZA")}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mb-6">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">No scheduled reports configured.</p>
          </CardContent>
        </Card>
      )}

      {showAdd ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Add Scheduled Report</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">Report type</Label>
              <Select value={newConfig.report_type} onValueChange={(v) => setNewConfig((p) => ({ ...p, report_type: v ?? "portfolio_summary" }))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REPORT_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Name (optional)</Label>
              <Input
                value={newConfig.name}
                onChange={(e) => setNewConfig((p) => ({ ...p, name: e.target.value }))}
                placeholder="Monthly Portfolio Email"
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Send on day of month</Label>
              <Select
                value={String(newConfig.schedule_day)}
                onValueChange={(v) => setNewConfig((p) => ({ ...p, schedule_day: parseInt(v ?? "2") }))}
              >
                <SelectTrigger className="h-9 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Recipient emails (comma-separated)</Label>
              <Input
                value={newConfig.recipient_emails}
                onChange={(e) => setNewConfig((p) => ({ ...p, recipient_emails: e.target.value }))}
                placeholder="owner@email.com, accountant@firm.com"
                className="h-9"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAdd} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add scheduled report
        </Button>
      )}
    </div>
  )
}
