"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { FormSelect } from "@/components/ui/FormSelect"

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
    <FormSelect
      value={currentStatus}
      disabled={updating}
      onValueChange={updateStatus}
      options={STATUS_OPTIONS.map((status) => ({ value: status, label: status.replace("_", " ") }))}
    />
  )
}
