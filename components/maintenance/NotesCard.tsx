"use client"

/**
 * components/maintenance/NotesCard.tsx — add-note form for maintenance requests
 *
 * Data:   calls addMaintenanceNote on submit; no local note history (shown in TimelineCard)
 * Notes:  Optional "notify landlord" checkbox fires memo_landlord_notified comm.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { addMaintenanceNote } from "@/lib/actions/maintenance"

interface Props {
  requestId: string
  hasLandlord: boolean
  isReadOnly: boolean
}

export function NotesCard({ requestId, hasLandlord, isReadOnly }: Readonly<Props>) {
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
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">Add note</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isReadOnly ? (
          <p className="text-sm text-muted-foreground">Notes cannot be added to completed or closed requests.</p>
        ) : (
          <>
            <Textarea
              rows={3}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Internal memo — not visible to tenant or contractor…"
              disabled={pending}
            />
            {hasLandlord && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyLandlord}
                  onChange={e => setNotifyLandlord(e.target.checked)}
                  disabled={pending}
                  className="rounded"
                />
                <span>Notify landlord by email</span>
              </label>
            )}
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={pending || !note.trim()}
              className="w-full"
            >
              {pending ? "Saving…" : "Add note"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
