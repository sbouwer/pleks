"use client"

/**
 * components/suppliers/SupplierDetailActions.tsx — supplier detail header actions (our icon language)
 *
 * Auth:   client island; Edit → updateContractorParty (agent write gate); Archive → DELETE /api/suppliers (admin)
 * Data:   EditPartyModal prefilled via fetchContractorParty
 * Notes:  Layout = quick links | manage. Quick links pre-load this supplier (work orders → /maintenance,
 *         invoices → /billing/invoices via ?contractor=). Manage = Edit + Archive. Archive is a SOFT delete
 *         (keeps historical work orders/invoices) and the server blocks it while obligations are open
 *         (active work orders / unpaid invoices). Per-contact comms live in the identity card, not here.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Wrench, Receipt, Archive } from "lucide-react"
import { EditButton, IconButton } from "@/components/ui/actions"
import { EditPartyModal } from "@/components/parties/EditPartyModal"
import { usePermissions } from "@/hooks/usePermissions"
import { fetchContractorParty, updateContractorParty } from "@/lib/actions/parties"

export function SupplierDetailActions({
  supplierId, contactId,
}: Readonly<{ supplierId: string; contactId: string }>) {
  const router = useRouter()
  const { isAdmin } = usePermissions()
  const [editOpen, setEditOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)

  async function handleArchive() {
    if (!globalThis.confirm("Archive this supplier? They leave your active list but all historical work orders and invoices are kept.")) return
    setArchiving(true)
    const res = await fetch("/api/suppliers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractorId: supplierId, contactId }),
    })
    setArchiving(false)
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

      <EditButton label="Edit supplier" onClick={() => setEditOpen(true)} />
      {isAdmin && (
        <IconButton icon={<Archive className="size-3.5" />} label="Archive supplier" onClick={handleArchive} disabled={archiving} className="pa-iconbtn--destructive" />
      )}

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
