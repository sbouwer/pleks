"use client"

import { FileText } from "lucide-react"
import type { ReportPeriodType } from "@/lib/reports/types"

interface Props {
  orgId: string
  filters: { periodType: ReportPeriodType; propertyIds: string[]; landlordId?: string }
  landlords?: Array<{ id: string; name: string }>
}

export function WelcomePackTab({ orgId, filters, landlords }: Props) {
  const { landlordId } = filters
  const landlord = landlords?.find((l) => l.id === landlordId)

  if (!landlordId) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-3 opacity-40" />
        <p className="font-medium text-foreground mb-1">Select a landlord to generate their welcome pack</p>
        <p>Use the Landlord filter above to choose a client, then click Generate below.</p>
      </div>
    )
  }

  const url = `/api/reports/welcome-pack?orgId=${encodeURIComponent(orgId)}&landlordId=${encodeURIComponent(landlordId)}`

  return (
    <div className="rounded-xl border bg-card p-8 text-center space-y-4">
      <FileText className="h-10 w-10 mx-auto text-muted-foreground" />
      <div>
        <p className="font-semibold text-base">{landlord?.name ?? "Selected landlord"}</p>
        <p className="text-sm text-muted-foreground mt-1">
          6-page branded PDF: portfolio snapshot, income analysis, 12-month projection,
          tenant profiles, compliance calendar, and AI recommendations.
        </p>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <FileText className="h-4 w-4" />
        Generate Welcome Pack PDF
      </a>
      <p className="text-xs text-muted-foreground">
        Opens as printable HTML — use your browser&apos;s Print → Save as PDF.
        AI recommendations may take a few seconds.
      </p>
    </div>
  )
}
