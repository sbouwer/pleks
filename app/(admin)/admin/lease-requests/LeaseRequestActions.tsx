"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface LeaseRequestActionsProps {
  requestId: string
  currentStatus: string
}

const STATUS_OPTIONS = ["pending", "in_progress", "approved", "rejected"] as const

export function LeaseRequestActions({
  requestId,
  currentStatus,
}: LeaseRequestActionsProps) {
  const [updating, setUpdating] = useState(false)
  const router = useRouter()

  async function updateStatus(newStatus: string) {
    if (newStatus === currentStatus) return
    setUpdating(true)
    try {
      const res = await fetch("/api/admin/lease-requests/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, status: newStatus }),
      })

      if (!res.ok) {
        const body = (await res.json()) as { error?: string }
        throw new Error(body.error ?? "Failed to update status")
      }

      toast.success(`Status updated to ${newStatus}`)
      router.refresh()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Something went wrong"
      )
    } finally {
      setUpdating(false)
    }
  }

  return (
    <select
      value={currentStatus}
      disabled={updating}
      onChange={(e) => updateStatus(e.target.value)}
      className="text-xs border border-border rounded px-2 py-1 bg-background disabled:opacity-50"
    >
      {STATUS_OPTIONS.map((status) => (
        <option key={status} value={status}>
          {status.replace("_", " ")}
        </option>
      ))}
    </select>
  )
}
