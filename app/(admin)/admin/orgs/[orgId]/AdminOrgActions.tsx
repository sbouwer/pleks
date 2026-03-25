"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { activateFoundingAgent, changeTier, startTrial } from "./adminOrgActions.server"

export function AdminOrgActions({
  orgId,
  currentTier,
  currentStatus,
  isFoundingAgent,
  trialEndsAt,
}: {
  orgId: string
  currentTier: string
  currentStatus: string
  isFoundingAgent: boolean
  trialEndsAt: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [newTier, setNewTier] = useState(currentTier)

  const canStartTrial =
    currentTier === "owner" && currentStatus === "active" && trialEndsAt === null

  async function handleActivateFoundingAgent() {
    setLoading("founding")
    try {
      await activateFoundingAgent(orgId)
      toast.success("Founding agent activated")
      router.refresh()
    } catch {
      toast.error("Failed to activate founding agent")
    } finally {
      setLoading(null)
    }
  }

  async function handleStartTrial() {
    setLoading("trial")
    try {
      const result = await startTrial(orgId, "steward")
      if (result.success) {
        toast.success("14-day trial started")
        router.refresh()
      } else {
        toast.error(result.error ?? "Failed to start trial")
      }
    } catch {
      toast.error("Failed to start trial")
    } finally {
      setLoading(null)
    }
  }

  async function handleChangeTier() {
    if (newTier === currentTier) return
    setLoading("tier")
    try {
      await changeTier(orgId, newTier)
      toast.success(`Tier changed to ${newTier}`)
      router.refresh()
    } catch {
      toast.error("Failed to change tier")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      {!isFoundingAgent && (
        <Button variant="outline" disabled={loading === "founding"} onClick={handleActivateFoundingAgent}>
          {loading === "founding" ? "Activating..." : "Activate founding agent"}
        </Button>
      )}

      {canStartTrial && (
        <Button variant="outline" disabled={loading === "trial"} onClick={handleStartTrial}>
          {loading === "trial" ? "Starting..." : "Start 14-day trial"}
        </Button>
      )}

      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Change tier</label>
          <Select value={newTier} onValueChange={(v) => setNewTier(v ?? "owner")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="steward">Steward</SelectItem>
              <SelectItem value="portfolio">Portfolio</SelectItem>
              <SelectItem value="firm">Firm</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" disabled={loading === "tier" || newTier === currentTier} onClick={handleChangeTier}>
          {loading === "tier" ? "Updating..." : "Update"}
        </Button>
      </div>
    </div>
  )
}
