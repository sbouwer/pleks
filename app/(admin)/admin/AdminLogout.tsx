"use client"

/**
 * app/(admin)/admin/AdminLogout.tsx — logout button for the admin portal shell
 *
 * Notes:  Client sub-component. DELETEs /api/admin/auth to clear the admin HMAC
 *         session, then hard-navigates to /admin/login.
 */
import { ActionButton } from "@/components/ui/actions"
import { hardNavigate } from "@/lib/navigation"

export function AdminLogout() {
  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" })
    hardNavigate("/admin/login")   // admin session cookie just cleared
  }

  return (
    <ActionButton tone="secondary" size="sm" className="text-xs" onClick={handleLogout}>
      Logout
    </ActionButton>
  )
}
