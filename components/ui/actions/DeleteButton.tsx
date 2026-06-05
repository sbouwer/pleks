"use client"

/**
 * components/ui/actions/DeleteButton.tsx — the standard delete affordance with a built-in confirm modal
 *
 * Notes:  Pleks standard: EVERY delete/archive goes through this, so the "are you sure?" ConfirmDialog is
 *         built in — call sites just pass onConfirm. Borderless pa-edit icon (amber corner accent) by
 *         default; pass mode="label" for a trash + "Delete" action.
 *
 *         Two ways to surface a "can't do this" reason as an ACKNOWLEDGE modal (never a toast):
 *         (1) `blockReason` prop — known upfront; the dialog opens straight into the block view.
 *         (2) `onConfirm` returns `{ blocked: reason }` AFTER an attempt (e.g. the API 409s on an
 *             in-force lease) — the SAME dialog morphs in place to the block view instead of closing.
 *             onConfirm may be async; the dialog shows a loading state while it runs.
 */
import { useState } from "react"
import { Trash2 } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"

/** onConfirm may resolve `{ blocked: reason }` to morph the dialog into an acknowledge view. */
export type ConfirmOutcome = void | { blocked: string }

export function DeleteButton({
  onConfirm, itemName, title, description, confirmLabel = "Delete", label = "Delete",
  mode = "icon", icon: Icon = Trash2, loading, disabled, blockReason, className,
}: Readonly<{
  onConfirm: () => ConfirmOutcome | Promise<ConfirmOutcome>
  /** name shown in the default title ("Delete {itemName}?"). */
  itemName?: string
  title?: string
  description?: string
  confirmLabel?: string
  label?: string
  mode?: "icon" | "label"
  /** glyph for the trigger — defaults to a trash can; pass Archive for soft-delete/archive actions. */
  icon?: LucideIcon
  loading?: boolean
  disabled?: boolean
  /** when set upfront, the dialog opens straight into the block (acknowledge) view. */
  blockReason?: string | null
  className?: string
}>) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resultBlock, setResultBlock] = useState<string | null>(null)

  const block = blockReason ?? resultBlock     // upfront prop OR result-driven
  const action = confirmLabel.toLowerCase()    // "delete" / "archive" — drives the block title

  function close() { setOpen(false); setResultBlock(null); setBusy(false) }

  async function handleConfirm() {
    if (block) { close(); return }             // acknowledge → dismiss
    setBusy(true)
    const outcome = await onConfirm()
    if (outcome && "blocked" in outcome) { setResultBlock(outcome.blocked); setBusy(false); return }  // morph, stay open
    close()
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => { setResultBlock(null); setBusy(false); setOpen(true) }}
        className={cn("pa-edit", className)}
      >
        <Icon className="size-3.5" />
        {mode === "label" && <span>{label}</span>}
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : close())}
        title={block ? `Can't ${action} this` : (title ?? `Delete ${itemName ?? "this item"}?`)}
        description={block ?? description ?? "This can't be undone."}
        variant={block ? "default" : "destructive"}
        confirmLabel={block ? "OK" : confirmLabel}
        cancelLabel={block ? "Close" : "Cancel"}
        loading={busy || loading}
        onConfirm={handleConfirm}
      />
    </>
  )
}
