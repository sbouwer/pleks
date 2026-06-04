"use client"

/**
 * components/maintenance/NotesCard.tsx — memo history + add-note form for maintenance requests
 *
 * Data:   notes passed as props from page (from timelineEvents); calls addMaintenanceNote on submit
 * Notes:  h-full flex-col so it matches PhotosCard height in the grid row.
 *         History scrolls in the middle; compose form is pinned at the bottom.
 *         Optional "notify landlord" checkbox fires memo_landlord_notified comm.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { MessageSquarePlus } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { addMaintenanceNote } from "@/lib/actions/maintenance"

export interface NoteItem {
  id: string
  text: string
  createdAt: string
  actorName: string | undefined
  actorType: string
}

interface Props {
  requestId: string
  hasLandlord: boolean
  isReadOnly: boolean
  notes: NoteItem[]
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  })
}

function actorChipCls(type: string): string {
  if (type === "agent") return "bg-brand/10 text-brand"
  if (type === "landlord") return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
  return "bg-muted text-muted-foreground"
}

function initials(name: string | undefined): string {
  if (!name) return "?"
  return name.split(" ").map((w) => w[0] ?? "").join("").slice(0, 2).toUpperCase()
}

export function NotesCard({ requestId, hasLandlord, isReadOnly, notes = [] }: Readonly<Props>) {
  const router = useRouter()
  const [note, setNote] = useState("")
  const [notifyLandlord, setNotifyLandlord] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleSubmit() {
    if (!note.trim()) { toast.error("Note cannot be empty"); return }
    startTransition(async () => {
      const result = await addMaintenanceNote(requestId, note.trim(), notifyLandlord)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success(notifyLandlord ? "Note added and landlord notified" : "Note added")
        setNote("")
        setNotifyLandlord(false)
        router.refresh()
      }
    })
  }

  return (
    <Card className="flex flex-col h-full min-h-[260px]">
      <CardHeader className="pb-3 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Memos</CardTitle>
            {notes.length > 0 && (
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                {notes.length}
              </span>
            )}
          </div>
          <div className="flex gap-1.5">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded">
              agent-private
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground bg-muted px-2 py-0.5 rounded">
              append-only
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 min-h-0 px-4 pb-4">
        {/* Scrollable history — grows to fill available space */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {notes.length > 0 ? (
            <div className="space-y-3 pr-1 pb-1">
              {notes.map((n) => (
                <div key={n.id} className="flex gap-2.5">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                    {initials(n.actorName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs mb-1 flex-wrap">
                      <span className="font-medium">{n.actorName ?? "Unknown"}</span>
                      <span className={`text-[10px] uppercase tracking-wide px-1.5 py-px rounded font-medium ${actorChipCls(n.actorType)}`}>
                        {n.actorType}
                      </span>
                      <span className="text-muted-foreground ml-auto shrink-0">{fmtDate(n.createdAt)}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{n.text}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            isReadOnly && (
              <p className="text-sm text-muted-foreground">No memos recorded.</p>
            )
          )}
        </div>

        {/* Compose — pinned at bottom */}
        {!isReadOnly && (
          <div className={`space-y-3 shrink-0 ${notes.length > 0 ? "border-t border-border pt-3 mt-3" : "pt-1"}`}>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal memo — not visible to tenant or contractor…"
              disabled={pending}
            />
            {hasLandlord && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyLandlord}
                  onChange={(e) => setNotifyLandlord(e.target.checked)}
                  disabled={pending}
                  className="rounded"
                />
                <span>Notify landlord by email</span>
              </label>
            )}
            <ActionButton
              tone="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={pending || !note.trim()}
              className="w-full"
            >
              {pending ? "Saving…" : "Add note"}
            </ActionButton>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
