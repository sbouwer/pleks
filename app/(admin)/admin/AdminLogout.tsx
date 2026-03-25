"use client"

import { Button } from "@/components/ui/button"

export function AdminLogout() {
  async function handleLogout() {
    await fetch("/api/admin/auth", { method: "DELETE" })
    window.location.href = "/admin/login"
  }

  return (
    <Button variant="ghost" size="sm" className="text-xs" onClick={handleLogout}>
      Logout
    </Button>
  )
}
