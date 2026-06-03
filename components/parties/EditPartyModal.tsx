"use client"

/**
 * components/parties/EditPartyModal.tsx — the add-party wizard, reused in edit mode
 *
 * Notes:  On open it fetches the entity as a pre-filled PartyFormState (fetchData), then mounts AddPartyModal
 *         with mode="edit" so the SAME wizard edits it (save → onSubmit update action). Mounting is deferred
 *         until the fetch resolves because usePartyFlow seeds its state from initialForm on mount only.
 */
import { useEffect, useState } from "react"
import { AddPartyModal, type AddPartyInput, type AddPartyResult } from "./AddPartyModal"
import { type PartyRole } from "@/lib/parties/partyConfig"
import { type PartyEditData } from "@/lib/actions/parties"

export function EditPartyModal({
  role, open, onOpenChange, fetchData, onSubmit, onSaved,
}: Readonly<{
  role: PartyRole
  open: boolean
  onOpenChange: (open: boolean) => void
  fetchData: () => Promise<PartyEditData>
  onSubmit: (input: AddPartyInput) => Promise<AddPartyResult>
  onSaved?: () => void
}>) {
  const [data, setData] = useState<PartyEditData | null>(null)

  useEffect(() => {
    if (!open) { setData(null); return }
    let live = true
    void fetchData().then((d) => { if (live) setData(d) })
    return () => { live = false }
    // fetchData is recreated per render by the caller; we intentionally key only on `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !data) return null
  if (!data.ok || !data.form) {
    // fetch failed — surface nothing rather than a broken wizard; caller's list stays as-is.
    return null
  }

  return (
    <AddPartyModal
      role={role}
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      initialEntity={data.entity}
      initialForm={data.form}
      onSubmit={onSubmit}
      onCreated={onSaved}
    />
  )
}
