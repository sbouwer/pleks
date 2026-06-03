"use client"

/**
 * components/suppliers/SupplierDetailActions.tsx — supplier detail header actions (our icon language)
 *
 * Auth:   client island; the edit path goes through updateContractorParty (agent write gate)
 * Data:   EditPartyModal prefilled via fetchContractorParty
 * Notes:  Header carries ENTITY actions (Edit, …) in our list-row icon language. Per-contact comms
 *         (Call / Email / WhatsApp) live in the identity card as clickable rows, not here. The Edit button
 *         opens the full EditPartyModal (role=supplier) so the read-only body can drop inline-edit sections.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { EditButton } from "@/components/ui/actions"
import { EditPartyModal } from "@/components/parties/EditPartyModal"
import { fetchContractorParty, updateContractorParty } from "@/lib/actions/parties"

export function SupplierDetailActions({ supplierId }: Readonly<{ supplierId: string }>) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)

  return (
    <div className="flex items-center gap-1">
      <EditButton label="Edit supplier" onClick={() => setEditOpen(true)} />

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
