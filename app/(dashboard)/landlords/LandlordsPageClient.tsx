"use client"

/**
 * app/(dashboard)/landlords/LandlordsPageClient.tsx — Landlords page shell: list + shared empty state
 *
 * Route:  /landlords
 * Auth:   dashboard layout (gateway); create via addLandlordParty (requireAgentWriteAccess)
 * Data:   landlord list from fetchLandlordsAction; cached under PORTFOLIO_QUERY_KEYS.landlords(orgId)
 * Notes:  Owns the add-party modal so both the header and the empty-state hero button drive it. Empty →
 *         the shared EmptyResourceState. Success view offers welcome-pack generation (onPrimaryAction).
 */
import React, { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { UserSquare2 } from "lucide-react"
import { LandlordsClient } from "./LandlordsClient"
import { AddPartyModal } from "@/components/parties/AddPartyModal"
import { addLandlordParty } from "@/lib/actions/parties"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchLandlordsAction } from "@/lib/queries/portfolioActions"

interface Props { readonly orgId: string }

export function LandlordsPageClient({ orgId }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const { data: landlords = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.landlords(orgId),
    queryFn: () => fetchLandlordsAction(orgId),
    staleTime: STALE_TIME.landlords,
  })

  const modal = (
    <AddPartyModal
      role="landlord"
      open={addOpen}
      onOpenChange={setAddOpen}
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
  )

  if (!isLoading && landlords.length === 0) {
    return (
      <div>
        <EmptyResourceState
          eyebrow="Portfolio"
          title="Landlords"
          headline="No landlords yet"
          headerSub="Add the owners you manage for — leases, statements and welcome packs are issued in their name."
          emptyTitle="No landlords here yet"
          emptySub="Add your first landlord, or add one as you create a property."
          icon={<UserSquare2 className="h-6 w-6" />}
          headerAction={<AddButton label="Add landlord" onClick={() => setAddOpen(true)} />}
          heroAction={<AddButton label="Add your first landlord" variant="hero" showPlus={false} onClick={() => setAddOpen(true)} />}
        />
        {modal}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Landlords</h1>
          <p className="text-sm text-muted-foreground">{landlords.length} {landlords.length === 1 ? "landlord" : "landlords"}</p>
        </div>
        <AddButton label="Add landlord" onClick={() => setAddOpen(true)} />
      </div>
      {!isLoading && <LandlordsClient landlords={landlords} />}
      {modal}
    </div>
  )
}
