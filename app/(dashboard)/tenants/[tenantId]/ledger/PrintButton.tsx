"use client"

/**
 * app/(dashboard)/tenants/[tenantId]/ledger/PrintButton.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { Printer } from "lucide-react"

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 text-sm border border-border rounded-lg px-3 py-2 hover:bg-muted transition-colors print:hidden"
    >
      <Printer className="h-4 w-4" />
      Print
    </button>
  )
}
