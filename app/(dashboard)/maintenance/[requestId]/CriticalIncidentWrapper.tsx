"use client"

/**
 * app/(dashboard)/maintenance/[requestId]/CriticalIncidentWrapper.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { CriticalIncidentDialog } from "@/components/maintenance/CriticalIncidentDialog"

interface CriticalIncidentWrapperProps {
  readonly requestId: string
  readonly incidentTitle: string
  readonly unitLabel: string
  readonly propertyName: string
}

/** Client wrapper that auto-opens the CriticalIncidentDialog on page load */
export function CriticalIncidentWrapper({
  requestId,
  incidentTitle,
  unitLabel,
  propertyName,
}: CriticalIncidentWrapperProps) {
  const router = useRouter()
  const [open, setOpen] = useState(true)

  return (
    <CriticalIncidentDialog
      requestId={requestId}
      incidentTitle={incidentTitle}
      unitLabel={unitLabel}
      propertyName={propertyName}
      open={open}
      onOpenChange={setOpen}
      onDecisionRecorded={() => router.refresh()}
    />
  )
}
