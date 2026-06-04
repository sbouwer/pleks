"use client"

/**
 * app/(admin)/admin/AdminLogout.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { ActionButton } from "@/components/ui/actions"

export function AdminLogout() {
  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" })
    window.location.href = "/admin/login"
  }

  return (
    <ActionButton tone="secondary" size="sm" className="text-xs" onClick={handleLogout}>
      Logout
    </ActionButton>
  )
}
