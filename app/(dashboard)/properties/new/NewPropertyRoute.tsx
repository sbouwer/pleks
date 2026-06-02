"use client"

/**
 * app/(dashboard)/properties/new/NewPropertyRoute.tsx — client launcher for the /properties/new route
 *
 * Route:  /properties/new
 * Auth:   parent page gates on getServerOrgMembership; save path enforces requireAgentWriteAccess
 * Notes:  Opens the PropertyWizardModal immediately and returns to /properties on close. Lets the
 *         canonical "add a property" URL (deep-links, the dashboard checklist, first-setup) render the
 *         wizard as the universal modal. In-place launch from the Properties list lives in the list
 *         components themselves.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { PropertyWizardModal } from "./PropertyWizardModal"

export function NewPropertyRoute() {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  return (
    <PropertyWizardModal
      open={open}
      onClose={() => { setOpen(false); router.push("/properties") }}
    />
  )
}
