"use client"

/**
 * app/(dashboard)/properties/new/addLandlordContext.tsx — bridge for the Owner-step "add a landlord" sub-flow
 *
 * Notes:  Lets StepLandlord (deep in the step tree) trigger the landlord sub-flow that PropertyWizardModal
 *         hosts — without a nested dialog and without a circular import between the two modules.
 *         `openAddLandlord` swaps the wizard modal's contents to the add-party flow; `refreshNonce`
 *         bumps after a successful create so StepLandlord re-fetches and shows the new owner selected.
 *         Null outside the modal host (StepLandlord then falls back to its inline new-owner form).
 */
import { createContext, useContext } from "react"

export interface AddLandlordSubflow {
  openAddLandlord: () => void
  refreshNonce:    number
}

const AddLandlordCtx = createContext<AddLandlordSubflow | null>(null)

export const AddLandlordProvider = AddLandlordCtx.Provider

export function useAddLandlordSubflow(): AddLandlordSubflow | null {
  return useContext(AddLandlordCtx)
}
