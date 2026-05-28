"use client"

/**
 * app/(tenant)/tenant/account/data-export/PrintButton.tsx — browser print trigger
 *
 * Notes: Needed because data-export/page.tsx is a Server Component and cannot pass
 *        onClick to ActionButton. Calls window.print() directly.
 */
import { Download } from "lucide-react"
import { ActionButton } from "@/components/ui/actions"

export function PrintButton() {
  return (
    <ActionButton tone="secondary" onClick={() => globalThis.print()}>
      <Download className="h-4 w-4 mr-1.5" />
      Print / Save PDF
    </ActionButton>
  )
}
