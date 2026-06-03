"use client"

/**
 * app/(dashboard)/leases/new/addTenantContext.tsx — bridge for the Tenant-step "add a tenant" sub-flow
 *
 * Notes:  Lets TenantPicker (deep in the lease wizard's Tenant step) trigger the add-tenant sub-flow that
 *         LeaseWizardModal hosts — without a nested dialog and without a circular import between the modules.
 *         Mirrors app/(dashboard)/properties/new/addLandlordContext.tsx. `openAddTenant` swaps the wizard
 *         modal's contents to the add-party flow; `refreshNonce` bumps after a successful create so the
 *         picker re-fetches its list, and `lastCreatedId` carries the new tenant's id so the picker can
 *         auto-select it. Null outside the modal host — TenantPicker then falls back to its inline
 *         standalone AddPartyModal (the already-shipped Phase 2 standalone behaviour).
 */
import { createContext, useContext } from "react"

export interface AddTenantSubflow {
  openAddTenant: () => void
  refreshNonce:  number
  /** id of the most recently created tenant (null until the host's sub-flow completes a create). */
  lastCreatedId: string | null
}

const AddTenantCtx = createContext<AddTenantSubflow | null>(null)

export const AddTenantProvider = AddTenantCtx.Provider

export function useAddTenantSubflow(): AddTenantSubflow | null {
  return useContext(AddTenantCtx)
}
