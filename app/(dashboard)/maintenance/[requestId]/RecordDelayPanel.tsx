"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Loader2, Plus, Clock } from "lucide-react"
import { recordMaintenanceDelay } from "./actions"

interface DelayEvent {
  id: string
  delay_type: string
  attributed_to: string
  occurred_at: string
  original_date: string | null
  rescheduled_to: string | null
  note: string | null
}

interface Props {
  readonly requestId: string
  readonly initialDelays: DelayEvent[]
}

const DELAY_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: "tenant_not_available", label: "Tenant not available", group: "Tenant" },
  { value: "tenant_rescheduled", label: "Tenant rescheduled", group: "Tenant" },
  { value: "tenant_no_response", label: "Tenant no response", group: "Tenant" },
  { value: "tenant_denied_access", label: "Tenant denied access", group: "Tenant" },
  { value: "contractor_no_show", label: "Contractor no-show", group: "Contractor" },
  { value: "contractor_rescheduled", label: "Contractor rescheduled", group: "Contractor" },
  { value: "contractor_no_response", label: "Contractor no response", group: "Contractor" },
  { value: "contractor_returned_incomplete", label: "Contractor returned incomplete", group: "Contractor" },
  { value: "agent_pending_approval", label: "Pending agent approval", group: "Agent" },
  { value: "agent_pending_quote_review", label: "Pending quote review", group: "Agent" },
  { value: "agent_pending_landlord_approval", label: "Pending landlord approval", group: "Agent" },
  { value: "parts_on_order", label: "Parts on order", group: "External" },
  { value: "weather", label: "Weather", group: "External" },
  { value: "access_issue_other", label: "Access issue (other)", group: "External" },
]

const ATTRIBUTION_COLOR: Record<string, string> = {
  tenant: "text-warning",
  contractor: "text-info",
  agent: "text-brand",
  external: "text-muted-foreground",
}

export function RecordDelayPanel({ requestId, initialDelays }: Props) {
  const [open, setOpen] = useState(false)
  const [delayType, setDelayType] = useState("")
  const [originalDate, setOriginalDate] = useState("")
  const [rescheduledTo, setRescheduledTo] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [delays, setDelays] = useState<DelayEvent[]>(initialDelays)

  async function handleSubmit() {
    if (!delayType) return
    setSaving(true)
    const result = await recordMaintenanceDelay({
      requestId,
      delayType,
      originalDate: originalDate || null,
      rescheduledTo: rescheduledTo || null,
      note: note.trim() || null,
    })
    setSaving(false)
    if (result.error) {
      toast.error(result.error)
      return
    }
    if (result.event) {
      setDelays((prev) => [result.event!, ...prev])
    }
    toast.success("Delay recorded")
    setOpen(false)
    setDelayType("")
    setOriginalDate("")
    setRescheduledTo("")
    setNote("")
  }

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Delay log</h3>
          {delays.length > 0 && (
            <span className="text-xs text-muted-foreground">({delays.length})</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Record delay
        </Button>
      </div>

      {open && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3 mb-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Delay type *</Label>
            <Select value={delayType} onValueChange={(v) => setDelayType(v ?? "")}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                {["Tenant", "Contractor", "Agent", "External"].map((group) => (
                  <div key={group}>
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
                    {DELAY_OPTIONS.filter((d) => d.group === group).map((d) => (
                      <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Original date</Label>
              <input
                type="date"
                value={originalDate}
                onChange={(e) => setOriginalDate(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Rescheduled to</Label>
              <input
                type="date"
                value={rescheduledTo}
                onChange={(e) => setRescheduledTo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note..."
              className="text-sm resize-none"
              maxLength={500}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSubmit} disabled={!delayType || saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {delays.length > 0 ? (
        <div className="space-y-2">
          {delays.map((d) => {
            const option = DELAY_OPTIONS.find((o) => o.value === d.delay_type)
            const attrColor = ATTRIBUTION_COLOR[d.attributed_to] ?? "text-muted-foreground"
            return (
              <div key={d.id} className="flex items-start gap-3 text-sm py-2 border-b border-border/40 last:border-0">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{option?.label ?? d.delay_type}</span>
                  {d.note && <p className="text-xs text-muted-foreground mt-0.5">{d.note}</p>}
                  {d.rescheduled_to && (
                    <p className="text-xs text-muted-foreground">→ Rescheduled to {new Date(d.rescheduled_to).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-xs font-medium capitalize ${attrColor}`}>{d.attributed_to}</p>
                  <p className="text-xs text-muted-foreground">{new Date(d.occurred_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</p>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No delays recorded.</p>
      )}
    </div>
  )
}
