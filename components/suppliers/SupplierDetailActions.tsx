"use client"

/**
 * components/suppliers/SupplierDetailActions.tsx — supplier detail header actions (our icon language)
 *
 * Auth:   client island; the edit path goes through updateContractorParty (agent write gate)
 * Data:   EditPartyModal prefilled via fetchContractorParty; Call/Email/WhatsApp from the primary contact
 * Notes:  Replaces the pill quickbar with our list-row action icons (EditButton + IconButton). The Edit
 *         button opens the full EditPartyModal (role=supplier), so the detail body can be read-only cards
 *         and editing lives in the modal. Mirrors the list edit wiring in SuppliersClient.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { MessageSquare, Phone, MessageCircle } from "lucide-react"
import { EditButton, IconButton } from "@/components/ui/actions"
import { EditPartyModal } from "@/components/parties/EditPartyModal"
import { fetchContractorParty, updateContractorParty } from "@/lib/actions/parties"

/** Normalise an SA number for wa.me (leading 0 → 27), matching lib/detail/contactActions. */
function waNormalise(phone: string | null): string {
  if (!phone) return ""
  const digits = phone.replaceAll(/\D/g, "")
  if (!digits) return ""
  return digits.startsWith("0") ? `27${digits.slice(1)}` : digits
}

export function SupplierDetailActions({
  supplierId, phone, email,
}: Readonly<{ supplierId: string; phone: string | null; email: string | null }>) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const waNumber = waNormalise(phone)

  return (
    <div className="flex items-center gap-1">
      <EditButton label="Edit supplier" onClick={() => setEditOpen(true)} />
      {email && (
        <IconButton icon={<MessageSquare className="size-3.5" />} label="Email" onClick={() => { window.location.href = `mailto:${email}` }} />
      )}
      {phone && (
        <IconButton icon={<Phone className="size-3.5" />} label="Call" onClick={() => { window.location.href = `tel:${phone}` }} />
      )}
      {waNumber && (
        <IconButton icon={<MessageCircle className="size-3.5" />} label="WhatsApp" onClick={() => window.open(`https://wa.me/${waNumber}`, "_blank")} />
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
