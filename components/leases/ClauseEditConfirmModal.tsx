"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface ClauseEditConfirmModalProps {
  open: boolean
  orgId: string
  onConfirmed: () => void
  onCancel: () => void
}

export function ClauseEditConfirmModal({
  open,
  orgId,
  onConfirmed,
  onCancel,
}: Readonly<ClauseEditConfirmModalProps>) {
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setSubmitting(true)
    try {
      const res = await fetch("/api/leases/confirm-clause-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      })

      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? "Failed to confirm")
      }

      onConfirmed()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Prevent dismissal — user must choose Cancel or Confirm
        if (!nextOpen) return
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Before you edit lease clauses</DialogTitle>
          <DialogDescription>
            Editing clause wording changes a legal document that will be signed by
            your tenants. Standard Pleks clauses are drafted for compliance with
            South African property law.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label className="flex items-start gap-3 cursor-pointer rounded-md border border-amber-500/20 bg-amber-500/5 p-4">
            <input
              type="checkbox"
              className="accent-brand mt-1 size-4 shrink-0"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span className="text-sm leading-relaxed">
              I confirm that any changes I make to lease clause wording have been
              reviewed by a qualified property attorney and comply with the Rental
              Housing Act 50 of 1999, the Consumer Protection Act 68 of 2008, and
              all applicable South African legislation. I accept full responsibility
              for the legal content of clauses I edit.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!checked || submitting}>
            {submitting ? "Confirming..." : "I confirm, continue \u2192"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
