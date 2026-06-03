"use client"

/**
 * components/ui/actions/DeleteButton.tsx — the standard delete affordance with a built-in confirm modal
 *
 * Notes:  Pleks standard: EVERY delete goes through this, so the "are you sure?" ConfirmDialog is built in
 *         — call sites just pass onConfirm. Borderless pa-edit icon (amber corner accent) by default; pass
 *         mode="label" for a trash + "Delete" action. When `blockReason` is set the dialog explains why the
 *         delete is blocked (e.g. open obligations) instead of confirming. The actual delete (server action /
 *         fetch) is the caller's onConfirm.
 */
import { useState } from "react"
import { Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"

export function DeleteButton({
  onConfirm, itemName, title, description, confirmLabel = "Delete", label = "Delete",
  mode = "icon", loading, disabled, blockReason, className,
}: Readonly<{
  onConfirm: () => void
  /** name shown in the default title ("Delete {itemName}?"). */
  itemName?: string
  title?: string
  description?: string
  confirmLabel?: string
  label?: string
  mode?: "icon" | "label"
  loading?: boolean
  disabled?: boolean
  /** when set, the dialog explains the delete is blocked instead of confirming. */
  blockReason?: string | null
  className?: string
}>) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn("pa-edit", className)}
      >
        <Trash2 className="size-3.5" />
        {mode === "label" && <span>{label}</span>}
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={blockReason ? "Can't delete this" : (title ?? `Delete ${itemName ?? "this item"}?`)}
        description={blockReason ?? description ?? "This can't be undone."}
        variant={blockReason ? "default" : "destructive"}
        confirmLabel={blockReason ? "OK" : confirmLabel}
        cancelLabel={blockReason ? "Close" : "Cancel"}
        loading={loading}
        onConfirm={blockReason ? () => setOpen(false) : () => { onConfirm(); setOpen(false) }}
      />
    </>
  )
}
