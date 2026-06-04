"use client"

/**
 * components/shared/ConfirmDialog.tsx — generic confirm/cancel modal used across the app
 *
 * Notes:  Uses Modal (not Dialog) to avoid dark-theme portal leak. Pass variant="destructive"
 *         for irreversible actions — confirm button turns red.
 */
import { ActionButton, Modal } from "@/components/ui/actions"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
  onConfirm: () => void
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  loading,
}: Readonly<ConfirmDialogProps>) {
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      actions={
        // Split layout (cancel left / confirm right) to match the WizardModal footer.
        <div className="flex w-full items-center justify-between gap-3">
          <ActionButton tone="secondary" className="pa-cancel-glow" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </ActionButton>
          <ActionButton
            tone={variant === "destructive" ? "destructive" : "primary"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Loading..." : confirmLabel}
          </ActionButton>
        </div>
      }
    >
      <p className="text-sm">{description}</p>
    </Modal>
  )
}
