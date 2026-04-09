"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { formatDateShort } from "@/lib/reports/periods"
import { Loader2, Plus, ChevronDown, ChevronUp } from "lucide-react"

interface Resolution {
  id: string
  resolution_number: number | null
  resolution_type: string
  description: string
  result: string | null
  votes_for: number | null
  votes_against: number | null
}

interface AGMRecord {
  id: string
  agm_type: string
  meeting_date: string
  meeting_time: string | null
  location: string | null
  is_virtual: boolean
  virtual_link: string | null
  status: string
  quorum_achieved: boolean | null
  attendees_count: number | null
  notes: string | null
  agm_resolutions: Resolution[]
}

interface Props {
  hoaId: string
  initialRecords: AGMRecord[]
}

const AGM_TYPES = [
  { value: "agm", label: "Annual General Meeting" },
  { value: "sgm", label: "Special General Meeting" },
  { value: "trustees_meeting", label: "Trustees Meeting" },
]

const STATUS_FLOW = ["scheduled", "notice_sent", "held", "minutes_pending", "minutes_distributed", "complete"]

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  notice_sent: "Notice Sent",
  held: "Held",
  minutes_pending: "Minutes Pending",
  minutes_distributed: "Minutes Distributed",
  complete: "Complete",
}

const RESOLUTION_TYPES = ["ordinary", "special", "unanimous"]
const RESOLUTION_RESULTS = ["passed", "failed", "deferred"]

