"use client"

/**
 * app/(dashboard)/leases/DeleteDraftButton.tsx — delete control for a DRAFT lease in the lease list
 *
 * Route:  /leases (used by LeaseRow + the cards view)
 * Auth:   calls deleteLease (requireAgentWriteAccess; server hard-guards status='draft')
 * Notes:  Uses the standard borderless <DeleteButton> (built-in confirm modal), matching the suppliers
 *         list. Hidden until the row/card is hovered (opacity-0 group-hover:opacity-100 — the caller's
 *         row/card carries `group`). The wrapping span stops click propagation + default so it never
 *         triggers the row's click-to-open / the card's <Link> navigation. Shown only for drafts.
 */
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { DeleteButton } from "@/components/ui/actions"
import { deleteLease } from "@/lib/actions/leases"

export function DeleteDraftButton({ leaseId }: Readonly<{ leaseId: string }>) {
  const router = useRouter()

  async function onConfirm() {
    const res = await deleteLease(leaseId)
    if ("error" in res) return { blocked: res.error }   // morphs the dialog into an "can't delete" view
    toast.success("Draft deleted")
    router.refresh()
  }

  return (
    <span className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
      <DeleteButton
        label="Delete draft"
        title="Delete draft lease?"
        description="This permanently removes the draft and the details captured on it. This can't be undone."
        confirmLabel="Delete draft"
        onConfirm={onConfirm}
      />
    </span>
  )
}
