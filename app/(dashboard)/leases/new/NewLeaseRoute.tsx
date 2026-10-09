"use client"

/**
 * app/(dashboard)/leases/new/NewLeaseRoute.tsx — client launcher for the /leases/new route
 *
 * Route:  /leases/new
 * Auth:   parent page gates on getServerOrgMembership; the create paths enforce requireAgentWriteAccess
 * Notes:  Opens the LeaseWizardModal immediately and returns to /leases on close, mirroring NewPropertyRoute.
 *         From an application, closing releases this agent's "currently creating" marker (leaseStartMarker.ts).
 *         Server-resolved prefill (property/unit/tenant/renewal) + disclaimer-acceptance are handed in.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { LeaseWizardModal } from "@/components/leases/LeaseWizardModal"
import type { WizardPrefill } from "@/components/leases/wizardData"
import { releaseLeaseStart } from "@/lib/actions/leases"

export function NewLeaseRoute({
  prefill, renewalOf, disclaimerAccepted,
}: Readonly<{ prefill: WizardPrefill; renewalOf: string | null; disclaimerAccepted: boolean }>) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  return (
    <LeaseWizardModal
      open={open}
      onClose={() => {
        setOpen(false)
        // Closed without creating: release the "currently creating" marker (fire-and-forget; it expires anyway).
        if (prefill.applicationId) void releaseLeaseStart(prefill.applicationId).catch(() => undefined)
        router.push("/leases")
      }}
      prefill={prefill}
      renewalOf={renewalOf}
      disclaimerAccepted={disclaimerAccepted}
    />
  )
}
