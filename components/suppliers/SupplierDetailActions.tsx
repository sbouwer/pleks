"use client"

/**
 * components/suppliers/SupplierDetailActions.tsx — supplier detail header actions (our icon language)
 *
 * Auth:   client island; Edit → updateContractorParty (agent write gate); Archive → DELETE /api/suppliers (admin)
 * Data:   EditPartyModal prefilled via fetchContractorParty
 * Notes:  Layout = nav | manage. Nav (work orders / invoices) are bordered IconButtons that pre-load this
 *         supplier via ?contractor=. Manage = Edit + Archive — FUNCTIONAL icons, borderless like the Edit
 *         button. Archive is a SOFT delete (history kept) via a styled ConfirmDialog; if obligations are open
 *         (archiveBlock set) the dialog explains why instead of confirming. The server enforces the guard too.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Wrench, Receipt, Archive, Pencil } from "lucide-react"
import { IconButton } from "@/components/ui/actions"
import { EditPartyModal } from "@/components/parties/EditPartyModal"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { usePermissions } from "@/hooks/usePermissions"
import { fetchContractorParty, updateContractorParty } from "@/lib/actions/parties"
import { cn } from "@/lib/utils"

/** Borderless functional icon (matches the Edit button's pa-edit style). */
function FnIcon({ icon, label, onClick, disabled, danger }: Readonly<{
  icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean
}>) {
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-[var(--r-button)] text-muted-foreground transition-colors disabled:opacity-50",
        danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-primary/10 hover:text-foreground",
      )}
    >
      {icon}
    </button>
  )
}

export function SupplierDetailActions({
  supplierId, contactId, supplierName, archiveBlock,
}: Readonly<{ supplierId: string; contactId: string; supplierName: string; archiveBlock: string | null }>) {
  const router = useRouter()
  const { isAdmin } = usePermissions()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)

  async function doArchive() {
    setArchiving(true)
    const res = await fetch("/api/suppliers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractorId: supplierId, contactId }),
    })
    setArchiving(false)
    setConfirmOpen(false)
    if (res.ok) {
      toast.success("Supplier archived")
      router.push("/suppliers")
      return
    }
    const d = await res.json() as { error?: string }
    toast.error(d.error ?? "Could not archive supplier")
  }

  return (
    <div className="flex items-center gap-1">
      <IconButton icon={<Wrench className="size-3.5" />} label="View work orders" onClick={() => router.push(`/maintenance?contractor=${supplierId}`)} />
      <IconButton icon={<Receipt className="size-3.5" />} label="View invoices" onClick={() => router.push(`/billing/invoices?contractor=${supplierId}`)} />

      <span aria-hidden className="mx-1 h-5 w-px bg-border" />

      <FnIcon icon={<Pencil className="size-3.5" />} label="Edit supplier" onClick={() => setEditOpen(true)} />
      {isAdmin && (
        <FnIcon icon={<Archive className="size-3.5" />} label="Archive supplier" danger onClick={() => setConfirmOpen(true)} />
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={archiveBlock ? "Can't archive this supplier" : `Archive ${supplierName}?`}
        description={archiveBlock ?? "They leave your active supplier list, but all historical work orders and invoices are kept. You can reactivate them later."}
        variant={archiveBlock ? "default" : "destructive"}
        confirmLabel={archiveBlock ? "OK" : "Archive supplier"}
        cancelLabel={archiveBlock ? "Close" : "Cancel"}
        onConfirm={archiveBlock ? () => setConfirmOpen(false) : doArchive}
        loading={archiving}
      />

      <EditPartyModal
        role="supplier"
        open={editOpen}
        onOpenChange={setEditOpen}
        fetchData={() => fetchContractorParty(supplierId)}
        onSubmit={(input) => updateContractorParty(input, supplierId)}
        onSaved={() => router.refresh()}
      />
    </div>
  )
}
