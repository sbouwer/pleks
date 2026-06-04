"use client"

/**
 * app/(dashboard)/tenants/TenantsPageClient.tsx — Tenants page shell: fetches tenant list via React Query and renders the table or the shared empty state
 *
 * Route:  /tenants
 * Auth:   dashboard layout (gateway)
 * Data:   tenant list from fetchTenantsAction (server action); cached under PORTFOLIO_QUERY_KEYS.tenants(orgId)
 * Notes:  Empty → the shared EmptyResourceState with the in-place add launcher; loading renders nothing
 *         (body = null) to avoid flash. AddPartyModal stays mounted so both the header and hero buttons drive it.
 */
import React, { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { AddButton } from "@/components/ui/add-button"
import { EmptyResourceState } from "@/components/ui/empty-resource-state"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { Users } from "lucide-react"
import { TenantsClient } from "./TenantsClient"
import { PORTFOLIO_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchTenantsAction } from "@/lib/queries/portfolioActions"
import { AddPartyModal } from "@/components/parties/AddPartyModal"
import { addTenantParty } from "@/lib/actions/parties"

interface Props { orgId: string; autoOpenAdd?: boolean }

export function TenantsPageClient({ orgId, autoOpenAdd }: Readonly<Props>) {
  const router = useRouter()
  const queryClient = useQueryClient()
  // ?add=1 (from the property view / mobile quick-add) opens the add modal — the canonical add surface.
  // Init from the prop so it opens on first paint; strip the param via history (not router, which would
  // remount and reset addOpen) so a refresh/back doesn't reopen it.
  const [addOpen, setAddOpen] = useState(!!autoOpenAdd)
  useEffect(() => {
    if (autoOpenAdd) globalThis.history.replaceState(null, "", "/tenants")
  }, [autoOpenAdd])
  const { data: tenants = [], isLoading } = useQuery({
    queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId),
    queryFn: () => fetchTenantsAction(orgId),
    staleTime: STALE_TIME.tenants,
  })

  const modal = (
    <AddPartyModal
      role="tenant"
      open={addOpen}
      onOpenChange={setAddOpen}
      onSubmit={addTenantParty}
      onCreated={() => {
        queryClient.invalidateQueries({ queryKey: PORTFOLIO_QUERY_KEYS.tenants(orgId) })
        router.refresh()
      }}
    />
  )

  if (!isLoading && tenants.length === 0) {
    return (
      <div>
        <EmptyResourceState
          eyebrow="Portfolio"
          title="Tenants"
          headline="No tenants yet"
          headerSub="Add tenants to place them on leases and track their applications and payments."
          emptyTitle="No tenants here yet"
          emptySub="Add your first tenant to get started."
          icon={<Users className="h-6 w-6" />}
          headerAction={<AddButton label="Add tenant" onClick={() => setAddOpen(true)} />}
          heroAction={<AddButton label="Add your first tenant" variant="hero" showPlus={false} onClick={() => setAddOpen(true)} />}
        />
        {modal}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeader
        title="Tenants"
        headline="Your tenants"
        sub={`${tenants.length} tenants`}
        action={<AddButton label="Add tenant" onClick={() => setAddOpen(true)} />}
      />
      {!isLoading && <TenantsClient tenants={tenants} />}
      {modal}
    </div>
  )
}