export function AGMManager({ hoaId, initialRecords }: Readonly<Props>) {
  const [records, setRecords] = useState<AGMRecord[]>(initialRecords)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [addingResolutionFor, setAddingResolutionFor] = useState<string | null>(null)
  const [savingResolution, setSavingResolution] = useState(false)

  const [form, setForm] = useState({
    agm_type: "agm",
    meeting_date: "",
    meeting_time: "",
    location: "",
    is_virtual: false,
    virtual_link: "",
    notes: "",
  })

  const [resForm, setResForm] = useState({
    resolution_number: "",
    resolution_type: "ordinary",
    description: "",
    result: "passed",
    votes_for: "",
    votes_against: "",
    votes_abstained: "",
  })

  function setF(k: string, v: string | boolean) { setForm((f) => ({ ...f, [k]: v })) }
  function setR(k: string, v: string) { setResForm((f) => ({ ...f, [k]: v })) }

  async function handleCreate() {
    if (!form.meeting_date) { toast.error("Meeting date required"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/hoa/${hoaId}/agm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agm_type: form.agm_type,
          meeting_date: form.meeting_date,
          meeting_time: form.meeting_time || undefined,
          location: form.location || undefined,
          is_virtual: form.is_virtual,
          virtual_link: form.virtual_link || undefined,
          notes: form.notes || undefined,
        }),
      })
      const data = await res.json() as AGMRecord & { error?: string }
      if (!res.ok) { toast.error(data.error ?? "Failed to create"); return }
      setRecords((r) => [{ ...data, agm_resolutions: [] }, ...r])
      setShowForm(false)
      setForm({ agm_type: "agm", meeting_date: "", meeting_time: "", location: "", is_virtual: false, virtual_link: "", notes: "" })
      toast.success("Meeting scheduled")
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(agmId: string, status: string) {
    const res = await fetch(`/api/hoa/${hoaId}/agm/${agmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      setRecords((prev) => prev.map((r) => r.id === agmId ? { ...r, status } : r))
      toast.success("Status updated")
    } else {
      toast.error("Failed to update status")
    }
  }

  async function handleAddResolution(agmId: string) {
    if (!resForm.description.trim()) { toast.error("Description required"); return }
    setSavingResolution(true)
    try {
      const res = await fetch(`/api/hoa/${hoaId}/agm/${agmId}/resolutions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolution_number: resForm.resolution_number ? parseInt(resForm.resolution_number, 10) : undefined,
          resolution_type: resForm.resolution_type,
          description: resForm.description,
          result: resForm.result || undefined,
          votes_for: resForm.votes_for ? parseInt(resForm.votes_for, 10) : undefined,
          votes_against: resForm.votes_against ? parseInt(resForm.votes_against, 10) : undefined,
          votes_abstained: resForm.votes_abstained ? parseInt(resForm.votes_abstained, 10) : undefined,
        }),
      })
      const data = await res.json() as Resolution & { error?: string }
      if (!res.ok) { toast.error(data.error ?? "Failed to add resolution"); return }
      setRecords((prev) => prev.map((r) =>
        r.id === agmId ? { ...r, agm_resolutions: [...r.agm_resolutions, data] } : r
      ))
      setAddingResolutionFor(null)
      setResForm({ resolution_number: "", resolution_type: "ordinary", description: "", result: "passed", votes_for: "", votes_against: "", votes_abstained: "" })
      toast.success("Resolution recorded")
    } finally {
      setSavingResolution(false)
    }
  }

  const statusColor: Record<string, string> = {
    scheduled: "secondary",
    notice_sent: "secondary",
    held: "default",
    minutes_pending: "secondary",
    minutes_distributed: "secondary",
    complete: "default",
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm">Meetings</h3>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="size-3.5 mr-1.5" />
          Schedule meeting
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Schedule Meeting</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Type *</label>
                <select value={form.agm_type} onChange={(e) => setF("agm_type", e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  {AGM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date *</label>
                <Input type="date" value={form.meeting_date} onChange={(e) => setF("meeting_date", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Time</label>
                <Input type="time" value={form.meeting_time} onChange={(e) => setF("meeting_time", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Location</label>
                <Input placeholder="e.g. Community Hall" value={form.location} onChange={(e) => setF("location", e.target.value)} />
              </div>
              <div className="sm:col-span-2 flex items-center gap-2">
                <input type="checkbox" id="virtual" checked={form.is_virtual}
                  onChange={(e) => setF("is_virtual", e.target.checked)} className="size-4" />
                <label htmlFor="virtual" className="text-sm">Virtual meeting</label>
              </div>
              {form.is_virtual && (
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Meeting link</label>
                  <Input placeholder="https://meet.google.com/..." value={form.virtual_link} onChange={(e) => setF("virtual_link", e.target.value)} />
                </div>
              )}
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                <Input placeholder="Agenda items, quorum requirements…" value={form.notes} onChange={(e) => setF("notes", e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={saving}>
                {saving ? <><Loader2 className="size-3.5 mr-1.5 animate-spin" />Saving…</> : "Schedule"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {records.length === 0 && !showForm ? (
        <Card><CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">No meetings recorded.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {records.map((agm) => {
            const isExpanded = expanded[agm.id]
            const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(agm.status) + 1]
            return (
              <Card key={agm.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-sm">
                        {AGM_TYPES.find((t) => t.value === agm.agm_type)?.label ?? agm.agm_type}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDateShort(new Date(agm.meeting_date))}
                        {agm.meeting_time ? ` at ${agm.meeting_time}` : ""}
                        {agm.location ? ` — ${agm.location}` : ""}
                        {agm.is_virtual ? " (virtual)" : ""}
                      </p>
                      {agm.attendees_count != null && (
                        <p className="text-xs text-muted-foreground">
                          {agm.attendees_count} attendees
                          {agm.quorum_achieved != null ? (agm.quorum_achieved ? " — quorum achieved" : " — quorum not achieved") : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={statusColor[agm.status] as "default" | "secondary" ?? "secondary"}>
                        {STATUS_LABELS[agm.status] ?? agm.status}
                      </Badge>
                      {nextStatus && (
                        <Button size="sm" variant="outline" onClick={() => handleStatusChange(agm.id, nextStatus)}>
                          → {STATUS_LABELS[nextStatus]}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost"
                        onClick={() => setExpanded((p) => ({ ...p, [agm.id]: !isExpanded }))}>
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </Button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      {agm.agm_resolutions.length > 0 && (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="text-left py-1.5 pr-2">#</th>
                              <th className="text-left py-1.5 pr-2">Resolution</th>
                              <th className="text-left py-1.5 px-2">Type</th>
                              <th className="text-left py-1.5 px-2">Result</th>
                              <th className="text-right py-1.5">Votes (for/against)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {agm.agm_resolutions.map((r) => (
                              <tr key={r.id} className="border-b border-border/40">
                                <td className="py-1.5 pr-2">{r.resolution_number ?? "—"}</td>
                                <td className="py-1.5 pr-2">{r.description}</td>
                                <td className="py-1.5 px-2 capitalize">{r.resolution_type}</td>
                                <td className="py-1.5 px-2">
                                  {r.result ? (
                                    <Badge variant={r.result === "passed" ? "default" : "secondary"} className="text-[10px]">
                                      {r.result}
                                    </Badge>
                                  ) : "—"}
                                </td>
                                <td className="text-right py-1.5">
                                  {r.votes_for != null ? `${r.votes_for} / ${r.votes_against ?? 0}` : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {addingResolutionFor === agm.id ? (
                        <div className="border rounded-md p-3 space-y-2 bg-muted/20">
                          <p className="text-xs font-medium">Add resolution</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">No.</label>
                              <Input type="number" min="1" placeholder="#" className="h-8 text-xs" value={resForm.resolution_number} onChange={(e) => setR("resolution_number", e.target.value)} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                              <select value={resForm.resolution_type} onChange={(e) => setR("resolution_type", e.target.value)}
                                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                                {RESOLUTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Result</label>
                              <select value={resForm.result} onChange={(e) => setR("result", e.target.value)}
                                className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                                {RESOLUTION_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                            <div className="sm:col-span-3">
                              <label className="text-xs text-muted-foreground mb-1 block">Description *</label>
                              <Input className="h-8 text-xs" placeholder="Resolution description" value={resForm.description} onChange={(e) => setR("description", e.target.value)} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Votes for</label>
                              <Input type="number" min="0" className="h-8 text-xs" value={resForm.votes_for} onChange={(e) => setR("votes_for", e.target.value)} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Votes against</label>
                              <Input type="number" min="0" className="h-8 text-xs" value={resForm.votes_against} onChange={(e) => setR("votes_against", e.target.value)} />
                            </div>
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Abstained</label>
                              <Input type="number" min="0" className="h-8 text-xs" value={resForm.votes_abstained} onChange={(e) => setR("votes_abstained", e.target.value)} />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleAddResolution(agm.id)} disabled={savingResolution}>
                              {savingResolution ? <Loader2 className="size-3 animate-spin" /> : "Add"}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setAddingResolutionFor(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setAddingResolutionFor(agm.id)}>
                          <Plus className="size-3.5 mr-1.5" />
                          Add resolution
                        </Button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
