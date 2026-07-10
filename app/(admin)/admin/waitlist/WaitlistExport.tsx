"use client"

/**
 * app/(admin)/admin/waitlist/WaitlistExport.tsx — CSV export button for the admin waitlist
 *
 * Notes:  Client sub-component. Builds and downloads the CSV entirely client-side from the
 *         entries prop — no fetch.
 */
import { ActionButton } from "@/components/ui/actions"
import { saDateISO, saTodayISO } from "@/lib/dates"

export function WaitlistExport({
  entries,
}: {
  entries: { email: string; role: string | null; created_at: string }[]
}) {
  function handleExport() {
    const header = "Email,Role,Signed Up"
    const rows = entries.map(
      (e) =>
        `"${e.email}","${e.role ?? ""}","${saDateISO(new Date(e.created_at))}"`
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
