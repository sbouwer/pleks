"use client"

/**
 * app/(admin)/admin/waitlist/WaitlistExport.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { Button } from "@/components/ui/button"

export function WaitlistExport({
  entries,
}: {
  entries: { email: string; role: string | null; created_at: string }[]
}) {
  function handleExport() {
    const header = "Email,Role,Signed Up"
    const rows = entries.map(
      (e) =>
        `"${e.email}","${e.role ?? ""}","${new Date(e.created_at).toISOString().split("T")[0]}"`
    )
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `pleks-waitlist-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Button variant="outline" onClick={handleExport}>
      Export CSV
    </Button>
  )
}
