"use client"

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
