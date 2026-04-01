"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"

interface SidebarSectionProps {
  title: string
  children: React.ReactNode
  editForm?: React.ReactNode
  onSave?: () => Promise<void>
}

export function SidebarSection({ title, children, editForm, onSave }: Readonly<SidebarSectionProps>) {
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    if (!onSave) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      await onSave()
      setEditing(false)
    })
  }

  return (
    <div className="border-t pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</span>
        {editForm && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Edit
          </button>
        )}
      </div>
      {editing && editForm ? (
        <div className="space-y-3">
          {editForm}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">
              {isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={isPending} className="h-7 text-xs">
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>{children}</div>
      )}
    </div>
  )
}
