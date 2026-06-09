"use client"

/**
 * app/(dashboard)/dashboard/SurrenderedCommsBell.tsx — header WarningBell for surrendered comms
 *
 * Notes:  Replaces the large inline SurrenderedCommsWidget block. A header bell shows the count of
 *         mandatory communications awaiting manual dispatch; clicking opens a modal with the interactive
 *         list (Mark dispatched). Renders nothing when there's nothing to dispatch.
 */
import { useState } from "react"
import { WarningBell } from "@/components/ui/WarningBell"
import { Modal } from "@/components/ui/actions"
import { SurrenderedCommsWidget, type SurrenderedCommRow } from "./SurrenderedCommsWidget"

export function SurrenderedCommsBell({ items }: Readonly<{ items: SurrenderedCommRow[] }>) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <>
      <WarningBell
        count={items.length}
        label={`${items.length} notice${items.length === 1 ? "" : "s"} need manual dispatch`}
        onClick={() => setOpen(true)}
      />
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Notices needing manual dispatch">
          <p className="mb-3 text-[13px] text-muted-foreground">
            These mandatory communications failed all delivery attempts. Print and dispatch physically, then
            mark dispatched to complete the audit trail.
          </p>
          <div className="max-h-[60vh] overflow-y-auto">
            <SurrenderedCommsWidget items={items} bare />
          </div>
        </Modal>
      )}
    </>
  )
}
