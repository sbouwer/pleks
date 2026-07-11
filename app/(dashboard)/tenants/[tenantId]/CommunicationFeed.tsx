"use client"

/**
 * app/(dashboard)/tenants/[tenantId]/CommunicationFeed.tsx — Communication log for a tenant: displays history and allows adding internal notes.
 *
 * Data:   initialComms passed from server; logCommunication server action appends new entries
 */
import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Textarea } from "@/components/ui/textarea"
import { logCommunication } from "@/lib/actions/tenants"
import { toast } from "sonner"
import { MessageSquare, Phone, Mail, Lock, Plus } from "lucide-react"
import { SA_TIMEZONE } from "@/lib/dates"

interface CommEntry {
  id: string
  channel: string
  direction: string
  subject: string | null
  body: string | null
  status: string | null
  created_at: string
}

const CHANNEL_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  sms: MessageSquare,
  whatsapp: MessageSquare,
  phone_call: Phone,
  internal_note: Lock,
  portal_message: MessageSquare,
}

export function CommunicationFeed({
  tenantId,
  initialComms,
}: Readonly<{
  tenantId: string
  initialComms: CommEntry[]
}>) {
  const [showAddNote, setShowAddNote] = useState(false)
  const [noteBody, setNoteBody] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleAddNote() {
    if (!noteBody.trim()) return
    setSaving(true)

    const formData = new FormData()
    formData.set("tenant_id", tenantId)
    formData.set("channel", "internal_note")
    formData.set("direction", "internal")
    formData.set("body", noteBody)

    const result = await logCommunication(formData)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Note added")
      setNoteBody("")
      setShowAddNote(false)
    }
    setSaving(false)
  }

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <ActionButton tone="secondary" icon={<Plus className="h-3 w-3" />} onClick={() => setShowAddNote(!showAddNote)}>
          Add Note
        </ActionButton>
      </div>

      {showAddNote && (
        <div className="mb-4 space-y-2">
          <Textarea
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            placeholder="Internal note (not visible to tenant)"
            rows={3}
          />
          <div className="flex gap-2">
            <ActionButton tone="primary" onClick={handleAddNote} disabled={saving}>
              {saving ? "Saving..." : "Save Note"}
            </ActionButton>
            <ActionButton tone="secondary" onClick={() => setShowAddNote(false)}>Cancel</ActionButton>
          </div>
        </div>
      )}

      {initialComms.length === 0 ? (
        <p className="text-sm text-muted-foreground">No communications yet.</p>
      ) : (
        <div className="space-y-3">
          {initialComms.map((comm) => {
            const Icon = CHANNEL_ICONS[comm.channel] || MessageSquare
            const isInternal = comm.channel === "internal_note"

            return (
              <div key={comm.id} className="flex gap-3 text-sm">
                <div className="mt-0.5">
                  <Icon className={`h-4 w-4 ${isInternal ? "text-warning" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="capitalize text-xs text-muted-foreground">
                      {comm.channel.replaceAll("_", " ")}
                    </span>
                    {isInternal && <Lock className="h-3 w-3 text-warning" />}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(comm.created_at).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE })}
                    </span>
                  </div>
                  {comm.subject && <p className="font-medium">{comm.subject}</p>}
                  {comm.body && <p className="text-muted-foreground whitespace-pre-wrap">{comm.body}</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
