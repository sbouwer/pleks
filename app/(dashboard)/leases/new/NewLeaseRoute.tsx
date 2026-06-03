"use client"

/**
 * app/(dashboard)/leases/new/NewLeaseRoute.tsx — client launcher for the /leases/new route
 *
 * Route:  /leases/new
 * Auth:   parent page gates on getServerOrgMembership; the create paths enforce requireAgentWriteAccess
 * Notes:  Opens the LeaseWizardModal immediately and returns to /leases on close, mirroring NewPropertyRoute.
 *         Server-resolved prefill (property/unit/tenant/renewal) + disclaimer-acceptance are handed in.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { LeaseWizardModal } from "@/components/leases/LeaseWizardModal"
import type { WizardPrefill } from "@/components/leases/wizardData"

export function NewLeaseRoute({
  prefill, renewalOf, disclaimerAccepted,
}: Readonly<{ prefill: WizardPrefill; renewalOf: string | null; disclaimerAccepted: boolean }>) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  return (
    <LeaseWizardModal
      open={open}
      onClose={() => { setOpen(false); router.push("/leases") }}
      prefill={prefill}
      renewalOf={renewalOf}
      disclaimerAccepted={disclaimerAccepted}
    />
  )
}
