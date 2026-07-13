"use client"

/**
 * app/(admin)/admin/waitlist/WaitlistExport.tsx — CSV export button for the admin waitlist
 *
 * Notes:  Client sub-component. Builds and downloads the CSV entirely client-side from the
 *         entries prop — no fetch.
 */
import { escapeCsvCell } from "@/lib/security/csvInjection"
import { ActionButton } from "@/components/ui/actions"
import { saDateISO, saTodayISO } from "@/lib/dates"

export function WaitlistExport({
  entries,
}: {
  entries: { email: string; role: string | null; created_at: string }[]
}) {
  function handleExport() {
    // The highest-exposure export we have: `email` and `role` arrive from /api/waitlist, an UNAUTHENTICATED
    // public POST with no validation on `role` at all. Quoting alone does not help — Excel evaluates a cell's
    // content AFTER unquoting, so `"=1+1"` still executes. The formula lead must be neutralised, not wrapped.
    const header = "Email,Role,Signed Up"
    const rows = entries.map((e) =>
      [
        escapeCsvCell(e.email),
        escapeCsvCell(e.role ?? ""),
        escapeCsvCell(saDateISO(new Date(e.created_at))),
      ].join(","),
    )
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pleks-waitlist-${saTodayISO()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <ActionButton tone="secondary" onClick={handleExport}>
      Export CSV
    </ActionButton>
  )
}
