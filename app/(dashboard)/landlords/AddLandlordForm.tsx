"use client"

/**
 * app/(dashboard)/landlords/AddLandlordForm.tsx — "Add landlord" button → unified AddPartyModal
 *
 * Route:  /landlords (embedded)
 * Auth:   dashboard gateway; create via addLandlordParty (requireAgentWriteAccess)
 * Data:   contacts + landlords; the success view offers welcome-pack generation
 * Notes:  Replaces the old inline card form with the shared add-party modal (ADDENDUM_19/parties).
 */
import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { PORTFOLIO_QUERY_KEYS } from "@/lib/queries/portfolio"
import { AddPartyModal } from "@/components/parties/AddPartyModal"
import { addLandlordParty } from "@/lib/actions/parties"

export function AddLandlordForm({ orgId }: Readonly<{ orgId: string }>) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()

  return (
    <>
      <ActionButton tone="primary" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
        Add Landlord
      </ActionButton>
      <AddPartyModal
        role="landlord"
        open={open}
        onOpenChange={setOpen}
        onSubmit={addLandlordParty}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId) })
          queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.properties(orgId) })
          router.refresh()
        }}
        onPrimaryAction={(result) => {
          // "Generate welcome pack" — opens the branded pack for the new landlord in a new tab.
          if (!result.id) return
          const url = `/api/reports/welcome-pack?orgId=${encodeURIComponent(orgId)}&landlordId=${encodeURIComponent(result.id)}`
          globalThis.open(url, "_blank")
        }}
      />
    </>
  )
}
